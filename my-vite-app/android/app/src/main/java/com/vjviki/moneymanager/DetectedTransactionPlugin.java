package com.vjviki.moneymanager;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "DetectedTransaction")
public class DetectedTransactionPlugin extends Plugin {

    private static final String PREFS = "money_manager_detected_transactions";
    private static final String PENDING_KEY = "pending_transaction";

    @PluginMethod
    public void getPending(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(PENDING_KEY, null);
        JSObject result = new JSObject();

        if (raw == null || raw.isEmpty()) {
            result.put("transaction", JSObject.NULL);
            call.resolve(result);
            return;
        }

        try {
            JSONObject transaction = new JSONObject(raw);
            result.put("transaction", transaction);
            call.resolve(result);
        } catch (JSONException error) {
            call.reject("Unable to read detected transaction", error);
        }
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().remove(PENDING_KEY).apply();
        call.resolve();
    }
}
