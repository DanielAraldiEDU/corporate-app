# FieldOps — corporate-app

An enterprise app for studying mobile device management (MDM).

FieldOps is an Expo / React Native app for field technicians. It shows two things working together:

1. **Secure credential storage**, using real [`expo-secure-store`](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) integration (iOS Keychain and Android Keystore, with optional biometric binding).
2. **Device security policies** (compliance, biometric requirements, remote access revocation, check-ins). A `json-server` mock backend simulates these MDM features.

> **Educational project.** FieldOps does not manage, lock, or wipe the physical device. Enrollment, compliance, policies, and revocation are **simulated** by the mock API. Revocation only revokes access to *this app*.

---

## Stack

| Layer | Technology |
|---|---|
| App | Expo SDK 58, React Native 0.88, React 19, TypeScript (strict) |
| Navigation | Expo Router (file-based routes in `src/app/`, `Stack.Protected` guards, `NativeTabs`) |
| Secure storage | `expo-secure-store` + `expo-local-authentication` (SDK 58) |
| Device info | `expo-device`, `expo-constants` |
| Icons | `expo-symbols` (SF Symbols on iOS, Material Symbols on Android) |
| Mock backend | Node.js + `json-server` 0.17.4 (programmatic API with custom routes and middleware) |
| Tests | Jest (`jest-expo`), `expo-router/testing-library`, `node:test` for the API |

## Project structure

```text
src/
  app/                         Routes only (thin files that re-export screens)
    _layout.tsx                Providers + Stack.Protected auth guard
    sign-in.tsx
    (app)/_layout.tsx          NativeTabs: Dashboard, Work Orders, Security, Settings
    (app)/(home)/              Dashboard stack
    (app)/work-orders/         List + [id] detail
    (app)/security/            Device Security Status
    (app)/settings/            Settings & demo administration
  screens/                     Screen components (auth, dashboard, work-orders, device-security, settings)
  components/                  Reusable UI: ui/button, text-field, section/row, status-badge, banner, state views…
  constants/theme.ts           Design tokens: colors (light/dark), spacing, radius, tones
  contexts/session-context.tsx React binding for the session manager (foreground + periodic check-ins)
  hooks/                       useResource, useProtectedAccess, useTheme
  services/
    api/                       config (base URL), ApiClient (auth + refresh + errors), typed endpoints
    auth/session-manager.ts    Login, restore, refresh, logout, policy enforcement
    secure-store/              expo-secure-store integration + biometric capability (expo-local-authentication)
    device/                    Device report + pure compliance evaluation
  types/api.ts                 API models
mock-api/
  db.json                      Seed data (users, devices, policies, workOrders, auditLogs)
  server.js                    json-server + auth/admin routes + scoping middleware
  test/api.test.js             HTTP endpoint tests
__tests__/                     Jest tests for the app
__mocks__/                     In-memory expo-secure-store / expo-local-authentication doubles (tests only)
test-utils/fake-backend.ts     In-process fake of the mock API for Jest
test-utils/secure-device.ts    Simulated device: enrolled biometrics + secure storage
```

---

## Getting started

### Prerequisites

