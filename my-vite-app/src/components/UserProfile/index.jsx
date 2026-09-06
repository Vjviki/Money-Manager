import { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import { CalendarDays, Mail, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import LoadingState from "../LoadingState";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";

const UserProfile = () => {
  const [userData, setUserData] = useState({});
  const [summary, setSummary] = useState({ balance: 0, income: 0, expenses: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const jwtToken = Cookies.get("jwt_token");
        const headers = { Authorization: `Bearer ${jwtToken}` };
        const [profileRes, summaryRes, transactionRes] = await Promise.all([
          fetch(`${API}/profile`, { headers }),
          fetch(`${API}/`, { headers }),
          fetch(`${API}/transactions`, { headers }),
        ]);

        if (!profileRes.ok || !summaryRes.ok || !transactionRes.ok) throw new Error("Failed to load profile");

        const [profileData, summaryData, transactionData] = await Promise.all([
          profileRes.json(),
          summaryRes.json(),
          transactionRes.json(),
        ]);

        setUserData(profileData || {});
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

    loadProfile();
  }, []);

  const initials = useMemo(() => {
    const name = userData.name?.trim();
    return name ? name.charAt(0).toUpperCase() : "U";
  }, [userData.name]);

  const avatarUrl = userData.profile_image || userData.avatar || userData.photo || "";

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));

  const memberSince = userData.created_at
    ? new Date(userData.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "Not available";

  if (loading) {
    return <div className="profile-page"><LoadingState rows={4} label="Loading your profile..." /></div>;
  }

  if (error) return <div className="profile-page profile-error">{error}</div>;

  return (
    <div className="profile-page">
      <div className="profile-heading">
        <p>Account</p>
        <h1>Your Profile</h1>
        <span>Personal details and live account statistics.</span>
      </div>

      <section className="profile-hero">
        {avatarUrl ? (
          <img src={avatarUrl} alt={`${userData.name || "User"} profile`} className="profile-avatar-img" />
        ) : (
          <div className="profile-avatar-fallback" aria-label={`${userData.name || "User"} initial avatar`}>{initials}</div>
        )}
        <div className="profile-identity">
          <div className="profile-name-row"><h2>{userData.name || "User"}</h2><span className="profile-badge"><ShieldCheck size={14} /> Member</span></div>
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
    </div>
  );
};

export default UserProfile;
