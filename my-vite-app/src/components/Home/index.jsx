import { apiFetch } from "../../utils/session";
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
import useCategoryMemory, { recipientKey } from "../../hooks/useCategoryMemory";
import useDetectedEdits from "../../hooks/useDetectedEdits";
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
  const [detectionStatus, setDetectionStatus] = useState(null);
  const [recoveringListener, setRecoveringListener] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [addingAll, setAddingAll] = useState(false);
  const [showPrivateAmounts, setShowPrivateAmounts] = useState(false);
  const [form, setForm] = useState({ title: "", category: "Food", amount: "", date: new Date().toISOString().slice(0, 10), type: "Income" });

  const token = Cookies.get("jwt_token");
  const detectedEdits = useDetectedEdits(token);
  const categoryMemory = useCategoryMemory(token);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const loadHome = async () => {
    try {
      setLoading(true);
      const [profileRes, summaryRes, transactionsRes] = await Promise.all([
        apiFetch(`${API}/profile`, { headers }),
        apiFetch(`${API}/`, { headers }),
        apiFetch(`${API}/transactions?page=1&limit=5`, { headers }),
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
      const pending = Array.isArray(result.transactions) ? result.transactions : [];
      setDetectedTransactions(pending);
      detectedEdits.prune(pending);
      setDetectionStatus(result.status || null);
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
    if (Capacitor.isNativePlatform()) {
      DetectedTransaction.recoverListener().catch(() => {
        if (!disposed) setQueueError("Unable to request a notification rescan. Tap Check again.");
      });
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

  const recoverDetection = async () => {
    setRecoveringListener(true);
    try {
      await DetectedTransaction.recoverListener();
      await checkDetectedTransactions();
    } catch {
      setQueueError("Unable to reconnect. Check notification access in Settings.");
    } finally {
      setRecoveringListener(false);
    }
  };
  const openDetectionSettings = async () => {
    try { await DetectedTransaction.openNotificationSettings(); }
    catch { setQueueError("Open phone Settings and search for Notification access."); }
  };

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
      const response = await apiFetch(`${API}/`, {
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

  const detectedFields = (item) => {
    const draft = detectedEdits.edits[item.id] || {};
    const defaultTitle = item.merchant && item.merchant !== "Unknown"
      ? item.merchant : item.source || "Detected transaction";
    const category = draft.category ?? categoryMemory.categoryFor(item) ?? item.category;
    return {
      title: typeof draft.title === "string" ? draft.title : defaultTitle,
      category: categories.includes(category) ? category : "Other",
    };
  };
  const validateDetected = (item) => {
    if (detectedFields(item).title.trim()) return true;
    toast.error("Enter a title for each detected payment before adding it.");
    document.getElementById(`detected-title-${item.id}`)?.focus();
    return false;
  };
  const editDetected = (id, field, value) => {
    if (!queueBusy.current) detectedEdits.update(id, field, value);
  };

  const rememberDetectedCategory = (item, category) => {
    if (detectedEdits.edits[item.id]?.rememberCategory === true) categoryMemory.remember(item, category);
  };

  const buildDetectedPayload = (detectedTransaction) => {
    const detectedDate = new Date(detectedTransaction.detectedAt || Date.now());
    const localDate = `${detectedDate.getFullYear()}-${String(detectedDate.getMonth() + 1).padStart(2, "0")}-${String(detectedDate.getDate()).padStart(2, "0")}`;
    const fields = detectedFields(detectedTransaction);

    return {
      title: fields.title.trim(),
      detected_id: detectedTransaction.id,
      category: fields.category,
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
      detectedEdits.remove(id);
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
    if (queueBusy.current || !validateDetected(detectedTransaction)) return;
    queueBusy.current = true;
    try {
      setReviewingId(detectedTransaction.id);
      const payload = buildDetectedPayload(detectedTransaction);
      const response = await apiFetch(`${API}/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Failed to add detected transaction");

      rememberDetectedCategory(detectedTransaction, payload.category);
      await DetectedTransaction.removePending({ id: detectedTransaction.id });
      detectedEdits.remove(detectedTransaction.id);
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
    if (!detectedTransactions.every(validateDetected)) return;
    queueBusy.current = true;
    try {
      setAddingAll(true);
      let addedCount = 0;
      const batch = detectedTransactions.map(item => ({ item, payload: buildDetectedPayload(item) }));
      for (const { item, payload } of batch) {
        const response = await apiFetch(`${API}/`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`Failed while adding ${item.merchant || "detected transaction"}`);
        rememberDetectedCategory(item, payload.category);
        await DetectedTransaction.removePending({ id: item.id });
        detectedEdits.remove(item.id);
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
      {Capacitor.isNativePlatform() && (
        <section className="detection-status-card" aria-label="Payment detection status">
          <div>
            <strong>{!detectionStatus ? "Checking payment detection…"
              : !detectionStatus.accessEnabled ? "Notification access is off"
              : detectionStatus.connected ? "Payment listener connected" : "Payment listener disconnected"}</strong>
            <p>{detectionStatus?.lastResult || "Checking the saved queue and listener connection."}</p>
            {detectionStatus?.lastCheckedAt > 0 && <small>Last check: {new Date(detectionStatus.lastCheckedAt).toLocaleTimeString()}</small>}
          </div>
          <div className="detection-status-actions">
            <button type="button" onClick={recoverDetection} disabled={recoveringListener}>
              {recoveringListener ? "Checking…" : "Check again"}
            </button>
            <button type="button" onClick={openDetectionSettings}>Notification settings</button>
          </div>
          <p>Check again scans notifications still on your phone. Dismissed notifications cannot be recovered here.</p>
        </section>
      )}
      {Capacitor.isNativePlatform() && <p className="detected-kicker">Automatic tracking uses bank debit/credit notifications; payment-app confirmations are excluded to prevent duplicates.</p>}
      {categoryMemory.storageError && <p role="alert">Category memory could not be saved on this device. Your payment can still be added.</p>}
      {Object.keys(categoryMemory.rules).length > 0 && (
        <details className="home-card category-memory-card">
          <summary>Remembered categories ({Object.keys(categoryMemory.rules).length})</summary>
          <p>Saved for your account on this device. Forget a rule to stop suggesting it. Existing transactions and your edits stay unchanged.</p>
          <ul>{Object.entries(categoryMemory.rules).map(([id, rule]) => (
            <li key={id}><span>{rule.merchant} · {rule.type} → {rule.category}</span>
              <button type="button" onClick={() => categoryMemory.forget(id)} disabled={addingAll || reviewingId !== null}
                aria-label={`Forget ${rule.type} category for ${rule.merchant}`}>Forget</button>
            </li>
          ))}</ul>
        </details>
      )}
      {detectedTransactions.length > 0 && (
        <section className="detected-queue-card">
          <div className="detected-queue-header">
            <div className="detected-queue-title">
              <div className="detected-transaction-icon"><BellRing size={22} /></div>
              <div>
                <span className="detected-kicker">Smart tracking</span>
                <h2>{detectedTransactions.length} transaction{detectedTransactions.length === 1 ? "" : "s"} detected</h2>
                <p>Edit the title and category before adding. Add All uses your edits. Unsaved payments stay here until you add or ignore them.</p>
              </div>
            </div>
            {detectedTransactions.length > 1 && (
              <button className="detected-add-all-button" type="button" onClick={addAllDetectedTransactions} disabled={addingAll || reviewingId !== null}>
                <Plus size={17} /> {addingAll ? "Adding all..." : "Add All"}
              </button>
            )}
          </div>

          {detectedEdits.storageError && <p role="alert">Your edits are available now, but could not be saved on this device. Keep this screen open until you add them.</p>}
          <div className="detected-queue-list">
            {detectedTransactions.map((item) => (
              <article className="detected-transaction-row" key={item.id} aria-label={`Detected payment ${item.id}`}>
                <div className="detected-transaction-main">
                  <span className="detected-kicker">Payment detected</span>
                  <h3>{formatMoney(item.amount)}</h3>
                  <p>{item.type === "Income" ? "From" : "To"}: <strong>{item.merchant || "Unknown"}</strong></p>
                  <div className="detected-meta"><span>{item.type}</span><span>{detectedFields(item).category}</span><span>{item.source || "Payment app"}</span></div>
                </div>
                <div className="detected-edit-fields">
                  <label htmlFor={`detected-title-${item.id}`}>Title</label>
                  <input id={`detected-title-${item.id}`} value={detectedFields(item).title}
                    onChange={(event) => editDetected(item.id, "title", event.target.value)}
                    placeholder="e.g. Lunch" maxLength={120} required
                    disabled={addingAll || reviewingId !== null} />
                  <label htmlFor={`detected-category-${item.id}`}>Category</label>
                  <select id={`detected-category-${item.id}`} value={detectedFields(item).category}
                    onChange={(event) => editDetected(item.id, "category", event.target.value)}
                    disabled={addingAll || reviewingId !== null}>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  {categoryMemory.categoryFor(item) && !detectedEdits.edits[item.id]?.category &&
                    <small>Suggested from your remembered category.</small>}
                  {categoryMemory.available && recipientKey(item) && <label className="category-memory-choice">
                    <input type="checkbox" checked={detectedEdits.edits[item.id]?.rememberCategory === true}
                      onChange={(event) => editDetected(item.id, "rememberCategory", event.target.checked)}
                      disabled={addingAll || reviewingId !== null} />
                    Remember this category for {item.merchant} when I add this payment
                  </label>}
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
                <strong className={transaction.type === "Income" ? "income-value" : "expense-value"}>{transaction.type === "Income" ? "+ " : "- "}{transaction.amount}</strong>
              </div>
            ))}
          </div>
        </section>
      </>}
    </div>
  );
};

export default Home;
