import { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Download, TrendingUp, WalletCards, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import LoadingState from "../LoadingState";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";
const COLORS = ["#7c3aed", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#84cc16"];

const Analytics = () => {
  const [summaryData, setSummaryData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthDetails, setMonthDetails] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);

  const token = Cookies.get("jwt_token");
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [summaryRes, categoryRes, monthlyRes] = await Promise.all([
          fetch(`${API}/`, { headers }),
          fetch(`${API}/analytics`, { headers }),
          fetch(`${API}/monthly-summary`, { headers }),
        ]);
        if (!summaryRes.ok || !categoryRes.ok || !monthlyRes.ok) throw new Error("Failed to load analytics");
        const [summary, categories, months] = await Promise.all([
          summaryRes.json(),
          categoryRes.json(),
          monthlyRes.json(),
        ]);
        setSummaryData([
          { name: "Income", amount: summary.income || 0 },
          { name: "Expenses", amount: summary.expenses || 0 },
          { name: "Balance", amount: summary.balance || 0 },
        ]);
        setCategoryData(categories || []);
        setMonthlyData(months || []);
        setError(null);
      } catch (err) {
        console.error(err);
        setError("Unable to load analytics right now.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

  const openDetails = async (month) => {
    setSelectedMonth(month);
    setDetailLoading(true);
    try {
      const response = await fetch(`${API}/monthly-details/${month}`, { headers });
      if (!response.ok) throw new Error("Unable to load month details");
      const data = await response.json();
      setMonthDetails(data.transactions || []);
    } catch (err) {
      console.error(err);
      setMonthDetails([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailStats = useMemo(() => {
    let income = 0;
    let expenses = 0;
    monthDetails.forEach((item) => {
      if (item.type === "Income") income += Number(item.amount || 0);
      else expenses += Number(item.amount || 0);
    });
    return { income, expenses, savings: income - expenses };
  }, [monthDetails]);

  const categoryArray = useMemo(() => {
    const totals = {};
    monthDetails.filter((item) => item.type === "Expenses").forEach((item) => {
      const key = item.category || "Other";
      totals[key] = (totals[key] || 0) + Number(item.amount || 0);
    });
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [monthDetails]);

  const downloadMonth = async (month) => {
    try {
      const response = await fetch(`${API}/export-month/${month}`, { headers });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      if (!Capacitor.isNativePlatform()) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${month}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
      await Filesystem.writeFile({ path: `${month}.xlsx`, data: btoa(binary), directory: Directory.Documents });
      alert(`Excel downloaded successfully: ${month}.xlsx`);
    } catch (err) {
      console.error(err);
      alert("Download failed. Try again.");
    }
  };

  return (
    <div className="analytics-page">
      <div className="analytics-heading">
        <div>
          <p>Insights</p>
          <h1>Financial Analytics</h1>
          <span>Understand spending patterns, savings and archived monthly performance.</span>
        </div>
      </div>

      {loading ? (
        <LoadingState variant="chart" rows={2} label="Building your analytics dashboard..." />
      ) : error ? (
        <div className="analytics-error">{error}</div>
      ) : (
        <>
          <section className="analytics-stat-grid">
            {summaryData.map((item) => (
              <article className="analytics-stat-card" key={item.name}>
                <div className={`analytics-stat-icon ${item.name.toLowerCase()}`}>
                  {item.name === "Balance" ? <WalletCards size={20} /> : <TrendingUp size={20} />}
                </div>
                <span>{item.name}</span>
                <strong className={item.name === "Expenses" ? "expense-metric" : item.name === "Income" ? "income-metric" : ""}>{formatMoney(item.amount)}</strong>
              </article>
            ))}
          </section>

          <section className="analytics-chart-grid">
            <article className="analytics-card">
              <div className="analytics-card-title"><h2>Income vs Expense</h2><span>Current month</span></div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={summaryData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip formatter={(value) => formatMoney(value)} />
                  <Bar dataKey="amount" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </article>

            <article className="analytics-card">
              <div className="analytics-card-title"><h2>Expense Breakdown</h2><span>By category</span></div>
              {categoryData.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="total" nameKey="category" innerRadius="42%" outerRadius="76%" paddingAngle={2}>
                      {categoryData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <div className="analytics-empty">No expense data available yet.</div>}
            </article>
          </section>

          <section className="analytics-card archive-section">
            <div className="analytics-card-title"><h2>Monthly Archive</h2><span>{monthlyData.length} archived months</span></div>
            <div className="month-grid">
              {monthlyData.length ? monthlyData.map((item) => (
                <article className="month-card-modern" key={item.month}>
                  <div><span>Month</span><h3>{item.month}</h3></div>
                  <div className="month-metrics"><span>Expenses <strong className="expense-metric">{formatMoney(item.expenses)}</strong></span><span>Savings <strong className={item.savings >= 0 ? "income-metric" : "expense-metric"}>{formatMoney(item.savings)}</strong></span></div>
                  <button onClick={() => openDetails(item.month)}>View Details</button>
                </article>
              )) : <div className="analytics-empty">No archived months yet. Use Reset Month from History when you close a month.</div>}
            </div>
          </section>
        </>
      )}

      {selectedMonth && (
        <div className="analytics-overlay" onClick={() => setSelectedMonth(null)}>
          <aside className="analytics-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div><span>Archived month</span><h2>{selectedMonth}</h2></div>
              <button aria-label="Close details" onClick={() => setSelectedMonth(null)}><X size={20} /></button>
            </div>
            {detailLoading ? <LoadingState variant="list" rows={4} label="Loading monthly details..." /> : (
              <>
                <div className="drawer-stat-grid">
                  <div><span>Income</span><strong className="income-metric">{formatMoney(detailStats.income)}</strong></div>
                  <div><span>Expenses</span><strong className="expense-metric">{formatMoney(detailStats.expenses)}</strong></div>
                  <div><span>Savings</span><strong>{formatMoney(detailStats.savings)}</strong></div>
                </div>
                <div className="drawer-section"><h3>Transactions</h3><div className="drawer-transactions">{monthDetails.length ? monthDetails.map((item) => <div className="drawer-row" key={item._id}><div><strong>{item.title}</strong><span>{item.category || "Other"}</span></div><div><strong className={item.type === "Income" ? "income-metric" : "expense-metric"}>{item.type === "Income" ? "+ " : "- "}{formatMoney(item.amount)}</strong><span>{item.date || ""}</span></div></div>) : <div className="analytics-empty">No transaction details found.</div>}</div></div>
                <div className="drawer-section"><h3>Expense by Category</h3>{categoryArray.length ? categoryArray.map(([name, total]) => <div className="category-row-modern" key={name}><span>{name}</span><strong>{formatMoney(total)}</strong></div>) : <div className="analytics-empty">No expense data.</div>}</div>
                <button className="drawer-download" onClick={() => downloadMonth(selectedMonth)}><Download size={18} /> Download Excel</button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

export default Analytics;
