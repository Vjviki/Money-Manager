import { archiveTransactions } from "../../utils/archive";
import { apiFetch } from "../../utils/session";
import { useEffect, useRef, useState } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import TransactionItem from "../TransactionItem";
import LoadingState from "../LoadingState";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";
const ITEMS_PER_PAGE = 20;
const normalizeText = (value = "") => value.trim().toLowerCase();

const getLocalDateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const History = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const resetBusy = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", category: "", amount: "", type: "Income", date: "" });

  const token = Cookies.get("jwt_token");

  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const latestRequest = useRef(0);
  const loadTransactions = () => setRevision(value => value + 1);

  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    const load = async () => {
      setLoading(true);
      setLoadError("");
      try {
        if (fromDate && toDate && fromDate > toDate) throw new Error("From date must be on or before To date");
        const params = new URLSearchParams({ page: String(page), limit: String(ITEMS_PER_PAGE), categories: "1" });
        if (search) params.set("q", search);
        if (type !== "ALL") params.set("type", type);
        if (category !== "ALL") params.set("category", category);
        if (fromDate) params.set("from", new Date(`${fromDate}T00:00:00`).toISOString());
        if (toDate) {
          const end = new Date(`${toDate}T00:00:00`);
          end.setDate(end.getDate() + 1);
          params.set("to", end.toISOString());
        }
        const response = await apiFetch(`${API}/transactions?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load transaction history. Please retry.");
        const data = await response.json();
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setTransactions(data.transactions || []);
        setTotal(data.total ?? data.transactions?.length ?? 0);
        setTotalPages(data.totalPages || 1);
        setCategories(data.categories || []);
        if (data.page && data.page !== page) setPage(data.page);
      } catch (error) {
        if (controller.signal.aborted || requestId !== latestRequest.current) return;
        setLoadError(error.message || "Unable to load transaction history");
      } finally {
        if (!controller.signal.aborted && requestId === latestRequest.current) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [token, page, search, type, category, fromDate, toDate, revision]);

  const deleteTransaction = async (id) => {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      const response = await apiFetch(`${API}/transactions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Delete failed");
      loadTransactions();
      toast.success("Transaction deleted");
    } catch (error) {
      console.error(error);
      toast.error("Unable to delete transaction");
    }
  };

  const editTransaction = (transaction) => {
    setEditing(transaction);
    setEditForm({
      title: transaction.title || "",
      category: transaction.category || "Other",
      amount: String(transaction.amount || ""),
      type: transaction.type || "Income",
      date: getLocalDateKey(transaction.created_at),
    });
  };

  const saveTransaction = async (event) => {
    event.preventDefault();
    if (!editForm.title.trim() || !editForm.category.trim() || Number(editForm.amount) <= 0 || !editForm.date) {
      toast.error("Please complete all transaction fields");
      return;
    }

    try {
      setSaving(true);
      const response = await apiFetch(`${API}/transactions/${editing._id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: editForm.title.trim(),
          category: editForm.category.trim(),
          amount: Number(editForm.amount),
          type: editForm.type,
          created_at: editForm.date,
        }),
      });
      if (!response.ok) throw new Error("Update failed");
      loadTransactions();
      setEditing(null);
      toast.success("Transaction updated");
    } catch (error) {
      console.error(error);
      toast.error("Unable to update transaction");
    } finally {
      setSaving(false);
    }
  };

  const clearFilters = () => {
    setQuery(""); setSearch(""); setType("ALL"); setCategory("ALL"); setFromDate(""); setToDate(""); setPage(1);
  };

  const resetMonth = async () => {
    if (resetBusy.current) return;
    const confirmReset = window.confirm("Archive all current transactions? Each payment will appear under its transaction month in Analytics. Payments added during archiving will remain in History.");
    if (!confirmReset) return;
    try {
      resetBusy.current = true;
      setResetting(true);
      const result = await archiveTransactions(API, token);
      clearFilters();
      toast.success(`${result.archivedCount} transactions archived`);
      await loadTransactions();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Unable to archive transactions");
    } finally {
      resetBusy.current = false;
      setResetting(false);
    }
  };

  return (
    <div className="history-page">
      <div className="history-page-heading">
        <div><p>Transactions</p><h1>Transaction History</h1><span>Search, filter and manage every transaction in one place.</span></div>
        <div className="history-heading-actions">
          <div className="history-count">{total} records</div>
          <button type="button" className="reset-month-btn" onClick={resetMonth} disabled={resetting}><RotateCcw size={17} />{resetting ? "Archiving..." : "Archive Transactions"}</button>
        </div>
      </div>

      <section className="history-panel">
        <div className="history-toolbar-title"><SlidersHorizontal size={18} /> Filters</div>
        <div className="history-toolbar">
          <label className="history-search"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or category..." /></label>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="ALL">All categories</option>{categories.map((item) => <option key={normalizeText(item)} value={item}>{item}</option>)}</select>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="ALL">All types</option><option value="Income">Income</option><option value="Expenses">Expense</option></select>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} aria-label="From date" />
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} aria-label="To date" />
          <button type="button" className="clear-filter-btn" onClick={clearFilters}>Clear Filters</button>
        </div>
      </section>

      <section className="history-panel history-records-panel">
        <div className="history-table-head"><span>Date</span><span>Title & Category</span><span>Amount</span><span>Type</span><span>Action</span></div>
        {loading ? <LoadingState variant="list" rows={5} label="Loading transaction history..." /> : loadError ? <div className="history-empty" role="alert">{loadError} <button type="button" onClick={loadTransactions}>Retry</button></div> : <>
          <ul className="history-list">
            {transactions.length === 0 ? <div className="history-empty">No transactions match these filters.</div> : transactions.map((transaction) => <TransactionItem key={transaction._id} transactionDetails={transaction} deleteTransaction={deleteTransaction} editTransaction={editTransaction} />)}
          </ul>
          <div className="history-pagination">
            <button type="button" disabled={page === 1} onClick={() => setPage((prev) => prev - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>Next</button>
          </div>
        </>}
      </section>

      {editing && (
        <div className="edit-overlay" onClick={() => setEditing(null)}>
          <div className="edit-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="edit-dialog-header"><div><span>Edit transaction</span><h2>{editing.title}</h2></div><button type="button" onClick={() => setEditing(null)} aria-label="Close edit"><X size={20} /></button></div>
            <form className="edit-form" onSubmit={saveTransaction}>
              <label><span>Title</span><input value={editForm.title} onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))} /></label>
              <label><span>Category</span><input value={editForm.category} onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))} /></label>
              <label><span>Amount</span><input type="number" min="1" value={editForm.amount} onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))} /></label>
              <label><span>Date</span><input type="date" value={editForm.date} onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))} /></label>
              <label><span>Type</span><select value={editForm.type} onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value }))}><option value="Income">Income</option><option value="Expenses">Expense</option></select></label>
              <div className="edit-form-actions"><button type="button" className="edit-cancel" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="edit-save" disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
