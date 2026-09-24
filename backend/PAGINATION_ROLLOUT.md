# Paginated History and database summaries

Updated History requests 20 active transactions per page. Search (title/category),
type, category and date filters run in MongoDB before paging. Home requests only
five recent payments. Profile obtains its full active transaction count from the
summary response rather than downloading transaction records. The summary uses a
database aggregation for income, expenses, balance and transactionCount.

## API

`GET /transactions?page=1&limit=20&categories=1`

- Authenticated account scope is mandatory and cannot be overridden by queries.
- page: positive integer up to 1,000,000; limit: 1–100 (default 20).
- q: literal case-insensitive substring in title or category, at most 200 characters.
- type: Income or Expenses; category: trimmed, case-insensitive exact label.
- from: inclusive UTC ISO instant; to: exclusive UTC ISO instant. The app converts
  its local date-picker boundaries to these instants, including the whole end day.
- categories=1 includes normalized category labels across the account's active
  records, independent of the current page and filters.
- Response: transactions, total (matching records), page, limit, totalPages,
  plus categories when requested. Empty results use page 1 / totalPages 1.
- Sort: created_at descending, then _id descending. Requests past the final page
  clamp to the last page. Edit/delete/archive refresh the list and totals.
- Invalid inputs return 400; query failures/timeouts return controlled 503 errors.

Requests with NO query parameters retain the complete-list response for older
installed apps, including the old MoneyManager component. This compatibility path
is intentionally not silently truncated. Retire it after old clients are migrated.
Deploy the backend before distributing the new frontend/APK.

## Performance and limits

Two account-prefixed compound indexes cover date ordering and type/date ordering.
Existing startup Transaction.init() awaits their creation. These indexes take
additional database space; this change reduces transfer and Node/browser memory,
not the storage occupied by transaction records. Exact counts, category options,
summaries and case-insensitive substring searches still examine account records.
Queries use a 10-second database execution limit.

Offset pagination supports the existing page-number UI. High offsets become more
expensive; cursor pagination is a future option for much larger datasets. Counts
and page reads are separate operations, not a snapshot across requests. Concurrent
inserts/deletes may shift page boundaries; refresh reflects the latest state.
Archive detail queries and Excel export are not paginated in this change.

## Validation

Local checks passed: 13 backend auth/archive/query unit tests, 27 frontend tests,
3 notification queue tests, frontend production build, syntax and whitespace checks.
Existing bundle-size warning remains.

The real query integration suite is SKIPPED without a disposable replica set and
must pass before merge/deployment. It seeds 45 payments plus a second account and
checks page boundaries, stable order, literal search, combined filters, date bounds,
category options, isolation, totals, backward compatibility, empty accounts and
indexed document examination. No production database was accessed.

Windows CMD, inside the new test checkout's backend directory:

```cmd
npm ci
npm test
set "MONGO_TEST_URL=mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"
npm run test:queries
set "MONGO_TEST_URL="
```

Use the existing disposable Docker replica set; never use the production Atlas
connection string. The suite creates and drops a unique queries_test_* database.
Expected query suite: 4 passed, 0 skipped.

Frontend checks (my-vite-app):

```cmd
npm ci
npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run tests/history-pagination.test.jsx tests/archive.test.jsx tests/archive-history.test.jsx tests/session.test.jsx tests/detection-status.test.jsx tests/detected-edits.test.jsx
npx --yes --package=node@22 node node_modules/vite/bin/vite.js build
```

Then sync/build the Android app and verify a test account with more than 20 active
payments: next/previous pages, filters/search, edits, deleting a final-page record,
archiving, Home recent payments and Profile's full transaction count.