- **Node.js 22.13+.** React Native 0.88 and Expo SDK 58 require it.
- A **development build**. Biometric binding (`requireAuthentication`) and Face ID need the config plugins in `app.json`, so the app **does not run in Expo Go**. You need one of:
  - Local: Xcode (iOS) or Android Studio (Android), then `npx expo run:ios` / `npx expo run:android`
  - Cloud: [EAS Build](https://docs.expo.dev/develop/development-builds/create-a-build/). `expo-dev-client` is installed. Run `npx eas-cli@latest build:configure` once, then `npx eas-cli@latest build --profile development --platform ios|android`.
- Before building for a physical device, change the placeholder `com.example.fieldops` bundle ID / package in `app.json`.

### 1. Start the mock API

```bash
cd mock-api
npm install
npm start            # http://0.0.0.0:3000; prints the URLs for simulator, emulator and LAN
```

Useful variants:

```bash
npm run dev          # 30-second access tokens, to watch the refresh flow
npm run reset        # restore the seed data (db.json -> data/db.runtime.json)
PORT=3100 ADMIN_API_KEY=my-key npm start
```

json-server writes all changes to `mock-api/data/db.runtime.json` (git-ignored). `db.json` stays a clean seed.

### 2. Configure the API URL (optional)

```bash
cp .env.example .env.local
```

| Target | What works |
|---|---|
| **iOS Simulator** | Auto: Metro host IP, or `http://localhost:3000` |
| **Android Emulator** | Auto: Metro host IP, or `http://10.0.2.2:3000` (`localhost` is the emulator itself) |
| **Physical device** (same Wi-Fi) | Auto: Metro host IP. If that fails, set `EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:3000` |

The resolution logic is in `src/services/api/config.ts`. The sign-in screen footer shows the URL that was resolved. Release builds have no Metro host, so set `EXPO_PUBLIC_API_URL` for them. Android release builds also block cleartext HTTP by default. Debug and development builds allow it.

### 3. Run the app

```bash
npm install
npx expo run:ios        # or: npx expo run:android
# afterwards, for JS changes only:
npx expo start --dev-client
```

---

## Demo credentials

All demo users share the password **`FieldOps!2026`**.

| Email | Device | Policy | What it demonstrates |
|---|---|---|---|
| `maria.alvarez@fieldops.example` | d-2001 (iOS) | **Field Secure** v3: biometrics required, offline blocked | Full biometric flow |
| `james.chen@fieldops.example` | d-2002 (Android) | **Field Standard** v2: biometrics optional, offline allowed | Works on devices without biometrics |
| `priya.nair@fieldops.example` | d-2003 | Field Secure: device **already revoked** | Sign-in blocked with explanation |
| `tom.becker@fieldops.example` | d-2004 | **Quarantine**: `deviceAllowed: false` | Non-compliant device blocked |

The demo has one managed device per employee. The phone that signs in is treated as that employee's enrolled device, and the server records its reported model, OS, and app version.

---

## Demonstration walkthrough

1. `cd mock-api && npm run reset && npm start`
2. Open FieldOps and sign in as **Maria**. Her policy requires biometrics, so FieldOps stores the refresh token with biometric access control and asks for Face ID / fingerprint once to verify it.
3. The **Dashboard** shows the greeting, work-order status tiles, the "Up next" list, and a device security row.
4. Open **Work Orders**, then a work order, to see customer details and the description.
5. Open **Security** (Device Security Status). It shows Managed, Compliant, biometric status, storage backend, policy v3, and the last check-in.
6. Open **Settings → Administration · demo only**, then tap **Simulate remote access revocation** and confirm.
7. Tap **Sync device policy now** in the banner, pull to refresh, or wait for the next check-in (every 30 s, and whenever the app returns to the foreground).
8. FieldOps gets `403 DEVICE_REVOKED`. It immediately leaves the protected area, erases both secure-store entries, and shows **"Access revoked"** on the sign-in screen.
9. Try a protected screen, for example the deep link `fieldops://work-orders/wo-5101`, or sign in again. Access stays blocked: the route guard redirects to sign-in, and the server rejects the login with `DEVICE_REVOKED`.

### Simulate revocation from a terminal (IT admin view)

```bash
# Revoke
curl -X POST http://localhost:3000/admin/devices/d-2001/revoke -H 'X-Admin-Key: fieldops-demo-admin'
# Restore (old sessions stay invalid; the user must sign in again)
curl -X POST http://localhost:3000/admin/devices/d-2001/restore -H 'X-Admin-Key: fieldops-demo-admin'
# Publish a new policy version (e.g. require biometrics for James)
curl -X PATCH http://localhost:3000/admin/policies/pol-standard -H 'X-Admin-Key: fieldops-demo-admin' \
     -H 'Content-Type: application/json' -d '{"requireBiometrics": true}'
```

If a policy starts requiring biometrics while a session has no biometric protection, the next sync ends that session. The user is asked to sign in again so the token can be stored with biometric binding.

---

## Biometric configuration

### iOS
- `NSFaceIDUsageDescription` is set through the `faceIDPermission` option of the `expo-secure-store` and `expo-local-authentication` config plugins in `app.json`. Continuous Native Generation writes it into `Info.plist`. Never edit `ios/` by hand.
- Biometric items use `requireAuthentication: true` (the `biometryCurrentSet` access control) + `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`. They need a device passcode, they never migrate to another device, and they become unreadable if the enrolled Face ID / Touch ID set changes.
- iOS does not prompt when the item is created, so FieldOps reads it back once after saving to prove the binding works.
- **Simulator:** Features → Face ID → **Enrolled**. When prompted, choose **Matching Face** (or Non-matching Face to test failure).

### Android
- `expo-local-authentication` merges in `USE_BIOMETRIC` / `USE_FINGERPRINT`. `allowBackup` is `false` in `app.json`, and the `expo-secure-store` plugin also excludes its data from Auto Backup.
- Biometric items are encrypted with an AES-GCM Keystore key created with `setUserAuthenticationRequired(true)`. BiometricPrompt (Class 3 / `BIOMETRIC_STRONG`) is required for **both encryption and decryption**, so Android also prompts when the token is saved.
- `expo-secure-store` never falls back to non-authenticated storage. FieldOps also checks `canUseBiometricAuthentication()` first and **refuses** to continue when only weak (Class 2) biometrics are enrolled.
- **Emulator:** set a screen lock, then enroll a fingerprint in Settings → Security. Use `adb -e emu finger touch 1` to simulate a touch.

If biometrics are unavailable or not set up, the sign-in and Security screens explain why. When the policy requires biometrics, sign-in is blocked.

---

## Real integrations vs. simulations

| Feature | Real or simulated | Where |
|---|---|---|
| Refresh-token storage in iOS Keychain / Android Keystore | **Real**: `setItemAsync` / `getItemAsync` / `deleteItemAsync` | `src/services/secure-store/secure-credential-store.ts` |
| Biometric binding of the stored token (`requireAuthentication`, `authenticationPrompt`) | **Real**: the OS shows the prompt and releases the secret | same |
| Biometric availability (`supportedAuthenticationTypesAsync`, `isEnrolledAsync`, `getEnrolledLevelAsync`, `canUseBiometricAuthentication`) | **Real** | `src/services/secure-store/biometrics.ts` |
| Access token kept in memory only; refresh on expiry / 401 | **Real** app logic | `src/services/auth/session-manager.ts`, `src/services/api/client.ts` |
| Login, tokens, sessions | **Mock**: opaque random tokens; passwords stored in plain text in `db.json` | `mock-api/server.js` |
| Device enrollment, compliance, policies, policy versions | **Simulated MDM** | `mock-api`, `src/services/device/compliance.ts` |
| Remote access revocation | **Simulated**: revokes app sessions only | `POST /admin/devices/:id/revoke` |
| Admin console | **Simulated**: in-app demo section + `X-Admin-Key` | Settings screen, `/admin/*` |

**Not production-ready (by design):** plain-text passwords, no refresh-token rotation, an in-memory access-token store, a static admin key, and HTTP instead of HTTPS. A real deployment would use an identity provider, short-lived signed tokens with rotation, TLS, and a real MDM / EMM (for example Intune, Jamf, or Android Enterprise) for device attestation.

### Security behaviours

- The refresh token is never written to AsyncStorage or any other plain-text storage. The access token is never persisted at all.
- Passwords and tokens are never logged. The mock API logs only method, path, and status.
- Sign-out ends the server session (`POST /auth/logout`) and erases both secure-store entries.
- Revocation is enforced in two ways: (a) the route guard removes the whole `(app)` group, and (b) every protected screen wraps its data in `ProtectedContent`, which re-checks policy when the screen gains focus.
- The server scopes all data to the signed-in employee. It hides `users` and `sessions`, and a device check-in cannot change management fields such as `accessRevoked`.

---

## Mock API reference

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | Liveness |
| POST | `/auth/login` | none | `{ email, password, device }` → tokens, user, device, policy |
| POST | `/auth/refresh` | none | `{ refreshToken }` → new access token + latest device/policy |
| POST | `/auth/logout` | none | `{ refreshToken }` → 204, session invalidated |
| GET | `/devices/:id` | Bearer | Own device only |
| PATCH | `/devices/:id` | Bearer | Check-in. Only telemetry fields are writable; `lastCheckIn` is set by the server |
| GET | `/policies/:id` | Bearer | Own device policy only |
| GET | `/workOrders`, `/workOrders/:id` | Bearer | Scoped to the employee |
| GET | `/auditLogs` | Bearer | Employee's security events, newest first |
| POST | `/admin/devices/:id/revoke` | Admin key, or Bearer (own device) | Simulate remote revocation |
| POST | `/admin/devices/:id/restore` | Admin key | Undo revocation |
| PATCH | `/admin/policies/:id` | Admin key, or Bearer (own policy) | Change a policy flag; bumps `policyVersion` |

Error codes: `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_REFRESH_TOKEN`, `SESSION_REVOKED`, `DEVICE_REVOKED`, `DEVICE_NOT_ALLOWED`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`.

---

## Validation

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npm test              # Jest: session manager, secure credential store, compliance, config, route guards
npm --prefix mock-api test   # HTTP endpoint tests against a temp copy of db.json
npx expo-doctor
```

| Check | Result |
|---|---|
| `tsc --noEmit` | pass |
| `expo lint` | pass (0 problems) |
| Jest | 37 / 37 tests pass (3 suites) |
| Mock API (`node --test`) | 14 / 14 tests pass |
| `expo-doctor` | 20 / 20 checks pass |
| `expo export --platform ios --platform android` | both JS bundles build (verifies imports and module resolution) |
| Manual `curl` against `npm start` | login, scoped data, revoke → `403 DEVICE_REVOKED`, restore all behave as expected |

Jest covers: successful and failed login, session restoration from secure storage, transparent and reactive token refresh, secure logout, biometric binding and verification, blocked sign-in when biometrics are required but unavailable or canceled, the Android prompt-on-save flow, rejection of weak (Class 2) biometrics, a credential invalidated after a biometric change, a policy that starts requiring biometrics, compliance evaluation, revocation detected by sync or by any request, a non-compliant device, offline enforcement, stale-policy re-verification, and route protection (deep link while signed out, and redirect after revocation).

### Not verified (needs a real iOS / Android runtime)

These checks require launching the app, so they were intentionally not run:

- The real Face ID / Touch ID / BiometricPrompt dialogs, and the exact error messages each platform returns for cancel, lockout, and enrollment changes. `expo-secure-store` exposes no error codes, so FieldOps classifies failures by native message text.
- `getEnrolledLevelAsync` values on specific devices and emulators.
- Rendering, layout, dark mode, Dynamic Type, and NativeTabs appearance on device. No screenshots were taken.
- Networking from simulators, emulators, and physical devices to the mock API (`10.0.2.2`, LAN IP, cleartext HTTP).
- AppState foreground re-checks and the 30-second periodic check-in timer on a live device.
- Native builds (`expo run:*` / EAS) and the generated `Info.plist` / `AndroidManifest.xml` contents.
