package com.vjviki.moneymanager;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses one message at a time. Never concatenate a notification's message history. */
public final class TransactionParser {
    private static final Pattern AMOUNT = Pattern.compile("(?i)(?:₹|rs\\.?|inr)\\s*[:.-]?\\s*([0-9]+(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?)");
    private static final Pattern REFERENCE = Pattern.compile("(?i)\\b(?:upi|utr|rrn|ref(?:erence)?(?:\\s*no\\.?)?)\\s*[:#-]?\\s*(\\d{10,22})\\b");
    public static final class Payment {
        public final double amount;
        public final String type, merchant, reference;
        Payment(double amount, String type, String merchant, String reference) {
            this.amount = amount; this.type = type; this.merchant = merchant; this.reference = reference;
        }
    }
    private static boolean matches(String text, String regex) {
        return Pattern.compile(regex, Pattern.CASE_INSENSITIVE).matcher(text).find();
    }
    public static Payment parse(String raw) {
        if (raw == null) return null;
        String text = raw.replaceAll("\\s+", " ").trim();
        // Requests, failures and reversals need explicit review, not automatic classification.
        if (matches(text, "\\b(failed|declined|pending|request|requested|reversed|reversal)\\b")) return null;
        boolean income = matches(text, "\\b(credited|received|deposited)\\b|\\b(?:paid|sent)\\s+you\\b");
        boolean expense = matches(text, "\\b(debited|spent)\\b|\\byou\\s+(?:paid|sent|transferred)\\b");
        if (income == expense) return null; // includes mixed credit/debit summaries
        // Exclude balances and bank help instructions before amount/recipient extraction.
        String paymentText = text.split("(?i)\\b(?:bal(?:ance)?|not u\\?|tap to view)\\b", 2)[0];
        Matcher amount = AMOUNT.matcher(paymentText);
        if (!amount.find()) return null;
        double value = Double.parseDouble(amount.group(1).replace(",", ""));
        if (!Double.isFinite(value) || value <= 0) return null;
        Matcher references = REFERENCE.matcher(paymentText);
        if (references.find() && references.find()) return null; // multiple payments in one summary
        String type = income ? "Income" : "Expenses";
        String merchant = "Unknown";
        Matcher actor = Pattern.compile("(?i)^(.+?)\\s+(?:paid|sent)\\s+you\\b").matcher(paymentText);
        Matcher upi = Pattern.compile("(?i)/" + (income ? "From" : "To") + "\\s*:\\s*([a-z0-9._-]+@[a-z0-9.-]+)").matcher(paymentText);
        if (upi.find()) merchant = upi.group(1).replaceAll("[.]+$", "");
        else if (income && actor.find()) merchant = actor.group(1).trim();
        else {
            Matcher person = Pattern.compile("(?i)\\b" + (income ? "from" : "to") + "\\s*:?\\s+([^,.!;|]+)").matcher(paymentText);
            if (person.find()) {
                String candidate = person.group(1).split("(?i)\\b(?:on|via|using|with|upi|ref)\\b", 2)[0].trim();
                if (!matches(candidate, "^(?:view|your|a/c|ac\\b|account|yes bank)")) merchant = candidate;
            }
        }
        Matcher reference = REFERENCE.matcher(paymentText);
        return new Payment(value, type, merchant, reference.find() ? reference.group(1) : "");
    }
    public static boolean isPaymentApp(String name) {
        return name.equals("com.google.android.apps.nbu.paisa.user") || name.equals("com.phonepe.app")
            || name.equals("net.one97.paytm") || name.equals("com.mobikwik_new") || name.equals("com.freecharge.android");
    }
    public static String identity(Payment payment, String source, String text, long messageTime) {
        if (!payment.reference.isEmpty()) return "ref|" + payment.reference + "|" + payment.type + "|" + payment.amount;
        return "message|" + source + "|" + messageTime + "|" + text.replaceAll("\\s+", " ").trim().toLowerCase(Locale.ROOT);
    }
    public static String suggestCategory(String content) {
        String value = content.toLowerCase(Locale.ROOT);
        if (containsAny(value, "swiggy", "zomato", "restaurant", "cafe", "food", "hotel")) return "Food";
        if (containsAny(value, "uber", "ola", "rapido", "metro", "bus", "fuel", "petrol", "diesel")) return "Transport";
        if (containsAny(value, "amazon", "flipkart", "myntra", "shopping", "store", "mart")) return "Shopping";
        if (containsAny(value, "hospital", "pharmacy", "medical", "medicine", "clinic")) return "Medical";
        if (containsAny(value, "school", "college", "course", "education", "tuition")) return "Education";
        if (containsAny(value, "netflix", "spotify", "cinema", "movie", "entertainment")) return "Entertainment";
        if (containsAny(value, "salary", "payroll")) return "Salary";
        return "Other";
    }

    private static boolean containsAny(String value, String... words) {
        if (value == null) return false;
        for (String word : words) if (value.contains(word)) return true;
        return false;
    }

    private TransactionParser() {}
}
