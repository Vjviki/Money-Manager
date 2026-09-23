# Registration and session reliability

This is step 1. Monthly-reset data safety, paginated history and query performance are
separate follow-ups. No live production database or deployment was changed.

## Behavior

- Server-side registration validation: bounded strings, valid email shape, supported
  gender, password minimum eight characters and maximum 72 UTF-8 bytes (bcrypt limit).
  Username case sensitivity is preserved for compatibility; whitespace is trimmed.
- Unique username/email indexes initialize before listening. Concurrent duplicate
  registrations return 409; temporary database errors return controlled responses.
- JWT_SECRET is mandatory, at least 32 bytes, and must be generated randomly. Tokens
  expire after one day. JWT algorithm, user ID, expiry and version are verified.
- Legacy documents without token_version are version zero. New tokens work for them;
  password changes atomically increment the version, invalidating every old session.
- Password reset reserves attempts atomically (maximum five), uses crypto.randomInt,
  and consumes the matching code and changes the password in one MongoDB transaction.
  A resend claims its cooldown atomically through the unique user index. Expired codes
  have a TTL index and are rejected before physical TTL cleanup. SMTP failure leaves
  the 60-second cooldown in place; no code is logged. Cooldown uses the generic success
  response to avoid a distinct existing-email response.
- The frontend checks expiry, removes invalid cookies, reacts to authenticated 401s,
  and redirects open protected screens when sessions expire. A stale request cannot
  sign out a newer session; 503 responses do not sign out users. Password changes
  return the user to login. Android/web still use the existing JS-readable cookie
  storage; migrating to a different credential storage design is separate work.

## Rate limits

All windows are 15 minutes: login 200/IP plus 20/username, registration 20/IP,
password recovery 30/IP, password change 10/authenticated account. Responses include
429 and Retry-After. Account limits intentionally also count successful logins.

Counters currently live in one Node process and reset on restart. Before horizontally
scaling, use a shared limiter store. Shared networks can reach per-IP limits; validate
these settings with representative beta usage. Database connections remain pooled by
Mongoose; these tests are not a production capacity benchmark.

## Deployment gates and configuration

1. Verify Render JWT_SECRET exists and is a randomly generated secret at least 32 bytes
   long. The server deliberately refuses startup if absent/short. Do not paste secrets
   into tickets or source. Rotating it signs everybody out.
2. Set TRUST_PROXY_HOPS to the exact trusted reverse-proxy hop count; default 0 is for
   direct connections. For a verified single Render proxy use 1. Do not blindly trust
   forwarded headers or set trust proxy to true. Check client IP separation on staging.
3. Run backend npm ci (adds express-rate-limit). Use the existing replica-set Atlas URI.
   Startup waits for user/reset indexes; existing duplicate data can block index creation
   and must be reviewed, not automatically deleted. No bulk account migration is needed.
4. Run the isolated tests below, including the real MongoDB integration test, and test
   signup/login/recovery email on staging. The integration test uses a fresh auth_test_*
   database and deletes it afterward; provide only a disposable test-cluster URI.
5. Coordinate backend deployment with frontend/APK rollout. All old unversioned tokens
   are rejected immediately; users must sign in again. Old app builds do not correctly
   redirect on revoked tokens, so ship the updated app in the same rollout.
6. Build frontend, run npx cap sync android and build/install the APK as an update.
   Verify a duplicate signup, expiry, password change on two devices, reset email,
   failed network request and adding a detected payment after signing back in.

## Validation

From backend: npm test (seven tests; real bcrypt/JWT and HTTP rate limiting, simulated
user persistence). Includes 100 concurrent login handlers, registration races, legacy
accounts, session invalidation and password-change races.

From my-vite-app:

```sh
npx vitest run tests/session.test.jsx tests/detection-status.test.jsx tests/detected-edits.test.jsx
node --test --test-name-pattern='new payment|failed upload|backend retry' tests/queue.test.mjs
npm run build
npx cap sync android
```

20 React/session tests and three queue/backend checks passed. Production build and
Capacitor sync passed; the existing large-JS-chunk warning remains. Java code is unchanged.

Real database integration (from backend, set MONGO_TEST_URL in your environment first):

```sh
npm run test:integration
```

This checks actual unique indexes, concurrent reset requests, attempt limits, transaction
single-use behavior, legacy accounts and session revocation. It skips without the URI.
It has NOT passed in the implementation environment: the attempted temporary MongoDB
8.0 replica set could not start (open: Operation not permitted). Real MongoDB integration,
SMTP delivery, proxy configuration, load testing and APK/phone verification remain gates.
