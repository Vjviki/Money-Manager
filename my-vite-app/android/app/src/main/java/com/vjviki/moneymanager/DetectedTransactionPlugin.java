package com.vjviki.moneymanager;

import android.content.SharedPreferences;
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
        if (PendingTransactionStore.QUEUE_KEY.equals(key)) notifyListeners("queueChanged", new JSObject());
    };
    @Override public void load() {
        preferences = getContext().getSharedPreferences(PendingTransactionStore.PREFS, 0);
        preferences.registerOnSharedPreferenceChangeListener(listener);
    }
    @Override protected void handleOnResume() {
        notifyListeners("queueChanged", new JSObject());
    }
    @Override protected void handleOnDestroy() {
        if (preferences != null) preferences.unregisterOnSharedPreferenceChangeListener(listener);
    }
    @PluginMethod public void getPendingQueue(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("transactions", new JSArray(PendingTransactionStore.read(getContext()).toString()));
            call.resolve(result);
        } catch (Exception error) { call.reject("Unable to read pending transactions", error); }
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
