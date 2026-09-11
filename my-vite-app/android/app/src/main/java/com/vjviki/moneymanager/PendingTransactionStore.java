package com.vjviki.moneymanager;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** One lock covers all read/modify/write operations from both the service and plugin. */
final class PendingTransactionStore {
    static final String PREFS = "money_manager_detected_transactions";
    static final String QUEUE_KEY = "pending_transactions";
    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
    static synchronized JSONArray read(Context context) throws JSONException {
        return new JSONArray(prefs(context).getString(QUEUE_KEY, "[]"));
    }
    static synchronized boolean enqueue(Context context, JSONObject item) throws JSONException {
        SharedPreferences prefs = prefs(context);
        JSONArray queue = read(context);
        JSONObject seen = new JSONObject(prefs.getString("seen_v2", "{}"));
        String id = item.getString("id");
        if (seen.has(id)) return false;
        for (int i = 0; i < queue.length(); i++) {
            if (id.equals(queue.getJSONObject(i).optString("id"))) return false;
        }
        queue.put(item);
        seen.put(id, System.currentTimeMillis());
        // Retain replay protection for 30 days, including added/ignored transactions.
        JSONObject recent = new JSONObject();
        java.util.Iterator<String> keys = seen.keys();
        long cutoff = System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000;
        while (keys.hasNext()) {
            String key = keys.next();
            if (seen.getLong(key) >= cutoff) recent.put(key, seen.getLong(key));
        }
        if (!prefs.edit().putString(QUEUE_KEY, queue.toString()).putString("seen_v2", recent.toString()).commit())
            throw new IllegalStateException("Unable to persist detected transaction");
        return true;
    }
    static synchronized void remove(Context context, String id) throws JSONException {
        JSONArray queue = read(context), next = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.getJSONObject(i);
            if (!id.equals(item.optString("id"))) next.put(item);
        }
        if (!prefs(context).edit().putString(QUEUE_KEY, next.toString()).commit())
            throw new IllegalStateException("Unable to persist queue removal");
    }
    private PendingTransactionStore() {}
}
