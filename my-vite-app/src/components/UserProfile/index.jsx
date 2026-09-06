import { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Mail,
  Pencil,
  Save,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import LoadingState from "../LoadingState";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";

const UserProfile = () => {
  const [userData, setUserData] = useState({});
  const [summary, setSummary] = useState({ balance: 0, income: 0, expenses: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", gender: "Male" });

  const jwtToken = Cookies.get("jwt_token");
  const headers = { Authorization: `Bearer ${jwtToken}` };

  const loadProfile = async () => {
    try {
      setLoading(true);
      const [profileRes, summaryRes, transactionRes] = await Promise.all([
        fetch(`${API}/profile`, { headers }),
        fetch(`${API}/`, { headers }),
        fetch(`${API}/transactions`, { headers }),
      ]);

      if (!profileRes.ok || !summaryRes.ok || !transactionRes.ok) {
        throw new Error("Failed to load profile");
      }

      const [profileData, summaryData, transactionData] = await Promise.all([
        profileRes.json(),
        summaryRes.json(),
        transactionRes.json(),
      ]);

      setUserData(profileData || {});
      setForm({
        name: profileData?.name || "",
        email: profileData?.email || "",
        gender: profileData?.gender || "Male",
      });
      setSummary(summaryData || {});
      setTransactions(transactionData.transactions || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Unable to load your profile right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const initials = useMemo(() => {
    const name = userData.name?.trim();
    return name ? name.charAt(0).toUpperCase() : "U";
  }, [userData.name]);

  const avatarUrl = userData.profile_image || userData.avatar || userData.photo || "";

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const memberSince = userData.created_at
    ? new Date(userData.created_at).toLocaleDateString("en-IN", {
        month: "short",
        year: "numeric",
      })
    : "Not available";

  const onEditChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const cancelEdit = () => {
    setForm({
      name: userData.name || "",
      email: userData.email || "",
      gender: userData.gender || "Male",
    });
    setEditing(false);
  };

  const saveProfile = async (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (!form.email.trim() || !form.email.includes("@")) {
      toast.error("Please enter a valid email");
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          gender: form.gender,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update profile");
      }

      setUserData(data.user || userData);
      setEditing(false);
      toast.success("Profile updated successfully");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <LoadingState rows={4} label="Loading your profile..." />
      </div>
    );
  }

  if (error) return <div className="profile-page profile-error">{error}</div>;

  return (
    <div className="profile-page">
      <div className="profile-heading profile-heading-row">
        <div>
          <p>Account</p>
          <h1>Your Profile</h1>
          <span>Personal details and live account statistics.</span>
        </div>
        <button className="profile-edit-trigger" type="button" onClick={() => setEditing(true)}>
          <Pencil size={17} /> Edit Profile
        </button>
      </div>

      <section className="profile-hero">
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${userData.name || "User"} profile`} className="profile-avatar-img" />
        ) : (
          <div className="profile-avatar-fallback" aria-label={`${userData.name || "User"} initial avatar`}>
            {initials}
          </div>
        )}
        <div className="profile-identity">
          <div className="profile-name-row">
            <h2>{userData.name || "User"}</h2>
            <span className="profile-badge"><ShieldCheck size={14} /> Member</span>
          </div>
          <p>@{userData.username || "username"}</p>
          <span><Mail size={15} /> {userData.email || "Email not available"}</span>
        </div>
      </section>

      <section className="profile-stat-grid">
        <article><span>Total Balance</span><strong>{formatMoney(summary.balance)}</strong><WalletCards size={18} /></article>
        <article><span>Monthly Income</span><strong className="profile-income">{formatMoney(summary.income)}</strong></article>
        <article><span>Monthly Expenses</span><strong className="profile-expense">{formatMoney(summary.expenses)}</strong></article>
        <article><span>Total Transactions</span><strong>{transactions.length}</strong></article>
      </section>

      <section className="profile-card-grid">
        <article className="profile-card">
          <div className="profile-card-title"><UserRound size={18} /><h3>Personal Information</h3></div>
          <div className="profile-detail-row"><span>Full name</span><strong>{userData.name || "Not available"}</strong></div>
          <div className="profile-detail-row"><span>Email</span><strong>{userData.email || "Not available"}</strong></div>
          <div className="profile-detail-row"><span>Username</span><strong>{userData.username || "Not available"}</strong></div>
          <div className="profile-detail-row"><span>Gender</span><strong>{userData.gender || "Not specified"}</strong></div>
        </article>

        <article className="profile-card">
          <div className="profile-card-title"><CalendarDays size={18} /><h3>Account Overview</h3></div>
          <div className="profile-detail-row"><span>Member since</span><strong>{memberSince}</strong></div>
          <div className="profile-detail-row"><span>Currency</span><strong>INR (₹)</strong></div>
          <div className="profile-detail-row"><span>Account status</span><strong className="status-active">Active</strong></div>
          <div className="profile-detail-row"><span>Recorded transactions</span><strong>{transactions.length}</strong></div>
        </article>
      </section>

      {editing && (
        <div className="profile-edit-overlay" onClick={cancelEdit}>
          <section className="profile-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-edit-header">
              <div>
                <span>Profile settings</span>
                <h2>Edit personal details</h2>
              </div>
              <button type="button" aria-label="Close profile editor" onClick={cancelEdit}>
                <X size={20} />
              </button>
            </div>

            <form className="profile-edit-form" onSubmit={saveProfile}>
              <label>
                <span>Full name</span>
                <input name="name" value={form.name} onChange={onEditChange} placeholder="Your full name" />
              </label>

              <label>
                <span>Email address</span>
                <input name="email" type="email" value={form.email} onChange={onEditChange} placeholder="name@example.com" />
              </label>

              <label>
                <span>Gender</span>
                <select name="gender" value={form.gender} onChange={onEditChange}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Others">Others</option>
                </select>
              </label>

              <div className="profile-readonly-note">
                Username <strong>@{userData.username}</strong> remains your login ID and cannot be changed here.
              </div>

              <div className="profile-edit-actions">
                <button className="profile-cancel-btn" type="button" onClick={cancelEdit}>Cancel</button>
                <button className="profile-save-btn" type="submit" disabled={saving}>
                  <Save size={17} /> {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
