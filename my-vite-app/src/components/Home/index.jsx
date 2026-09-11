import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Capacitor, registerPlugin } from "@capacitor/core";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  Eye,
  EyeOff,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import LoadingState from "../LoadingState";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";
const DetectedTransaction = registerPlugin("DetectedTransaction");
const transactionTypes = ["Income", "Expenses"];
const categories = ["Food", "Entertainment", "Medical", "Transport", "Education", "Shopping", "Salary", "Other"];

const Home = () => {
  const [profile, setProfile] = useState({});
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detectedTransactions, setDetectedTransactions] = useState([]);
  const queueBusy = useRef(false);
  const queueReadVersion = useRef(0);
  const [queueError, setQueueError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [addingAll, setAddingAll] = useState(false);
  const [showPrivateAmounts, setShowPrivateAmounts] = useState(false);
  const [form, setForm] = useState({ title: "", category: "Food", amount: "", date: new Date().toISOString().slice(0, 10), type: "Income" });

  const token = Cookies.get("jwt_token");
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const loadHome = async () => {
    try {
      setLoading(true);
      const [profileRes, summaryRes, transactionsRes] = await Promise.all([
        fetch(`${API}/profile`, { headers }),
        fetch(`${API}/`, { headers }),
        fetch(`${API}/transactions`, { headers }),
      ]);
      if (!profileRes.ok || !summaryRes.ok || !transactionsRes.ok) throw new Error("Failed to load dashboard");
      const [profileData, summaryData, transactionData] = await Promise.all([profileRes.json(), summaryRes.json(), transactionsRes.json()]);
      setProfile(profileData);
      setSummary(summaryData);
      setTransactions(transactionData.transactions || []);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const checkDetectedTransactions = async () => {
    if (!Capacitor.isNativePlatform()) return;
    const version = ++queueReadVersion.current;
    try {
      const result = await DetectedTransaction.getPendingQueue();
      if (version !== queueReadVersion.current) return;
      setDetectedTransactions(Array.isArray(result.transactions) ? result.transactions : []);
      setQueueError("");
    } catch (error) {
      if (version === queueReadVersion.current) setQueueError("Unable to read pending payments. Reopen Home to retry.");
      console.error("Unable to read detected transactions", error);
    }
  };

  useEffect(() => {
    loadHome();
    let disposed = false;
    let subscription;
    if (Capacitor.isNativePlatform()) {
      DetectedTransaction.addListener("queueChanged", () => {
        if (!disposed) checkDetectedTransactions();
      }).then((handle) => {
        if (disposed) handle.remove();
        else { subscription = handle; checkDetectedTransactions(); }
      }).catch(() => { if (!disposed) setQueueError("Live payment updates unavailable. Reopen Home to refresh."); });
    }
    checkDetectedTransactions();
    const onVisible = () => { if (!document.hidden) checkDetectedTransactions(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      queueReadVersion.current += 1;
      subscription?.remove();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const addTransaction = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("Please enter a title");
    if (!form.amount || Number(form.amount) <= 0) return toast.error("Please enter a valid amount");
    try {
      setSubmitting(true);
      const response = await fetch(`${API}/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title.trim(), category: form.category, amount: Number(form.amount), created_at: form.date, type: form.type }),
      });
      if (!response.ok) throw new Error("Failed to add transaction");
      toast.success("Transaction added");
      setForm((prev) => ({ ...prev, title: "", amount: "" }));
      await loadHome();
    } catch (error) {
      console.error(error);
      toast.error("Failed to add transaction");
    } finally {
      setSubmitting(false);
    }
  };

  const buildDetectedPayload = (detectedTransaction) => {
    const detectedDate = new Date(detectedTransaction.detectedAt || Date.now());
    const localDate = `${detectedDate.getFullYear()}-${String(detectedDate.getMonth() + 1).padStart(2, "0")}-${String(detectedDate.getDate()).padStart(2, "0")}`;
    const title = detectedTransaction.merchant && detectedTransaction.merchant !== "Unknown"
      ? detectedTransaction.merchant
      : detectedTransaction.source || "Detected transaction";

    return {
      title,
      detected_id: detectedTransaction.id,
      category: detectedTransaction.category || "Other",
      amount: Number(detectedTransaction.amount),
      created_at: localDate,
      type: detectedTransaction.type || "Expenses",
    };
  };

  const ignoreDetectedTransaction = async (id) => {
    if (queueBusy.current) return;
    queueBusy.current = true;
    try {
      setReviewingId(id);
      await DetectedTransaction.removePending({ id });
      setDetectedTransactions((prev) => prev.filter((item) => item.id !== id));
      toast.success("Detected transaction ignored");
    } catch (error) {
      console.error(error);
      toast.error("Unable to ignore transaction");
    } finally {
      queueBusy.current = false;
      setReviewingId(null);
    }
  };

  const addDetectedTransaction = async (detectedTransaction) => {
    if (queueBusy.current) return;
    queueBusy.current = true;
    try {
      setReviewingId(detectedTransaction.id);
      const response = await fetch(`${API}/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildDetectedPayload(detectedTransaction)),
      });
      if (!response.ok) throw new Error("Failed to add detected transaction");

      await DetectedTransaction.removePending({ id: detectedTransaction.id });
      setDetectedTransactions((prev) => prev.filter((item) => item.id !== detectedTransaction.id));
      toast.success("Detected transaction added");
      await loadHome();
    } catch (error) {
      console.error(error);
      toast.error("Failed to add detected transaction");
    } finally {
      queueBusy.current = false;
      setReviewingId(null);
    }
  };

  const addAllDetectedTransactions = async () => {
    if (queueBusy.current || !detectedTransactions.length) return;
    queueBusy.current = true;
    try {
      setAddingAll(true);
      let addedCount = 0;
      for (const item of detectedTransactions) {
        const response = await fetch(`${API}/`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(buildDetectedPayload(item)),
        });
        if (!response.ok) throw new Error(`Failed while adding ${item.merchant || "detected transaction"}`);
        await DetectedTransaction.removePending({ id: item.id });
        setDetectedTransactions((prev) => prev.filter((pending) => pending.id !== item.id));
        addedCount += 1;
      }
      await checkDetectedTransactions();
      toast.success(`${addedCount} detected transactions added`);
      await loadHome();
    } catch (error) {
      console.error(error);
      toast.error("Could not add all transactions. Review remaining items before retrying.");
      await checkDetectedTransactions();
    } finally {
      queueBusy.current = false;
      setAddingAll(false);
    }
  };

  const recentTransactions = [...transactions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const formatMoney = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
  const privateMoney = (value) => showPrivateAmounts ? formatMoney(value) : "₹ ••••••";

  return (
    <div className="home-page">
      <section className="home-greeting">
        <div><p className="home-eyebrow">Money Manager</p><h1>Good to see you, {profile.name || "there"} 👋</h1><p>Track today, build tomorrow.</p></div>
        <div className="home-heading-actions">
          <button className="home-privacy-button" type="button" onClick={() => setShowPrivateAmounts((prev) => !prev)} aria-label={showPrivateAmounts ? "Hide financial amounts" : "Show financial amounts"} title={showPrivateAmounts ? "Hide amounts" : "Show amounts"}>
            {showPrivateAmounts ? <Eye size={18} /> : <EyeOff size={18} />}{showPrivateAmounts ? "Hide Amounts" : "Show Amounts"}
          </button>
          <div className="home-date-pill"><CalendarDays size={18} />{new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </section>

      {queueError && <p role="alert">{queueError}</p>}
      {Capacitor.isNativePlatform() && <p className="detected-kicker">Automatic tracking uses bank debit/credit notifications; payment-app confirmations are excluded to prevent duplicates.</p>}
      {detectedTransactions.length > 0 && (
        <section className="detected-queue-card">
          <div className="detected-queue-header">
            <div className="detected-queue-title">
              <div className="detected-transaction-icon"><BellRing size={22} /></div>
              <div>
                <span className="detected-kicker">Smart tracking</span>
                <h2>{detectedTransactions.length} transaction{detectedTransactions.length === 1 ? "" : "s"} detected</h2>
                <p>Review them now or come back later. They stay on this device until you add or ignore them.</p>
              </div>
            </div>
            {detectedTransactions.length > 1 && (
              <button className="detected-add-all-button" type="button" onClick={addAllDetectedTransactions} disabled={addingAll || reviewingId !== null}>
                <Plus size={17} /> {addingAll ? "Adding all..." : "Add All"}
              </button>
            )}
          </div>

          <div className="detected-queue-list">
            {detectedTransactions.map((item) => (
              <article className="detected-transaction-row" key={item.id}>
                <div className="detected-transaction-main">
                  <span className="detected-kicker">Payment detected</span>
                  <h3>{formatMoney(item.amount)}</h3>
                  <p>{item.type === "Income" ? "From" : "To"}: <strong>{item.merchant || "Unknown"}</strong></p>
                  <div className="detected-meta"><span>{item.type}</span><span>{item.category || "Other"}</span><span>{item.source || "Payment app"}</span></div>
                </div>
                <div className="detected-actions">
                  <button className="detected-add-button" type="button" onClick={() => addDetectedTransaction(item)} disabled={addingAll || reviewingId !== null}>
                    <Plus size={17} />{reviewingId === item.id ? "Adding..." : "Add"}
                  </button>
                  <button className="detected-ignore-button" type="button" onClick={() => ignoreDetectedTransaction(item.id)} disabled={addingAll || reviewingId !== null}>
                    <X size={17} />Ignore
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? <LoadingState rows={3} label="Loading your financial dashboard..." /> : <>
        <section className="summary-grid">
          <article className="summary-card balance-card"><div className="summary-icon balance-icon"><Wallet size={22} /></div><div className="summary-content"><span>Total Balance</span><strong>{privateMoney(summary.balance)}</strong></div></article>
          <article className="summary-card"><div className="summary-icon income-icon"><ArrowUpRight size={22} /></div><div><span>Monthly Income</span><strong className="income-value">{privateMoney(summary.income)}</strong></div></article>
          <article className="summary-card"><div className="summary-icon expense-icon"><ArrowDownRight size={22} /></div><div><span>Monthly Expenses</span><strong className="expense-value">{privateMoney(summary.expenses)}</strong></div></article>
        </section>

        <section className="home-hero-card"><div><span className="hero-kicker">Your financial command center</span><h2>Manage your money smarter.</h2><p>Record every transaction, watch your spending, and make better decisions month by month.</p></div><div className="hero-symbols" aria-hidden="true"><div>₹</div><div>↗</div><div>✓</div></div></section>

        <section className="home-card add-transaction-card">
          <div className="section-title-row"><div><span className="section-icon"><Plus size={18} /></span><h2>Add New Transaction</h2></div></div>
          <form className="quick-transaction-form" onSubmit={addTransaction}>
            <label><span>Title</span><input name="title" value={form.title} onChange={onChange} placeholder="e.g. Lunch" /></label>
            <label><span>Category</span><select name="category" value={form.category} onChange={onChange}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Amount</span><input name="amount" type="number" min="1" value={form.amount} onChange={onChange} placeholder="₹ 0" /></label>
            <label><span>Date</span><input name="date" type="date" value={form.date} onChange={onChange} /></label>
            <label><span>Type</span><select name="type" value={form.type} onChange={onChange}>{transactionTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button className="quick-add-button" type="submit" disabled={submitting}><Plus size={18} /> {submitting ? "Adding..." : "Add Transaction"}</button>
          </form>
        </section>

        <section className="home-card recent-card">
          <div className="section-title-row"><h2>Recent Transactions</h2><Link to="/history">View all →</Link></div>
          <div className="recent-list">
            {recentTransactions.length === 0 ? <div className="empty-recent">No transactions yet. Add your first one above.</div> : recentTransactions.map((transaction) => (
              <div className="recent-row" key={transaction._id}>
                <div className={`recent-type-icon ${transaction.type === "Income" ? "recent-income-icon" : "recent-expense-icon"}`}>{transaction.type === "Income" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}</div>
                <div className="recent-main"><strong>{transaction.title}</strong><span>{transaction.category}</span></div>
                <span className="recent-date">{new Date(transaction.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                <strong className={transaction.type === "Income" ? "income-value" : "expense-value"}>{transaction.type === "Income" ? "+ " : "- "}{privateMoney(transaction.amount)}</strong>
              </div>
            ))}
          </div>
        </section>
      </>}
    </div>
  );
};

export default Home;
