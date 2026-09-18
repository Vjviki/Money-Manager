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
