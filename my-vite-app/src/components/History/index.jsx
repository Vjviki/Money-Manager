import { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { Search, SlidersHorizontal } from "lucide-react";
import TransactionItem from "../TransactionItem";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";
const ITEMS_PER_PAGE = 10;

const History = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const token = Cookies.get("jwt_token");

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load transactions");
      const data = await response.json();
      setTransactions(data.transactions || []);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load transaction history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const categories = useMemo(
    () => [...new Set(transactions.map((item) => item.category).filter(Boolean))].sort(),
    [transactions],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...transactions]
      .filter((item) => {
        const textMatch =
          !normalizedQuery ||
          item.title?.toLowerCase().includes(normalizedQuery) ||
          item.category?.toLowerCase().includes(normalizedQuery);
        const typeMatch = type === "ALL" || item.type === type;
        const categoryMatch = category === "ALL" || item.category === category;
        const itemDate = item.created_at ? new Date(item.created_at) : null;
        const fromMatch = !fromDate || (itemDate && itemDate >= new Date(`${fromDate}T00:00:00`));
        const toMatch = !toDate || (itemDate && itemDate <= new Date(`${toDate}T23:59:59`));
        return textMatch && typeMatch && categoryMatch && fromMatch && toMatch;
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [transactions, query, type, category, fromDate, toDate]);

  useEffect(() => setPage(1), [query, type, category, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const deleteTransaction = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      const response = await fetch(`${API}/transactions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Delete failed");
      setTransactions((prev) => prev.filter((item) => item._id !== id));
      toast.success("Transaction deleted");
    } catch (error) {
      console.error(error);
      toast.error("Unable to delete transaction");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setType("ALL");
    setCategory("ALL");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="history-page">
      <div className="history-page-heading">
        <div>
          <p>Transactions</p>
          <h1>Transaction History</h1>
          <span>Search, filter and manage every transaction in one place.</span>
        </div>
        <div className="history-count">{filtered.length} records</div>
      </div>

      <section className="history-panel">
        <div className="history-toolbar-title"><SlidersHorizontal size={18} /> Filters</div>
        <div className="history-toolbar">
          <label className="history-search">
            <Search size={18} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or category..." />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="ALL">All categories</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="ALL">All types</option>
            <option value="Income">Income</option>
            <option value="Expenses">Expense</option>
          </select>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="From date" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="To date" />
          <button type="button" className="clear-filter-btn" onClick={clearFilters}>Clear</button>
        </div>
      </section>

      <section className="history-panel history-records-panel">
        <div className="history-table-head">
          <span>Date</span><span>Title & Category</span><span>Amount</span><span>Type</span><span>Action</span>
        </div>
        <ul className="history-list">
          {loading ? (
            <div className="history-empty">Loading transactions...</div>
          ) : paginated.length === 0 ? (
            <div className="history-empty">No transactions match these filters.</div>
          ) : (
            paginated.map((transaction) => (
              <TransactionItem key={transaction._id} transactionDetails={transaction} deleteTransaction={deleteTransaction} />
            ))
          )}
        </ul>

        <div className="history-pagination">
          <button disabled={page === 1} onClick={() => setPage((prev) => prev - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next</button>
        </div>
      </section>
    </div>
  );
};

export default History;
