const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp, SEED_FILE } = require('../server');

const MARIA = { email: 'maria.alvarez@fieldops.example', password: 'FieldOps!2026' };
const JAMES = { email: 'james.chen@fieldops.example', password: 'FieldOps!2026' };
const DEVICE_INFO = { platform: 'ios', osVersion: '19.1', appVersion: '1.0.0', model: 'iPhone 17' };
const ADMIN_KEY = 'test-admin-key';

let server;
let baseUrl;
let tmpDir;

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fieldops-api-'));
  const dbFile = path.join(tmpDir, 'db.json');
  fs.copyFileSync(SEED_FILE, dbFile);
  const { app } = createApp({ dbFile, logRequests: false, adminKey: ADMIN_KEY, accessTokenTtlSeconds: 2 });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function call(method, urlPath, { body, token, headers = {} } = {}) {
  const res = await fetch(baseUrl + urlPath, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const login = (creds) => call('POST', '/auth/login', { body: { ...creds, device: DEVICE_INFO } });

test('login succeeds with demo credentials and never returns the password', async () => {
  const res = await login(JAMES);
  assert.equal(res.status, 200);
  assert.ok(res.body.accessToken);
  assert.ok(res.body.refreshToken);
  assert.equal(res.body.accessTokenExpiresIn, 2);
  assert.equal(res.body.user.id, 'u-1002');
  assert.equal(res.body.user.password, undefined);
  assert.equal(res.body.device.id, 'd-2002');
  assert.equal(res.body.policy.requireBiometrics, false);
});

test('login fails with a wrong password', async () => {
  const res = await login({ ...JAMES, password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('login is blocked for a revoked device and for a non-compliant device', async () => {
  const revoked = await login({ email: 'priya.nair@fieldops.example', password: 'FieldOps!2026' });
  assert.equal(revoked.status, 403);
  assert.equal(revoked.body.error.code, 'DEVICE_REVOKED');
  const quarantined = await login({ email: 'tom.becker@fieldops.example', password: 'FieldOps!2026' });
  assert.equal(quarantined.status, 403);
  assert.equal(quarantined.body.error.code, 'DEVICE_NOT_ALLOWED');
});

test('protected resources require a bearer token', async () => {
  const res = await call('GET', '/workOrders');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('users and sessions collections are never exposed', async () => {
  const { body } = await login(JAMES);
  for (const p of ['/users', '/sessions', '/users/u-1001']) {
    const res = await call('GET', p, { token: body.accessToken });
    assert.equal(res.status, 404, p);
  }
});

test('work orders and audit logs are scoped to the signed-in employee', async () => {
  const { body } = await login(JAMES);
  const orders = await call('GET', '/workOrders', { token: body.accessToken });
  assert.equal(orders.status, 200);
  assert.ok(orders.body.length > 0);
  assert.ok(orders.body.every((o) => o.assignedEmployeeId === 'u-1002'));
  // Query-string override attempts are ignored.
  const spoof = await call('GET', '/workOrders?assignedEmployeeId=u-1001', { token: body.accessToken });
  assert.ok(spoof.body.every((o) => o.assignedEmployeeId === 'u-1002'));
  const foreign = await call('GET', '/workOrders/wo-5101', { token: body.accessToken });
  assert.equal(foreign.status, 404);
  const logs = await call('GET', '/auditLogs', { token: body.accessToken });
  assert.ok(logs.body.every((l) => l.employeeId === 'u-1002'));
});

test('device and policy endpoints only serve the caller’s own device', async () => {
  const { body } = await login(JAMES);
  const own = await call('GET', '/devices/d-2002', { token: body.accessToken });
  assert.equal(own.status, 200);
  const other = await call('GET', '/devices/d-2001', { token: body.accessToken });
  assert.equal(other.status, 403);
  const policy = await call('GET', '/policies/pol-standard', { token: body.accessToken });
  assert.equal(policy.status, 200);
  assert.equal(policy.body.policyVersion, 2);
  const otherPolicy = await call('GET', '/policies/pol-secure', { token: body.accessToken });
  assert.equal(otherPolicy.status, 403);
});

test('device check-in (PATCH) cannot modify management fields', async () => {
  const { body } = await login(JAMES);
  const res = await call('PATCH', '/devices/d-2002', {
    token: body.accessToken,
    body: { appVersion: '1.0.1', biometricsEnrolled: true, accessRevoked: true, policyId: 'pol-quarantine', checkInReason: 'manual' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.appVersion, '1.0.1');
  assert.equal(res.body.biometricsEnrolled, true);
  assert.equal(res.body.accessRevoked, false);
  assert.equal(res.body.policyId, 'pol-standard');
  assert.ok(Date.now() - Date.parse(res.body.lastCheckIn) < 5000);
});

test('expired access token returns TOKEN_EXPIRED and refresh issues a new one', async () => {
  const { body } = await login(JAMES);
  await new Promise((r) => setTimeout(r, 2100));
  const expired = await call('GET', '/workOrders', { token: body.accessToken });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'TOKEN_EXPIRED');
  const refreshed = await call('POST', '/auth/refresh', { body: { refreshToken: body.refreshToken } });
  assert.equal(refreshed.status, 200);
  assert.notEqual(refreshed.body.accessToken, body.accessToken);
  const ok = await call('GET', '/workOrders', { token: refreshed.body.accessToken });
  assert.equal(ok.status, 200);
});

test('logout invalidates the refresh token and access token', async () => {
  const { body } = await login(JAMES);
  const out = await call('POST', '/auth/logout', { body: { refreshToken: body.refreshToken } });
  assert.equal(out.status, 204);
  const refresh = await call('POST', '/auth/refresh', { body: { refreshToken: body.refreshToken } });
  assert.equal(refresh.status, 401);
  assert.equal(refresh.body.error.code, 'INVALID_REFRESH_TOKEN');
  const res = await call('GET', '/workOrders', { token: body.accessToken });
  assert.equal(res.status, 401);
});

test('in-app admin demo can only revoke its own device', async () => {
  const { body } = await login(JAMES);
  const res = await call('POST', '/admin/devices/d-2001/revoke', { token: body.accessToken });
  assert.equal(res.status, 403);
});

test('remote revocation blocks resources, refresh and future logins until restored', async () => {
  const { body } = await login(MARIA);
  const revoke = await call('POST', '/admin/devices/d-2001/revoke', { token: body.accessToken });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.body.device.accessRevoked, true);

  const resource = await call('GET', '/devices/d-2001', { token: body.accessToken });
  assert.equal(resource.status, 403);
  assert.equal(resource.body.error.code, 'DEVICE_REVOKED');
  const refresh = await call('POST', '/auth/refresh', { body: { refreshToken: body.refreshToken } });
  assert.equal(refresh.body.error.code, 'DEVICE_REVOKED');
  const relogin = await login(MARIA);
  assert.equal(relogin.body.error.code, 'DEVICE_REVOKED');

  const noKey = await call('POST', '/admin/devices/d-2001/restore');
  assert.equal(noKey.status, 401);
  const restore = await call('POST', '/admin/devices/d-2001/restore', { headers: { 'X-Admin-Key': ADMIN_KEY } });
  assert.equal(restore.status, 200);
  // Restoring the device does not resurrect the old session.
  const oldRefresh = await call('POST', '/auth/refresh', { body: { refreshToken: body.refreshToken } });
  assert.equal(oldRefresh.body.error.code, 'INVALID_REFRESH_TOKEN');
  assert.equal((await login(MARIA)).status, 200);

  const logs = await call('GET', '/auditLogs', { token: (await login(MARIA)).body.accessToken });
  const actions = logs.body.map((l) => l.action);
  assert.ok(actions.includes('ACCESS_REVOKED'));
  assert.ok(actions.includes('ACCESS_RESTORED'));
});

test('admin policy update bumps the policy version', async () => {
  const res = await call('PATCH', '/admin/policies/pol-standard', {
    headers: { 'X-Admin-Key': ADMIN_KEY },
    body: { requireBiometrics: true },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.policy.requireBiometrics, true);
  assert.equal(res.body.policy.policyVersion, 3);
});

test('resources are read-only apart from device check-in', async () => {
  const { body } = await login(JAMES);
  const res = await call('DELETE', '/workOrders/wo-5201', { token: body.accessToken });
  assert.equal(res.status, 405);
});
