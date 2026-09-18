package com.vjviki.moneymanager;

import android.content.SharedPreferences;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DetectedTransaction")
public class DetectedTransactionPlugin extends Plugin {
    private SharedPreferences preferences;
    private final SharedPreferences.OnSharedPreferenceChangeListener listener = (prefs, key) -> {
        if (PendingTransactionStore.QUEUE_KEY.equals(key) || DetectionStatus.KEY.equals(key)) notifyListeners("queueChanged", new JSObject());
    };
    @Override public void load() {
        preferences = getContext().getSharedPreferences(PendingTransactionStore.PREFS, 0);
        preferences.registerOnSharedPreferenceChangeListener(listener);
    }
    @Override protected void handleOnResume() {
        MoneyNotificationListener.recover(getContext());
        notifyListeners("queueChanged", new JSObject());
    }
    @Override protected void handleOnDestroy() {
        if (preferences != null) preferences.unregisterOnSharedPreferenceChangeListener(listener);
    }
    @PluginMethod public void getPendingQueue(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("status", DetectionStatus.read(getContext()));
            result.put("transactions", new JSArray(PendingTransactionStore.read(getContext()).toString()));
            call.resolve(result);
        } catch (Exception error) { call.reject("Unable to read pending transactions", error); }
    }
    @PluginMethod public void recoverListener(PluginCall call) {
        new Handler(Looper.getMainLooper()).post(() -> {
            MoneyNotificationListener.recover(getContext());
            call.resolve();
        });
    }
    @PluginMethod public void openNotificationSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            call.resolve();
        } catch (RuntimeException error) { call.reject("Unable to open notification settings", error); }
    }
    @PluginMethod public void removePending(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) { call.reject("Transaction id is required"); return; }
        try {
            PendingTransactionStore.remove(getContext(), id);
            call.resolve();
        } catch (Exception error) { call.reject("Unable to remove pending transaction", error); }
    }
}
