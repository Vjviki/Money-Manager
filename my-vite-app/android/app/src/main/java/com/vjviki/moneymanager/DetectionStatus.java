package com.vjviki.moneymanager;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;
import com.getcapacitor.JSObject;

/** Diagnostics deliberately contain no notification text, amounts or account details. */
final class DetectionStatus {
    static final String KEY = "detection_status_time";
    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PendingTransactionStore.PREFS, Context.MODE_PRIVATE);
    }
    static boolean hasAccess(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        ComponentName expected = new ComponentName(context, MoneyNotificationListener.class);
        for (String name : enabled.split(":")) {
            if (expected.equals(ComponentName.unflattenFromString(name))) return true;
        }
        return false;
    }
    static void record(Context context, String reason) {
        prefs(context).edit().putString("detection_reason", reason)
            .putLong(KEY, System.currentTimeMillis()).apply();
    }
    static JSObject read(Context context) {
        SharedPreferences prefs = prefs(context);
        JSObject result = new JSObject();
        result.put("accessEnabled", hasAccess(context));
        result.put("connected", MoneyNotificationListener.isConnected());
        result.put("lastResult", prefs.getString("detection_reason", "No payment notifications checked yet"));
        result.put("lastCheckedAt", prefs.getLong(KEY, 0));
        return result;
    }
    private DetectionStatus() {}
}
