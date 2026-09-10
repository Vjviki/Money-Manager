package com.vjviki.moneymanager;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

public class MoneyNotificationListener extends NotificationListenerService {

    private static final String TAG = "MoneyNotification";

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.d(TAG, "Money Manager notification listener connected");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        super.onNotificationPosted(sbn);

        if (sbn == null || sbn.getNotification() == null) {
            return;
        }

        Notification notification = sbn.getNotification();
        String packageName = sbn.getPackageName();
        String title = notification.extras.getString(Notification.EXTRA_TITLE, "");

        CharSequence textCharSequence = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        String text = textCharSequence != null ? textCharSequence.toString() : "";

        Log.d(TAG, "Package: " + packageName);
        Log.d(TAG, "Title: " + title);
        Log.d(TAG, "Text: " + text);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        super.onNotificationRemoved(sbn);
    }
}
