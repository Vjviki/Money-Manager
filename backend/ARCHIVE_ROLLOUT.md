# Safe transaction archiving

The previous reset copied active payments and then deleted all payments for an
account. A concurrent insert could be deleted without a backup. Partial failures
and overlapping resets could also duplicate archives.

This change selects a fixed set of transaction IDs, then copies and deletes only
those records in one MongoDB transaction. Transaction retries retain that selection.
Concurrent edits/deletes conflict with the transaction and are retried by MongoDB.
Concurrent new payments remain active. Errors do not claim that nothing committed:
an acknowledgement can be lost after a successful commit.

Each new frontend archive request sends an Idempotency-Key. A small ArchiveReset
receipt stores its committed count, atomically with the move. The frontend retains
the pending key in localStorage per user until success, including across app restarts.
Retrying it returns the original count without archiving new arrivals. Receipt
records are deliberately not expired: expiring them would allow old retries to
archive new data. No transaction payload or authentication token is stored there.

Archives and detected-payment uploads acquire the same per-user database write
lock (archive_revision). New archives retain source_id and detected_id, preventing
notification retries from recreating payments after archiving. Manual inserts are
not serialized; the fixed selection protects them. Existing archive rows did not
retain notification IDs, so deduplication cannot be recovered for those old rows.

## Visible behavior

- The History button is now “Archive Transactions”. As before, it archives ALL
  active records, regardless of History filters, rather than just one calendar month.
- New archives use the payment date's UTC month, matching the existing server date
  convention, instead of the month in which Reset was pressed.
- Existing archives are untouched, including historical month labels and any old
  duplicates. No speculative historical cleanup is performed.
- History reloads after success, so new arrivals remain visible.
- Legacy clients without a request key retain atomic safety, but cannot get the
  lost-response retry guarantee. Update the frontend/APK with the backend rollout.
- Requests over 10,000 active records fail before moving data. Larger accounts need
  a separate resumable bulk archive design; this guard bounds transaction size.

## Deployment and verification

Requires a replica set (including Atlas); standalone MongoDB is not supported.
Startup awaits the active transaction, archive, reset-receipt and auth indexes.
New unique source_id index is partial, allowing legacy rows without that field.
Deploy backend before the new frontend. Keep a database backup before release.
This patch has not changed the production database, deployed, or merged itself.

Run in backend:

```cmd
npm test
set "MONGO_TEST_URL=mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"
npm run test:archive
set "MONGO_TEST_URL="
```

Use the disposable Docker replica set from the authentication tests, never the
production Atlas URL. The integration suite creates and drops only its uniquely
named archive_test_* database. Without MONGO_TEST_URL it reports SKIP, not validation.
It covers real rollback after inserts, arrivals after selection, simultaneous
same/different-key requests, notification retry races, cross-user isolation,
empty archives, old archive rows and HTTP authentication/key validation.

Run in my-vite-app with a compatible Node version:

```cmd
npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run tests/archive.test.jsx tests/archive-history.test.jsx tests/session.test.jsx tests/detection-status.test.jsx tests/detected-edits.test.jsx
npx --yes --package=node@22 node node_modules/vite/bin/vite.js build
npx --yes --package=node@22 node node_modules/@capacitor/cli/bin/capacitor sync android
```

Then build/install the Android app and use a test account to confirm History,
Analytics, monthly details and Excel export after archiving. Verify two accounts
remain isolated. The reset safety change does not fix email delivery, paginate
queries or remove the existing frontend bundle-size warning.
