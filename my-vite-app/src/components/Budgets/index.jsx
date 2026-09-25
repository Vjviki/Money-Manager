import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';
import { Target, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '../../utils/session';
import LoadingState from '../LoadingState';
import './index.css';

const API = 'https://money-manager-wmon.onrender.com';
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const labels = { 'on-track': 'On track', warning: 'Near limit', reached: 'Limit reached', exceeded: 'Over budget' };
const initialMonth = () => new Date().toISOString().slice(0, 7);

export default function Budgets() {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState({ budgets: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const token = Cookies.get('jwt_token');
  const refresh = () => setRevision(value => value + 1);
  const clearForm = () => { setCategory(''); setAmount(''); setEditing(false); };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    (async () => {
      try {
        const response = await apiFetch(`${API}/budgets?month=${encodeURIComponent(month)}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load budgets');
        if (!controller.signal.aborted) setData(result);
      } catch (err) { if (!controller.signal.aborted) setError(err.message || 'Unable to load budgets'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [month, token, revision]);

  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);

  const save = async event => {
    event.preventDefault();
    if (saving) return;
    const value = Number(amount);
    if (!category.trim() || !Number.isFinite(value) || value <= 0 || Number(value.toFixed(2)) !== value) {
      return toast.error('Enter a category and a positive amount with at most two decimal places');
    }
    try {
      setSaving(true);
      const response = await apiFetch(`${API}/budgets/${month}`, { method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category.trim(), amount: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save budget');
      clearForm(); refresh(); toast.success('Budget saved');
    } catch (err) { toast.error(err.message || 'Unable to save budget'); }
    finally { setSaving(false); }
  };

  const remove = async budget => {
    if (saving || !window.confirm(`Remove the ${budget.category} budget for ${month}? Your transactions will stay saved.`)) return;
    try {
      setSaving(true);
      const response = await apiFetch(`${API}/budgets/${month}/${budget._id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to remove budget');
      clearForm(); refresh(); toast.success('Budget removed');
    } catch (err) { toast.error(err.message || 'Unable to remove budget'); }
    finally { setSaving(false); }
  };

  return <main className="budgets-page">
    <header className="budgets-heading"><div><p>Plan your spending</p><h1><Target size={28} /> Monthly Budgets</h1>
      <span>Set a limit for each expense category and track how much is left.</span></div>
      <label>Budget month<input type="month" min="2000-01" max="2099-12" value={month} disabled={saving}
        onChange={event => { if (event.target.value) { setMonth(event.target.value); clearForm(); } }} /></label>
    </header>
    <section className="budget-panel">
      <h2>{editing ? 'Edit budget' : 'Set a category budget'}</h2>
      <form className="budget-form" onSubmit={save}>
        <label>Category<input list="budget-categories" maxLength={80} required value={category} disabled={saving || editing}
          placeholder="For example, Food" onChange={event => setCategory(event.target.value)} /></label>
        <datalist id="budget-categories">{[...new Set(['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Other', ...(data.categories || [])])].map(value => <option key={value} value={value} />)}</datalist>
        <label>Monthly limit (₹)<input type="number" min="0.01" max="1000000000" step="0.01" required value={amount} disabled={saving}
          placeholder="3000" onChange={event => setAmount(event.target.value)} /></label>
        <button className="budget-save" disabled={saving || loading || !!error}>{saving ? 'Saving…' : 'Save budget'}</button>
        {editing && <button type="button" disabled={saving} onClick={clearForm}>Cancel</button>}
      </form>
      <p className="budget-note">Use the same category name as your transactions. Saving an existing category updates its limit.</p>
    </section>
    <div className="budget-list-heading"><h2>Your budgets</h2><button type="button" onClick={refresh} disabled={loading || saving}><RefreshCw size={16} /> Refresh</button></div>
    <p className="budget-note">Includes active and archived expenses. Limits are set separately for each month.</p>
    {loading ? <LoadingState rows={3} label="Loading budgets…" /> : error ? <div className="budget-panel" role="alert">{error} <button onClick={refresh}>Retry</button></div> : <>
      {!!data.unreadableArchiveDates && <p className="budget-data-warning" role="alert">Some older archived payment dates could not be read. Spending totals may be incomplete.</p>}
      {!data.budgets.length ? <div className="budget-panel budget-empty">No budgets for this month yet. Add your first category above.</div> :
        <div className="budget-grid">{data.budgets.map(budget => <article className={`budget-panel budget-card ${budget.status}`} key={budget._id}>
          <div className="budget-card-heading"><h3>{budget.category}</h3><span className="budget-status">{labels[budget.status]}</span></div>
          <div className="budget-spending"><strong>{money(budget.spent)}</strong><span>spent of {money(budget.amount)}</span></div>
          <progress aria-label={`${budget.category} budget used`} max="100" value={Math.max(0, Math.min(100, budget.percent))} />
          <div className="budget-remaining"><strong>{money(Math.abs(budget.remaining))} {budget.remaining < 0 ? 'over budget' : 'remaining'}</strong><span>{budget.percent}% used</span></div>
          <div className="budget-card-actions"><button type="button" disabled={saving} aria-label={`Edit ${budget.category} budget`} onClick={() => { setCategory(budget.category); setAmount(String(budget.amount)); setEditing(true); window.scrollTo?.({ top: 0, behavior: 'smooth' }); }}><Pencil size={16} /> Edit</button>
            <button type="button" disabled={saving} aria-label={`Remove ${budget.category} budget`} onClick={() => remove(budget)}><Trash2 size={16} /> Remove</button></div>
        </article>)}</div>}
    </>}
  </main>;
}
