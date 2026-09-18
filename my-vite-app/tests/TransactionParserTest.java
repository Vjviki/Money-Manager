package com.vjviki.moneymanager;
public class TransactionParserTest {
 static int count;
 static void check(boolean b) { count++; if (!b) throw new AssertionError("Check " + count); }
 public static void main(String[] args) {
  String credit="INR 20.00 credited to YES BANK Ac X0000 on 11SEP26 11:30. UPI:111111111111/From:friend.name@okaxis. Bal INR 999.00";
  String debit="YES BANK Ac X0000 debited for INR 20.00 on 11SEP26 11:31. UPI:222222222222/To:friend.name@okaxis. Bal INR 979.00. Not U? SMS BLKMB <CustID> to 9000000000";
  var a=TransactionParser.parse(credit); var b=TransactionParser.parse(debit);
  check(a.amount==20 && a.type.equals("Income"));
  check(b.amount==20 && b.type.equals("Expenses"));
  check(a.merchant.equals("friend.name@okaxis")); check(b.merchant.equals("friend.name@okaxis"));
  var g=TransactionParser.parse("FRIEND V paid you ₹20.00 Tap to view.");
  check(g.type.equals("Income") && g.merchant.equals("FRIEND V"));
  check(TransactionParser.parse("FRIEND V sent you ₹20.00 Tap to view.").type.equals("Income"));
  check(TransactionParser.parse("You paid ₹20 to Shop. Tap to view.").type.equals("Expenses"));
  check(TransactionParser.parse(credit+" "+debit)==null);
  check(TransactionParser.parse("Payment request for INR 20")==null);
  check(TransactionParser.parse("INR 20 debit failed")==null);
  String id=TransactionParser.identity(a,"messages",credit,100);
  check(id.equals(TransactionParser.identity(a,"messages",credit,200)));
  check(id.equals(TransactionParser.identity(a,"bank.app",credit,200)));
  check(!id.equals(TransactionParser.identity(b,"messages",debit,100)));
  String second=credit.replace("111111111111","333333333333");
  check(!id.equals(TransactionParser.identity(TransactionParser.parse(second),"messages",second,100)));
  check(TransactionParser.isPaymentApp("com.google.android.apps.nbu.paisa.user"));
  check(!TransactionParser.isPaymentApp("com.google.android.apps.messaging"));
  check(TransactionParser.isBankCandidate("You spent INR 30 at SHOP"));
  check(TransactionParser.parse(debit + " If not requested by you, call bank.") != null);
  check(TransactionParser.parse("INR 30 debited. If you have not requested this, contact bank.") != null);
  check(TransactionParser.parse("Payment pending: INR 30 to be debited") == null);
  check(TransactionParser.parse("INR 30 not credited to account") == null);
  check(TransactionParser.parse("INR 30 debited then reversed") == null);
  var grouped = TransactionParser.messages(credit + " " + debit);
  check(grouped.size() == 2);
  check(TransactionParser.parse(grouped.get(0)).type.equals("Income"));
  check(TransactionParser.parse(grouped.get(1)).type.equals("Expenses"));
  var twoCredits = TransactionParser.messages(credit + " " + second);
  check(twoCredits.size() == 2);
  check(!TransactionParser.parse(twoCredits.get(0)).reference.equals(TransactionParser.parse(twoCredits.get(1)).reference));
  var twoDebits = TransactionParser.messages(debit + " " + debit.replace("222222222222", "444444444444"));
  check(twoDebits.size() == 2);
  check(TransactionParser.parse(twoDebits.get(1)).reference.equals("444444444444"));
  check(TransactionParser.parse(TransactionParser.withTitle("Account debited", "INR 30 to SHOP")).type.equals("Expenses"));
  check(TransactionParser.withTitle("Account credited", debit).equals(debit));
  check(TransactionParser.parse(credit + " " + second) == null);
  check(TransactionParser.messages("3 new messages").size() == 1);
  System.out.println(count+" checks passed");
 }
}
