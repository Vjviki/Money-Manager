import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Plus,
  Wallet,
} from "lucide-react";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";

const transactionTypes = ["Income", "Expenses"];
const categories = [
  "Food",
  "Entertainment",
  "Medical",
  "Transport",
  "Education",
  "Shopping",
  "Salary",
  "Other",
];

const Home = () => {
  const [profile, setProfile] = useState({});
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    category: "Food",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    type: "Income",
  });

  const token = Cookies.get("jwt_token");

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const loadHome = async () => {
    try {
      setLoading(true);
      const [profileRes, summaryRes, transactionsRes] = await Promise.all([
        fetch(`${API}/profile`, { headers }),
        fetch(`${API}/`, { headers }),
        fetch(`${API}/transactions`, { headers }),
      ]);

      if (!profileRes.ok || !summaryRes.ok || !transactionsRes.ok) {
        throw new Error("Failed to load dashboard");
      }

      const [profileData, summaryData, transactionData] = await Promise.all([
        profileRes.json(),
        summaryRes.json(),
        transactionsRes.json(),
      ]);

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

  useEffect(() => {
    loadHome();
  }, []);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const addTransaction = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API}/`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          amount: Number(form.amount),
          created_at: form.date,
          type: form.type,
        }),
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

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  return (
    <div className="home-page">
      <section className="home-greeting">
        <div>
          <p className="home-eyebrow">Money Manager</p>
          <h1>Good to see you, {profile.name || "there"} 👋</h1>
          <p>Track today, build tomorrow.</p>
        </div>
        <div className="home-date-pill">
          <CalendarDays size={18} />
          {new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card balance-card">
          <div className="summary-icon balance-icon"><Wallet size={22} /></div>
          <div>
            <span>Total Balance</span>
            <strong>{loading ? "—" : formatMoney(summary.balance)}</strong>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon income-icon"><ArrowUpRight size={22} /></div>
          <div>
            <span>Monthly Income</span>
            <strong className="income-value">{loading ? "—" : formatMoney(summary.income)}</strong>
          </div>
        </article>
        <article className="summary-card">
          <div className="summary-icon expense-icon"><ArrowDownRight size={22} /></div>
          <div>
            <span>Monthly Expenses</span>
            <strong className="expense-value">{loading ? "—" : formatMoney(summary.expenses)}</strong>
          </div>
        </article>
      </section>

      <section className="home-hero-card">
        <div>
          <span className="hero-kicker">Your financial command center</span>
          <h2>Manage your money smarter.</h2>
          <p>Record every transaction, watch your spending, and make better decisions month by month.</p>
        </div>
        <div className="hero-symbols" aria-hidden="true">
          <div>₹</div>
          <div>↗</div>
          <div>✓</div>
        </div>
      </section>

      <section className="home-card add-transaction-card">
        <div className="section-title-row">
          <div>
            <span className="section-icon"><Plus size={18} /></span>
            <h2>Add New Transaction</h2>
          </div>
        </div>

        <form className="quick-transaction-form" onSubmit={addTransaction}>
          <label>
            <span>Title</span>
            <input name="title" value={form.title} onChange={onChange} placeholder="e.g. Lunch" />
          </label>
          <label>
            <span>Category</span>
            <select name="category" value={form.category} onChange={onChange}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Amount</span>
            <input name="amount" type="number" min="1" value={form.amount} onChange={onChange} placeholder="₹ 0" />
          </label>
          <label>
            <span>Date</span>
            <input name="date" type="date" value={form.date} onChange={onChange} />
          </label>
          <label>
            <span>Type</span>
            <select name="type" value={form.type} onChange={onChange}>
              {transactionTypes.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button className="quick-add-button" type="submit" disabled={submitting}>
            <Plus size={18} /> {submitting ? "Adding..." : "Add Transaction"}
          </button>
        </form>
      </section>

      <section className="home-card recent-card">
        <div className="section-title-row">
          <h2>Recent Transactions</h2>
          <Link to="/history">View all →</Link>
        </div>

        <div className="recent-list">
          {recentTransactions.length === 0 && !loading ? (
            <div className="empty-recent">No transactions yet. Add your first one above.</div>
          ) : (
            recentTransactions.map((transaction) => (
              <div className="recent-row" key={transaction._id}>
                <div className={`recent-type-icon ${transaction.type === "Income" ? "recent-income-icon" : "recent-expense-icon"}`}>
                  {transaction.type === "Income" ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="recent-main">
                  <strong>{transaction.title}</strong>
                  <span>{transaction.category}</span>
                </div>
                <span className="recent-date">
                  {new Date(transaction.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <strong className={transaction.type === "Income" ? "income-value" : "expense-value"}>
                  {transaction.type === "Income" ? "+ " : "- "}{formatMoney(transaction.amount)}
                </strong>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
