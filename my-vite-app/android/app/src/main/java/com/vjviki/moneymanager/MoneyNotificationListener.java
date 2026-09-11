package com.vjviki.moneymanager;

import android.app.Notification;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class MoneyNotificationListener extends NotificationListenerService {
    private static final String TAG = "MoneyNotification";
    @Override public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "Notification listener connected");
    }
    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        String source = sbn.getPackageName();
        // Bank notifications are authoritative. App confirmations without shared references
        // cannot be reconciled safely by amount/time (two real payments may be identical).
        if (source.equals(getPackageName()) || TransactionParser.isPaymentApp(source)) return;
        Notification notification = sbn.getNotification();
        Bundle extras = notification.extras;
        if (extras == null) return;
        try {
            Parcelable[] bundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (bundles != null && bundles.length > 0) {
                for (Notification.MessagingStyle.Message message : Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles)) {
                    if (message.getText() != null) capture(source, message.getText().toString(), message.getTimestamp());
                }
                return;
            }
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null && lines.length > 0) {
                for (CharSequence line : lines) if (line != null) capture(source, line.toString(), 0);
                return;
            }
            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            CharSequence body = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (body == null || body.length() == 0) body = extras.getCharSequence(Notification.EXTRA_TEXT);
            if (body != null) capture(source, body.toString(), notification.when);
        } catch (RuntimeException error) {
            Log.e(TAG, "Unable to read notification fields", error);
        }
    }
    private void capture(String source, String text, long messageTime) {
        try {
            // Only bank-style postings enter the automatic queue.
            if (!text.matches("(?is).*\\b(?:credited|debited)\\b.*")) return;
            TransactionParser.Payment payment = TransactionParser.parse(text);
            if (payment == null) {
                Log.d(TAG, "Bank message skipped: ambiguous or unsupported format");
                return;
            }
            String identity = TransactionParser.identity(payment, source, text, messageTime);
            JSONObject item = new JSONObject();
            item.put("id", "v2-" + UUID.nameUUIDFromBytes(identity.getBytes(StandardCharsets.UTF_8)));
            item.put("amount", payment.amount);
            item.put("type", payment.type);
            item.put("merchant", payment.merchant);
            item.put("reference", payment.reference);
            item.put("category", TransactionParser.suggestCategory(payment.merchant + " " + text));
            item.put("source", "Bank notification");
            item.put("packageName", source);
            item.put("detectedAt", messageTime > 0 ? messageTime : System.currentTimeMillis());
            boolean added = PendingTransactionStore.enqueue(this, item);
            Log.d(TAG, added ? "Detected transaction queued locally" : "Duplicate detected transaction ignored");
        } catch (Exception error) {
            Log.e(TAG, "Unable to queue detected transaction", error);
        }
    }
}
