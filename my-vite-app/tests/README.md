# Notification queue regression checks

From `my-vite-app`, with Node and a JDK on PATH:

```sh
node --test tests/queue.test.mjs
npx vitest run tests/detection-status.test.jsx
npm run build
```

The Java test compiles the actual parser without Android. JavaScript tests execute the
actual Add All method and transaction POST handler with mocked storage/network calls.
They do not replace an Android build or a real MongoDB unique-index integration test.

## Tracking policy

Automatic tracking uses bank-style transaction notifications, including spent/received wording. Known payment-app
confirmations (Google Pay, PhonePe, Paytm, MobiKwik and Freecharge) are deliberately
excluded. For example, `FRIEND paid you ₹20` has no UPI reference to safely correlate
with a bank SMS. Amount/time matching could merge two separate legitimate payments.
A payment-app-only alert will not be queued; enter it manually if no bank alert arrives.
The parser still understands `paid you` and `sent you` correctly.

MessagingStyle entries and InboxStyle lines are parsed independently. Recognizable flattened
bank histories are split at posting boundaries; unrecognized ambiguous summaries are skipped
and reported in detection status. Help text is removed before failure-word checks. UPI/UTR/RRN references plus direction and amount identify events,
not Android notification keys. Referenceless fallback uses source, message timestamp and
normalized content: it is not guaranteed to deduplicate across different notification styles.
Replay identifiers are retained for 30 days, including after Add/Ignore. Pending rows
are never silently trimmed. Existing legacy rows are preserved; review/ignore old duplicates
once after upgrading because their original text/reference was not stored.

## Deployment and phone verification

1. Deploy the backend change before using the updated APK. It creates a partial unique
   index on `(user_id, detected_id)` and treats duplicate retries as success. Existing
   manual transactions have no detected ID and remain unaffected.
2. Build frontend, run `npx cap sync android`, then build/install the Android APK using
   the existing Android Studio setup. Install as an update; do not clear app data.
3. Verify notification access remains enabled. Disconnect USB and background the app.
4. Using normal payment activity, check one received payment produces one Income entry,
   and a subsequent same-value outgoing payment produces a separate Expenses entry.
5. Check grouped messages, two different references for the same amount, app resume,
   and new arrival while Add All is uploading.
6. Test network interruption/retry: successful entries must not be inserted again.

New events have corrected IDs; already saved duplicate records are not modified.


## Recovery update

The listener scans currently active notifications after Android connects it. Home resume
and the Check again button request a scan when connected or request a rebind when access
is granted but the listener is disconnected. A disconnect schedules a recovery request;
requests are throttled to once per five seconds. Android controls whether rebind succeeds.
The UI reports live connection/access status and the last detection outcome. It does not
log or display raw notification text, account numbers or balances in diagnostics.

This update needs a rebuilt APK, not a new backend deployment if PR #1 is already deployed.
Keep existing app data and notification access. Android APK compilation and real-device
binding/recovery remain release gates; Java parser and mocked React tests do not prove them.

Phone checks:
- With a normal bank notification still present, tap Check again twice: the reference-backed
  payment should appear once, including if it was already added or ignored earlier.
- Turn notification access off: reopen Home and verify the status says access is off.
  Turn it back on and verify the listener connects and scans active notifications.
- Background the app, disconnect USB, and check your next normal bank credit/debit.
- Check a flattened YES BANK credit/debit pair and two distinct same-value credits.
- A failed/pending/reversed payment must not be added. A completed debit with a safety
  footer such as "If not requested by you" should be added.

Dismissed notifications and SMS that never produced accessible notifications cannot be
recovered by this listener. Unsupported formats remain skipped with a visible result;
sharing a redacted missed example allows extending the parser without guessing.

## Editable payment cards

Detected payments now have editable Title and Category fields. Single Add and Add All
use those edits and validate all selected titles before any bulk upload starts. Incoming
native refreshes update the detected payments without overwriting edits. Fields lock
while an Add/Ignore operation runs so the submitted values cannot change mid-upload.

Drafts are saved in localStorage under the authenticated user ID and transaction ID,
restored when Home reopens, and removed after successful Add/Ignore or after the payment
is absent from a successfully fetched queue. Failed uploads retain the remaining drafts.
If browser storage is unavailable, edits remain in memory and a visible warning asks
users to keep Home open. This is local draft storage, not cross-device synchronization
or a remembered recipient category rule.

```sh
npx vitest run tests/detection-status.test.jsx tests/detected-edits.test.jsx
```

This feature changes frontend code only. After merging, pull main, rebuild the frontend,
run `npx cap sync android`, and install the updated APK without clearing data. No backend
or native Java changes are needed. On the phone, edit a payment, leave and reopen Home,
receive another notification, and verify Add/Add All save the chosen title and category.

## Category memory

Detected payment cards offer an unchecked "Remember this category" choice when the
original notification has a known recipient. Opting in learns the selected category
only after a successful transaction POST, including during Add All. Ignore and failed
POSTs never teach a rule. Remembering another category replaces the previous rule.
Without opting in, changing a category affects only that payment.

Rules use the original recipient (trimmed, repeated whitespace collapsed, case-insensitive)
and direction. Punctuation and UPI handles remain distinct; income and expenses are
separate. No fuzzy matching, title-based learning, unknown-recipient learning, or bank
source fallback is used. Suggestions take precedence over parser categories; explicit
drafts take precedence over suggestions. Add All snapshots reviewed payloads before
upload so learning from one row does not recategorise another row mid-batch.

Rules persist per authenticated account in localStorage on this device, with a visible
warning on write failure. They are not cloud-synced and disappear if app data is cleared.
The Remembered categories panel can forget individual rules without changing saved
transactions or explicit pending edits. The checkbox choice is part of the existing
draft persistence. This is frontend-only; no database migration or backend deployment.

Validation for this change: 17 React tests, three JS queue/backend checks, production
build and Capacitor sync passed. The existing Java parser check could not run in the
implementation environment because javac was unavailable; no Java code changed.
An Android APK build and real-phone verification are still required.

Phone acceptance:
1. Choose Food for a known recipient, check Remember and Add. Reopen the app and
   check a later payment to that recipient suggests Food, even if casing differs.
2. Override to Shopping without checking Remember; the next payment still suggests Food.
3. Check Remember with Shopping and Add to replace the rule. Forget it from the panel;
   the next payment falls back to parser categorisation.
4. Verify a different recipient, an Income payment from the same recipient, Unknown,
   and a different signed-in account do not inherit the Expenses rule.
5. Check Add All, an interrupted upload/retry, and closing/reopening before Add.
