package com.vjviki.moneymanager;

import android.app.Notification;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Parcelable;
import android.os.SystemClock;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public class MoneyNotificationListener extends NotificationListenerService {
    private static final String TAG = "MoneyNotification";
    private static volatile MoneyNotificationListener connectedService;
    private static long lastRecoveryAt = -10000;
    public static boolean isConnected() { return connectedService != null; }

    /** Requests only; Android controls whether/when the binding succeeds. Main-thread only. */
    static void recover(Context context) {
        if (!DetectionStatus.hasAccess(context)) {
            DetectionStatus.record(context, "Notification access is disabled");
            return;
        }
        long now = SystemClock.elapsedRealtime();
        if (now - lastRecoveryAt < 5000) return;
        lastRecoveryAt = now;
        MoneyNotificationListener service = connectedService;
        if (service != null) service.scanActive();
        else {
            DetectionStatus.record(context, "Waiting for Android to connect the listener");
            try { requestRebind(new ComponentName(context, MoneyNotificationListener.class)); }
            catch (RuntimeException error) {
                DetectionStatus.record(context, "Unable to request listener reconnection");
                Log.e(TAG, "Rebind request failed", error);
            }
        }
    }
    @Override public void onListenerConnected() {
        super.onListenerConnected();
        connectedService = this;
        DetectionStatus.record(this, "Listener connected");
        scanActive();
    }
    @Override public void onListenerDisconnected() {
        super.onListenerDisconnected();
        connectedService = null;
        DetectionStatus.record(this, "Listener disconnected; reconnection requested");
        Context context = getApplicationContext();
        new Handler(Looper.getMainLooper()).postDelayed(() -> recover(context), 5000);
    }
    @Override public void onDestroy() {
        if (connectedService == this) connectedService = null;
        super.onDestroy();
    }
    private void scanActive() {
        if (connectedService != this) return;
        try {
            StatusBarNotification[] notifications = getActiveNotifications();
            if (notifications != null) for (StatusBarNotification notification : notifications) process(notification);
        } catch (RuntimeException error) {
            DetectionStatus.record(this, "Unable to scan active notifications; retry after reconnecting");
            Log.e(TAG, "Active notification scan failed", error);
        }
    }
    @Override public void onNotificationPosted(StatusBarNotification sbn) { process(sbn); }
    private void process(StatusBarNotification sbn) {
        if (sbn == null || sbn.getNotification() == null) return;
        String source = sbn.getPackageName();
        if (source.equals(getPackageName())) return;
        if (TransactionParser.isPaymentApp(source)) {
            DetectionStatus.record(this, "Payment-app confirmation excluded; waiting for bank notification");
            return;
        }
        Bundle extras = sbn.getNotification().extras;
        if (extras == null) return;
        try {
            Parcelable[] bundles = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (bundles != null && bundles.length > 0) {
                boolean hasText = false;
                for (Notification.MessagingStyle.Message message : Notification.MessagingStyle.Message.getMessagesFromBundleArray(bundles)) {
                    if (message.getText() != null && message.getText().length() > 0) {
                        hasText = true;
                        capture(source, message.getText().toString(), message.getTimestamp());
                    }
                }
                if (hasText) return;
            }
            CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null && lines.length > 0) {
                boolean hasText = false;
                for (CharSequence line : lines) if (line != null && line.length() > 0) {
                    hasText = true;
                    capture(source, line.toString(), 0);
                }
                if (hasText) return;
            }
            Notification notification = sbn.getNotification();
            String title = string(extras.getCharSequence(Notification.EXTRA_TITLE));
            String body = string(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
            if (body.isEmpty()) body = string(extras.getCharSequence(Notification.EXTRA_TEXT));
            // Do not mix a summary title (often the latest message) into message history.
            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) == 0)
                body = TransactionParser.withTitle(title, body);
            if (!body.isEmpty()) capture(source, body, notification.when);
        } catch (RuntimeException error) {
            DetectionStatus.record(this, "Unable to read notification layout");
            Log.e(TAG, "Unable to read notification fields", error);
        }
    }
    private static String string(CharSequence value) { return value == null ? "" : value.toString(); }
    private void capture(String source, String text, long messageTime) {
        for (String message : TransactionParser.messages(text)) captureMessage(source, message, messageTime);
    }
    private void captureMessage(String source, String text, long messageTime) {
        if (!TransactionParser.isBankCandidate(text)) return;
        try {
            TransactionParser.Payment payment = TransactionParser.parse(text);
            if (payment == null) {
                DetectionStatus.record(this, "Bank message skipped: ambiguous, unsuccessful or unsupported format");
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
            DetectionStatus.record(this, added ? "Payment added to review queue" : "Previously detected payment skipped");
        } catch (Exception error) {
            DetectionStatus.record(this, "Unable to save detected payment");
            Log.e(TAG, "Unable to queue detected transaction", error);
        }
    }
}
