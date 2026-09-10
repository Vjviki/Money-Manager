package com.vjviki.moneymanager;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MoneyNotificationListener extends NotificationListenerService {

    private static final String TAG = "MoneyNotification";

    private static final Pattern AMOUNT_PATTERN = Pattern.compile(
            "(?i)(?:₹|rs\\.?|inr)\\s*[:.-]?\\s*([0-9]+(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)"
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
        Bundle extras = notification.extras;

        String packageName = safe(sbn.getPackageName());
        String title = getCharSequence(extras, Notification.EXTRA_TITLE);
        String text = getCharSequence(extras, Notification.EXTRA_TEXT);
        String bigText = getCharSequence(extras, Notification.EXTRA_BIG_TEXT);
        String subText = getCharSequence(extras, Notification.EXTRA_SUB_TEXT);
        String infoText = getCharSequence(extras, Notification.EXTRA_INFO_TEXT);

        String combined = String.join(" ", title, text, bigText, subText, infoText)
                .replaceAll("\\s+", " ")
                .trim();

        boolean knownPaymentApp = isKnownPaymentApp(packageName);

        // Diagnostic logging for payment apps so we can learn their exact notification format.
        // This stays local in Logcat and is not sent to the backend.
        if (knownPaymentApp) {
            Log.d(TAG, "PAYMENT_APP_NOTIFICATION");
            Log.d(TAG, "Package: " + packageName);
            Log.d(TAG, "Title: " + title);
            Log.d(TAG, "Text: " + text);
            Log.d(TAG, "BigText: " + bigText);
            Log.d(TAG, "SubText: " + subText);
            Log.d(TAG, "InfoText: " + infoText);
        }

        Double amount = extractAmount(combined);
        String type = detectTransactionType(combined);

        if (amount == null || type == null) {
            if (knownPaymentApp) {
                Log.d(TAG, "Payment notification not parsed -> amount=" + amount + ", type=" + type);
            }
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

    private String getCharSequence(Bundle extras, String key) {
        if (extras == null) return "";
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString();
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

        if (containsAny(value,
                "credited", "credit of", "received", "money received",
                "amount received", "deposited", "salary credited", "you received")) {
            return "Income";
        }

        if (containsAny(value,
                "debited", "debit of", "paid", "payment successful",
                "payment of", "sent", "spent", "purchase", "txn of",
                "you paid", "transferred", "money sent")) {
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
                .replaceAll("(?i)\\b(?:using|via|through|on|with|upi|ref|utr)\\b.*$", "")
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

    private boolean isKnownPaymentApp(String packageName) {
        return containsAny(packageName,
                "com.google.android.apps.nbu.paisa.user",
                "com.phonepe.app",
                "net.one97.paytm",
                "com.mobikwik_new",
                "com.freecharge.android");
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
            case "com.mobikwik_new":
                return "MobiKwik";
            case "com.freecharge.android":
                return "Freecharge";
            default:
                return "Bank/Payment App";
        }
    }

    private boolean containsAny(String value, String... words) {
        if (value == null) return false;
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
