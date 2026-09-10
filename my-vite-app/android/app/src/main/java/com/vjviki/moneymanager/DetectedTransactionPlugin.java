package com.vjviki.moneymanager;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "DetectedTransaction")
public class DetectedTransactionPlugin extends Plugin {

    private static final String PREFS = "money_manager_detected_transactions";
    private static final String QUEUE_KEY = "pending_transactions";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private JSONArray readQueue() {
        String raw = prefs().getString(QUEUE_KEY, "[]");
        try { return new JSONArray(raw == null ? "[]" : raw); }
        catch (JSONException error) { return new JSONArray(); }
    }

    private void saveQueue(JSONArray queue) {
        prefs().edit().putString(QUEUE_KEY, queue.toString()).apply();
    }

    @PluginMethod
    public void getPendingQueue(PluginCall call) {
        JSObject result = new JSObject();
        result.put("transactions", new JSArray(readQueue()));
        call.resolve(result);
    }

    @PluginMethod
    public void removePending(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("Transaction id is required");
            return;
        }

        JSONArray current = readQueue();
        JSONArray next = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item == null || !id.equals(item.optString("id"))) next.put(item);
        }
        saveQueue(next);
        call.resolve();
    }

    @PluginMethod
    public void clearAllPending(PluginCall call) {
        prefs().edit().remove(QUEUE_KEY).apply();
        call.resolve();
    }
}
