# Notification queue regression checks

From `my-vite-app`, with Node and a JDK on PATH:

```sh
node --test tests/queue.test.mjs
npm run build
```

The Java test compiles the actual parser without Android. JavaScript tests execute the
actual Add All method and transaction POST handler with mocked storage/network calls.
They do not replace an Android build or a real MongoDB unique-index integration test.

## Tracking policy

Automatic tracking uses bank-style credited/debited notifications. Known payment-app
confirmations (Google Pay, PhonePe, Paytm, MobiKwik and Freecharge) are deliberately
excluded. For example, `FRIEND paid you ₹20` has no UPI reference to safely correlate
with a bank SMS. Amount/time matching could merge two separate legitimate payments.
A payment-app-only alert will not be queued; enter it manually if no bank alert arrives.
The parser still understands `paid you` and `sent you` correctly.

MessagingStyle entries and InboxStyle lines are parsed independently. Mixed credit/debit
summaries are skipped. UPI/UTR/RRN references plus direction and amount identify events,
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
