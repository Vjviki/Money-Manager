package com.vjviki.moneymanager;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MoneyNotificationListener extends NotificationListenerService {

    private static final String TAG = "MoneyNotification";

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
            "(?i)(?:₹|INR\\s*)\\s*([0-9]+(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"
    );

    private static final Pattern PERSON_AFTER_TO_PATTERN = Pattern.compile(
            "(?i)\\bto\\s+([^,.!;|]+)"
    );

    private static final Pattern PERSON_AFTER_FROM_PATTERN = Pattern.compile(
            "(?i)\\bfrom\\s+([^,.!;|]+)"
    );

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
        String packageName = safe(sbn.getPackageName());
        String title = safe(notification.extras.getString(Notification.EXTRA_TITLE, ""));

        CharSequence textCharSequence = notification.extras.getCharSequence(Notification.EXTRA_TEXT);
        String text = textCharSequence != null ? textCharSequence.toString() : "";

        String combined = (title + " " + text).trim();

        // Ignore ordinary notifications. A potential financial notification must contain
        // both an amount and a transaction-related word.
        Double amount = extractAmount(combined);
        String type = detectTransactionType(combined);

        if (amount == null || type == null) {
            return;
        }

        String merchant = extractMerchant(combined, type);
        String category = suggestCategory(merchant + " " + combined);
        String source = sourceName(packageName);

        Log.d(TAG, "FINANCIAL_NOTIFICATION_DETECTED");
        Log.d(TAG, "Source: " + source + " (" + packageName + ")");
        Log.d(TAG, "Type: " + type);
        Log.d(TAG, "Amount: " + amount);
        Log.d(TAG, "Merchant/Person: " + merchant);
        Log.d(TAG, "Suggested category: " + category);
        Log.d(TAG, "Detected at: " + sbn.getPostTime());
    }

    private Double extractAmount(String content) {
        Matcher matcher = AMOUNT_PATTERN.matcher(content);
        if (!matcher.find()) {
            return null;
        }

        try {
            return Double.parseDouble(matcher.group(1).replace(",", ""));
        } catch (NumberFormatException error) {
            return null;
        }
    }

    private String detectTransactionType(String content) {
        String value = content.toLowerCase(Locale.ROOT);

        // Income words are checked first so messages such as "credited/received" are not
        // accidentally treated as outgoing payments.
        if (containsAny(value,
                "credited", "credit of", "received", "money received",
                "amount received", "deposited", "salary credited")) {
            return "Income";
        }

        if (containsAny(value,
                "debited", "debit of", "paid", "payment successful",
                "payment of", "sent", "spent", "purchase", "txn of")) {
            return "Expenses";
        }

        return null;
    }

    private String extractMerchant(String content, String type) {
        Pattern pattern = "Income".equals(type)
                ? PERSON_AFTER_FROM_PATTERN
                : PERSON_AFTER_TO_PATTERN;

        Matcher matcher = pattern.matcher(content);
        if (matcher.find()) {
            String candidate = cleanMerchant(matcher.group(1));
            if (!candidate.isEmpty()) {
                return candidate;
            }
        }

        return "Unknown";
    }

    private String cleanMerchant(String value) {
        if (value == null) {
            return "";
        }

        String cleaned = value
                .replaceAll("(?i)\\b(?:using|via|through|on)\\b.*$", "")
                .replaceAll("\\s{2,}", " ")
                .trim();

        if (cleaned.length() > 50) {
            cleaned = cleaned.substring(0, 50).trim();
        }

        return cleaned;
    }

    private String suggestCategory(String content) {
        String value = content.toLowerCase(Locale.ROOT);

        if (containsAny(value, "swiggy", "zomato", "restaurant", "cafe", "food", "hotel")) {
            return "Food";
        }
        if (containsAny(value, "uber", "ola", "rapido", "metro", "bus", "fuel", "petrol", "diesel")) {
            return "Transport";
        }
        if (containsAny(value, "amazon", "flipkart", "myntra", "shopping", "store", "mart")) {
            return "Shopping";
        }
        if (containsAny(value, "hospital", "pharmacy", "medical", "medicine", "clinic")) {
            return "Medical";
        }
        if (containsAny(value, "school", "college", "course", "education", "tuition")) {
            return "Education";
        }
        if (containsAny(value, "netflix", "spotify", "cinema", "movie", "entertainment")) {
            return "Entertainment";
        }
        if (containsAny(value, "salary", "payroll")) {
            return "Salary";
        }

        return "Other";
    }

    private String sourceName(String packageName) {
        if (packageName == null) {
            return "Unknown";
        }

        switch (packageName) {
            case "com.google.android.apps.nbu.paisa.user":
                return "Google Pay";
            case "com.phonepe.app":
                return "PhonePe";
            case "net.one97.paytm":
                return "Paytm";
            default:
                return "Bank/Payment App";
        }
    }

    private boolean containsAny(String value, String... words) {
        for (String word : words) {
            if (value.contains(word)) {
                return true;
            }
        }
        return false;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        super.onNotificationRemoved(sbn);
    }
}
