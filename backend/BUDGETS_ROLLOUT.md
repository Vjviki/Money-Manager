# Monthly category budgets

Budgets has its own protected tab on desktop and mobile. Users choose a month,
enter an expense category and INR limit, edit that limit or remove the budget.
Saving the same category updates its limit. Category matching ignores surrounding
whitespace and letter case. Limits are independent per month; nothing auto-renews.

Progress shows spent, remaining (or overspent), percentage and a capped progress
bar. Status thresholds: below 80% On track; 80–99.99% Near limit; exactly 100%
Limit reached; above 100% Over budget. These are in-app indicators on Budgets,
not push notifications. Totals refresh on page entry, save/delete, app focus or
visibility, and the Refresh button. They are not a live subscription.

## Backend/data

- Budget collection: one unique user_id/month/category_key tuple; limit stored as
  integer paise. Amount input is numeric, positive, at most two decimals and at
  most INR 1 billion. Category length 1–80, month 2000-01 through 2099-12.
- GET /budgets?month=YYYY-MM reads budgets and expense sums from active and archive
  collections in a single snapshot transaction. Archiving cannot make the same
  payment appear twice or disappear between the two reads.
- PUT /budgets/:month upserts {category, amount}; DELETE /budgets/:month/:id removes
  only an owned budget in that month. Deletion never removes transactions.
- Active payment created_at and archived date determine UTC calendar membership,
  matching the archive's UTC date convention. Income never consumes a budget.
  Historical backup_month labels are not used to determine spending.
- Unparseable older archived dates are omitted and explicitly reported by a warning
  on the page; no database rewrite or guessed date migration is performed. Existing
  historical duplicate archive rows remain as-is and may inflate historical totals.
- Requires a MongoDB replica set/Atlas. Startup awaits Budget.init() and its unique
  index. The other collections, auth and notification/archiving paths stay intact.
- Read aggregations have a 10-second execution limit. Archived dates are currently
  strings, so this scans the account's expense archives to parse and group them.
  Native-date archive migration/index optimization is a later improvement.

## Validation and rollout

Local validation: 16 backend unit tests passed; 32 frontend tests passed; 3 queue
tests passed. Frontend build and syntax/whitespace checks passed. Bundle warning
remains. Automated browser layout inspection was unavailable because the installed
Playwright package has no Chromium binary; confirm mobile layout on the device.

Real MongoDB suite is included but NOT validated in this workspace (skipped without
MONGO_TEST_URL). Use a disposable Docker replica set, never the production URL:

```cmd
cd backend
npm ci
set "MONGO_TEST_URL=mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true"
npm run test:budgets
set "MONGO_TEST_URL="
```

Expected: 4 passed, 0 skipped. It creates/drops a unique budgets_test_* database and
checks concurrent same-category upserts, input validation, month separation, only
expenses counting, archived spending (including across a simultaneous archive),
80/100/over thresholds, account isolation and non-destructive budget deletion.

Frontend, from my-vite-app:

```cmd
npm ci
npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run tests/budgets.test.jsx tests/history-pagination.test.jsx tests/archive.test.jsx tests/archive-history.test.jsx tests/session.test.jsx tests/detection-status.test.jsx tests/detected-edits.test.jsx
npx --yes --package=node@22 node node_modules/vite/bin/vite.js build
```

Deploy backend before frontend/APK. Sync/build Android after merge and use a test
account: budget Food INR 1,000; expenses INR 800, then 200, then 10. Check each status,
archive and confirm the total stays INR 1,010. Check another month and account, edit
the limit, and remove the budget while retaining payment history. This feature does
not address the deferred password-recovery email delivery issue.
