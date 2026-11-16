/**
 * FieldOps mock API — DEMONSTRATION ONLY.
 *
 * json-server owns the JSON persistence and the REST resources (devices, policies,
 * workOrders, auditLogs). The custom routes and middleware below add what json-server
 * does not provide: mock authentication, per-employee data scoping, simulated MDM
 * policy enforcement, and administrative actions such as remote access revocation.
 *
 * Nothing here is production security: passwords are stored in plain text in db.json,
 * tokens are opaque random strings kept in memory/JSON, and "admin" actions are
 * protected only by a demo key. Do not reuse this code for a real backend.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jsonServer = require('json-server');

const SEED_FILE = path.join(__dirname, 'db.json');
const RUNTIME_FILE = path.join(__dirname, 'data', 'db.runtime.json');

const DEFAULTS = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS) || 300,
  adminKey: process.env.ADMIN_API_KEY || 'fieldops-demo-admin',
  defaultPolicyId: process.env.DEFAULT_POLICY_ID || 'pol-secure',
};

/** Copies the pristine seed (db.json) to the runtime file json-server writes to. */
function resetRuntimeDb(target = RUNTIME_FILE) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(SEED_FILE, target);
  return target;
}

function ensureRuntimeDb(target = RUNTIME_FILE) {
  if (!fs.existsSync(target)) resetRuntimeDb(target);
  return target;
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const newId = (prefix) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();

function safeEqual(a, b) {
  return crypto.timingSafeEqual(Buffer.from(sha256(a), 'hex'), Buffer.from(sha256(b), 'hex'));
}

function sendError(res, status, code, message) {
  res.status(status).json({ error: { code, message } });
}

function publicUser(user) {
  if (!user) return null;
  const { password: _password, ...rest } = user;
  return rest;
}

/**
 * Builds the Express app. Exported so tests can run it against a temporary db file.
 */
function createApp(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const dbFile = config.dbFile || ensureRuntimeDb();
  const router = jsonServer.router(dbFile);
  const db = router.db; // lowdb instance backing json-server
  const app = jsonServer.create();

  // Access tokens live in memory only: restarting the server expires them, which
  // conveniently exercises the client's refresh-token flow.
  const accessTokens = new Map(); // sha256(token) -> { sessionId, expiresAt }

  app.use(jsonServer.defaults({ logger: false, static: path.join(__dirname, 'public') }));
  app.use(jsonServer.bodyParser);

  if (config.logRequests !== false) {
    // Minimal logger: method, path, status. Never logs headers or bodies (tokens/passwords).
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - started} ms)`);
      });
      next();
    });
  }

  // ---------------------------------------------------------------- helpers
  const findUser = (id) => db.get('users').find({ id }).value();
  const findDevice = (id) => db.get('devices').find({ id }).value();
  const findPolicy = (id) => db.get('policies').find({ id }).value();

  function audit(employeeId, deviceId, action, description) {
    db.get('auditLogs')
      .push({ id: newId('al'), employeeId, deviceId, action, timestamp: nowIso(), description })
      .write();
  }

  /** MDM enforcement: returns a denial when the device may not access corporate data. */
  function deviceDenial(device, policy) {
    if (!device) return { status: 403, code: 'DEVICE_NOT_ENROLLED', message: 'This device is not enrolled in FieldOps device management.' };
    if (device.accessRevoked) {
      return {
        status: 403,
        code: 'DEVICE_REVOKED',
        message: 'Your administrator revoked FieldOps access for this device. Contact IT support to restore access.',
      };
    }
    if (!policy || !policy.deviceAllowed) {
      return {
        status: 403,
        code: 'DEVICE_NOT_ALLOWED',
        message: 'This device does not meet the security policy required to access corporate resources.',
      };
    }
    return null;
  }

  function issueAccessToken(sessionId) {
    const token = randomToken();
    accessTokens.set(sha256(token), {
      sessionId,
      expiresAt: Date.now() + config.accessTokenTtlSeconds * 1000,
    });
    return { accessToken: token, accessTokenExpiresIn: config.accessTokenTtlSeconds };
  }

  function revokeSession(sessionId) {
    db.get('sessions').find({ id: sessionId }).assign({ revokedAt: nowIso() }).write();
    for (const [key, entry] of accessTokens) {
      if (entry.sessionId === sessionId) accessTokens.delete(key);
    }
  }

  /**
   * Ends every session of a device. In-memory access tokens are intentionally kept until they
   * expire so the next request reports DEVICE_REVOKED (a clear reason the app can show)
   * instead of a generic INVALID_TOKEN. authenticate() checks the device before the session.
   */
  function revokeDeviceSessions(deviceId) {
    db.get('sessions')
      .filter((s) => s.deviceId === deviceId && !s.revokedAt)
      .each((s) => {
        s.revokedAt = nowIso();
      })
      .write();
  }

  /** Resolves the Bearer token to { session, user, device, policy } or an error descriptor. */
  function authenticate(req) {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return { error: { status: 401, code: 'AUTH_REQUIRED', message: 'Authentication required.' } };
    const key = sha256(match[1]);
    const entry = accessTokens.get(key);
    if (!entry) return { error: { status: 401, code: 'INVALID_TOKEN', message: 'Access token is invalid.' } };
    if (entry.expiresAt <= Date.now()) {
      accessTokens.delete(key);
      return { error: { status: 401, code: 'TOKEN_EXPIRED', message: 'Access token expired.' } };
    }
    const session = db.get('sessions').find({ id: entry.sessionId }).value();
    const device = session && findDevice(session.deviceId);
    const policy = device && findPolicy(device.policyId);
    // Device state is checked before session state so a revoked device always
    // reports DEVICE_REVOKED, even though revocation also ends its sessions.
    const denial = session && deviceDenial(device, policy);
    if (denial) return { error: denial };
    if (!session || session.revokedAt) {
      return { error: { status: 401, code: 'SESSION_REVOKED', message: 'Your session has ended. Sign in again.' } };
    }
    return { session, user: findUser(session.userId), device, policy };
  }

  function requireAuth(req, res, next) {
    const result = authenticate(req);
    if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
    req.auth = result;
    next();
  }

  /**
   * Demo admin access: either the X-Admin-Key header (any device — used from curl), or an
   * authenticated employee acting on their *own* device (used by the in-app demo screen).
   */
  function requireAdmin(req, res, next) {
    const key = req.get('x-admin-key');
    if (key && safeEqual(key, config.adminKey)) {
      req.admin = { actor: 'IT administrator (demo admin key)', scopeDeviceId: null };
      return next();
    }
    const result = authenticate(req);
    if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message);
    req.auth = result;
    req.admin = { actor: `${result.user.name} via in-app admin demo`, scopeDeviceId: result.device.id };
    next();
  }

  // ---------------------------------------------------------------- public routes
  app.get('/health', (_req, res) => res.json({ status: 'ok', time: nowIso() }));

  app.post('/auth/login', (req, res) => {
    const { email, password, device: deviceInfo = {} } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Email and password are required.');
    }
    const user = db.get('users').find((u) => u.email.toLowerCase() === email.trim().toLowerCase()).value();
    if (!user || !safeEqual(password, user.password)) {
      if (user) audit(user.id, null, 'LOGIN_FAILED', 'Sign-in failed: incorrect password.');
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    }

    // Simulated enrollment: one managed device per employee in this demo. The phone that
    // signs in is treated as that managed device; its reported metadata is recorded.
    let device = db.get('devices').find({ employeeId: user.id }).value();
    if (!device) {
      const policy = findPolicy(config.defaultPolicyId);
      device = {
        id: newId('d'),
        employeeId: user.id,
        deviceName: `FieldOps ${deviceInfo.model || 'Device'}`,
        platform: deviceInfo.platform || 'unknown',
        osVersion: deviceInfo.osVersion || null,
        appVersion: deviceInfo.appVersion || null,
        managed: true,
        status: 'active',
        enrolledAt: nowIso(),
        lastCheckIn: null,
        policyId: config.defaultPolicyId,
        policyVersion: policy ? policy.policyVersion : 0,
        accessRevoked: false,
        biometricsEnrolled: null,
        secureStorage: null,
      };
      db.get('devices').push(device).write();
      audit(user.id, device.id, 'DEVICE_ENROLLED', `Device enrolled and assigned policy ${policy ? policy.name : config.defaultPolicyId}.`);
    }

    const policy = findPolicy(device.policyId);
    const denial = deviceDenial(device, policy);
    if (denial) {
      audit(user.id, device.id, 'LOGIN_BLOCKED', `Sign-in blocked: ${denial.code}.`);
      return sendError(res, denial.status, denial.code, denial.message);
    }

    const refreshToken = randomToken();
    const session = {
      id: newId('s'),
      userId: user.id,
      deviceId: device.id,
      refreshTokenHash: sha256(refreshToken),
      createdAt: nowIso(),
      revokedAt: null,
    };
    db.get('sessions').push(session).write();

    const updated = db
      .get('devices')
      .find({ id: device.id })
      .assign(pickDeviceReport(deviceInfo), { lastCheckIn: nowIso(), policyVersion: policy.policyVersion })
      .write();
    audit(user.id, device.id, 'LOGIN_SUCCESS', `Signed in on ${deviceInfo.model || updated.deviceName}.`);

    res.json({
      ...issueAccessToken(session.id),
      refreshToken,
      user: publicUser(user),
      device: updated,
      policy,
    });
  });

  app.post('/auth/refresh', (req, res) => {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Refresh token is required.');
    }
    const session = db.get('sessions').find({ refreshTokenHash: sha256(refreshToken) }).value();
    if (!session) return sendError(res, 401, 'INVALID_REFRESH_TOKEN', 'Your session is no longer valid. Sign in again.');
    const device = findDevice(session.deviceId);
    const policy = device && findPolicy(device.policyId);
    const denial = deviceDenial(device, policy);
    if (denial) {
      if (!session.revokedAt) revokeSession(session.id);
      return sendError(res, denial.status, denial.code, denial.message);
    }
    if (session.revokedAt) return sendError(res, 401, 'INVALID_REFRESH_TOKEN', 'Your session is no longer valid. Sign in again.');

    res.json({
      ...issueAccessToken(session.id),
      user: publicUser(findUser(session.userId)),
      device,
      policy,
    });
  });

  app.post('/auth/logout', (req, res) => {
    const { refreshToken } = req.body || {};
    let session = null;
    if (typeof refreshToken === 'string' && refreshToken) {
      session = db.get('sessions').find({ refreshTokenHash: sha256(refreshToken) }).value();
    } else {
      const header = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
      const entry = header && accessTokens.get(sha256(header));
      session = entry && db.get('sessions').find({ id: entry.sessionId }).value();
    }
    if (session && !session.revokedAt) {
      revokeSession(session.id);
      audit(session.userId, session.deviceId, 'LOGOUT', 'Signed out. Session invalidated on the server.');
    }
    res.status(204).end(); // idempotent: unknown or already-revoked sessions also succeed
  });

  // ---------------------------------------------------------------- admin (demo) routes
  app.post('/admin/devices/:id/revoke', requireAdmin, (req, res) => {
    const device = findDevice(req.params.id);
    if (!device) return sendError(res, 404, 'NOT_FOUND', 'Device not found.');
    if (req.admin.scopeDeviceId && req.admin.scopeDeviceId !== device.id) {
      return sendError(res, 403, 'FORBIDDEN', 'The in-app demo can only revoke its own device.');
    }
    const updated = db.get('devices').find({ id: device.id }).assign({ accessRevoked: true, status: 'revoked' }).write();
    revokeDeviceSessions(device.id);
    audit(device.employeeId, device.id, 'ACCESS_REVOKED', `Remote access revocation issued by ${req.admin.actor}. App sessions invalidated.`);
    res.json({ device: updated });
  });

  app.post('/admin/devices/:id/restore', requireAdmin, (req, res) => {
    // Restoration is only meaningful from the admin key: a revoked device cannot authenticate.
    const device = findDevice(req.params.id);
    if (!device) return sendError(res, 404, 'NOT_FOUND', 'Device not found.');
    const updated = db.get('devices').find({ id: device.id }).assign({ accessRevoked: false, status: 'active' }).write();
    audit(device.employeeId, device.id, 'ACCESS_RESTORED', `Access restored by ${req.admin.actor}.`);
    res.json({ device: updated });
  });

  app.patch('/admin/policies/:id', requireAdmin, (req, res) => {
    const policy = findPolicy(req.params.id);
    if (!policy) return sendError(res, 404, 'NOT_FOUND', 'Policy not found.');
    if (req.admin.scopeDeviceId && req.auth.device.policyId !== policy.id) {
      return sendError(res, 403, 'FORBIDDEN', 'The in-app demo can only change its own device policy.');
    }
    const changes = {};
    for (const key of ['deviceAllowed', 'requireBiometrics', 'allowOfflineAccess']) {
      if (typeof req.body?.[key] === 'boolean') changes[key] = req.body[key];
    }
    if (Object.keys(changes).length === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Provide deviceAllowed, requireBiometrics or allowOfflineAccess.');
    }
    const updated = db
      .get('policies')
      .find({ id: policy.id })
      .assign(changes, { policyVersion: policy.policyVersion + 1, updatedAt: nowIso() })
      .write();
    db.get('devices')
      .filter({ policyId: policy.id })
      .value()
      .forEach((d) =>
        audit(d.employeeId, d.id, 'POLICY_UPDATED', `Policy ${updated.name} updated to version ${updated.policyVersion}: ${JSON.stringify(changes)}.`),
      );
    res.json({ policy: updated });
  });

  // ---------------------------------------------------------------- protected REST resources
  const READABLE = new Set(['devices', 'policies', 'workOrders', 'auditLogs']);

  app.use(requireAuth, (req, res, next) => {
    const [, resource, id, extra] = req.path.split('/');
    const { user, device } = req.auth;

    if (!READABLE.has(resource) || extra !== undefined) {
      return sendError(res, 404, 'NOT_FOUND', 'Resource not found.');
    }
    const isPatchOwnDevice = req.method === 'PATCH' && resource === 'devices' && id;
    if (req.method !== 'GET' && !isPatchOwnDevice) {
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'This mock resource is read-only.');
    }

    switch (resource) {
      case 'devices': {
        if (!id) {
          req.query.employeeId = user.id;
          break;
        }
        if (id !== device.id) return sendError(res, 403, 'FORBIDDEN', 'You can only access your own device.');
        if (req.method === 'PATCH') {
          // Device check-in: only self-reported telemetry is writable. Management fields
          // (accessRevoked, status, policyId, managed) can only change via admin routes.
          const reason = req.body?.checkInReason;
          req.body = {
            ...pickDeviceReport(req.body || {}),
            lastCheckIn: nowIso(),
            policyVersion: req.auth.policy.policyVersion,
          };
          if (reason === 'manual') audit(user.id, device.id, 'DEVICE_SYNC', 'Manual device check-in and policy sync.');
        }
        break;
      }
      case 'policies': {
        if (!id) {
          req.query.id = device.policyId;
          break;
        }
        if (id !== device.policyId) return sendError(res, 403, 'FORBIDDEN', 'You can only access your device policy.');
        break;
      }
      case 'workOrders': {
        if (!id) {
          req.query.assignedEmployeeId = user.id;
          break;
        }
        const order = db.get('workOrders').find({ id }).value();
        if (!order || order.assignedEmployeeId !== user.id) return sendError(res, 404, 'NOT_FOUND', 'Work order not found.');
        break;
      }
      case 'auditLogs': {
        if (!id) {
          req.query.employeeId = user.id;
          req.query._sort = req.query._sort || 'timestamp';
          req.query._order = req.query._order || 'desc';
          break;
        }
        const log = db.get('auditLogs').find({ id }).value();
        if (!log || log.employeeId !== user.id) return sendError(res, 404, 'NOT_FOUND', 'Audit log not found.');
        break;
      }
    }
    next();
  });

  app.use(router);

  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err.message);
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error.');
  });

  return { app, db, config };
}

function pickDeviceReport(info) {
  const out = {};
  for (const key of ['platform', 'osVersion', 'appVersion', 'model']) {
    if (typeof info[key] === 'string' && info[key].length <= 64) out[key] = info[key];
  }
  if (typeof info.biometricsEnrolled === 'boolean') out.biometricsEnrolled = info.biometricsEnrolled;
  if (typeof info.secureStorage === 'string' && info.secureStorage.length <= 64) out.secureStorage = info.secureStorage;
  return out;
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

if (require.main === module) {
  if (process.argv.includes('--reset-only')) {
    resetRuntimeDb();
    console.log(`Mock database reset from db.json -> ${path.relative(__dirname, RUNTIME_FILE)}`);
    process.exit(0);
  }
  const { app, config } = createApp();
  app.listen(config.port, config.host, () => {
    console.log('\nFieldOps mock API (demo only)');
    console.log(`  Local:            http://localhost:${config.port}`);
    console.log(`  Android emulator: http://10.0.2.2:${config.port}`);
    for (const ip of lanAddresses()) console.log(`  Physical device:  http://${ip}:${config.port}`);
    console.log(`  Access token TTL: ${config.accessTokenTtlSeconds}s`);
    console.log(`  Data file:        ${path.relative(__dirname, RUNTIME_FILE)} (npm run reset to restore seed)\n`);
  });
}

module.exports = { createApp, resetRuntimeDb, SEED_FILE };
