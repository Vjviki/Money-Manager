import { useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import toast from "react-hot-toast";
import {
  CalendarDays,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
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

const PasswordInput = ({
  label,
  name,
  visibilityKey,
  placeholder,
  showPasswords,
  passwordForm,
  updatePasswordField,
  toggleVisibility,
}) => (
  <label className="profile-password-field">
    <span>{label}</span>
    <div className="profile-password-input-wrap">
      <input
        name={name}
        type={showPasswords[visibilityKey] ? "text" : "password"}
        value={passwordForm[name]}
        onChange={updatePasswordField}
        placeholder={placeholder}
        autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
      />
      <button
        type="button"
        aria-label={showPasswords[visibilityKey] ? `Hide ${label}` : `Show ${label}`}
        onClick={() => toggleVisibility(visibilityKey)}
      >
        {showPasswords[visibilityKey] ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </label>
);

const UserProfile = () => {
  const [userData, setUserData] = useState({});
  const [summary, setSummary] = useState({ balance: 0, income: 0, expenses: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrivateAmounts, setShowPrivateAmounts] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", gender: "Male" });

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirm: false,
  });

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

  const privateMoney = (value) => showPrivateAmounts ? formatMoney(value) : "₹ ••••••";

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

    if (!form.name.trim()) return toast.error("Please enter your name");
    if (!form.email.trim() || !form.email.includes("@")) {
      return toast.error("Please enter a valid email");
    }

    try {
      setSaving(true);
      const response = await fetch(`${API}/profile`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          gender: form.gender,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update profile");

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

  const closePasswordModal = () => {
    setPasswordOpen(false);
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setShowPasswords({ current: false, next: false, confirm: false });
  };

  const updatePasswordField = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const togglePasswordVisibility = (visibilityKey) => {
    setShowPasswords((prev) => ({
      ...prev,
      [visibilityKey]: !prev[visibilityKey],
    }));
  };

  const changePassword = async (event) => {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      return toast.error("Enter your current password");
    }
    if (passwordForm.newPassword.length < 8) {
      return toast.error("New password must be at least 8 characters");
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error("New passwords do not match");
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      return toast.error("Choose a password different from your current password");
    }

    try {
      setPasswordSaving(true);
      const response = await fetch(`${API}/change-password`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to change password");

      closePasswordModal();
      toast.success("Password changed successfully");
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Unable to change password");
    } finally {
      setPasswordSaving(false);
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
          <span>Personal details, account statistics and security.</span>
        </div>
        <div className="profile-heading-actions">
          <button
            className="profile-privacy-trigger"
            type="button"
            onClick={() => setShowPrivateAmounts((prev) => !prev)}
            aria-label={showPrivateAmounts ? "Hide financial amounts" : "Show financial amounts"}
            title={showPrivateAmounts ? "Hide amounts" : "Show amounts"}
          >
            {showPrivateAmounts ? <Eye size={17} /> : <EyeOff size={17} />}
            {showPrivateAmounts ? "Hide Amounts" : "Show Amounts"}
          </button>
          <button className="profile-edit-trigger" type="button" onClick={() => setEditing(true)}>
            <Pencil size={17} /> Edit Profile
          </button>
        </div>
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
        <article><span>Total Balance</span><strong>{privateMoney(summary.balance)}</strong><WalletCards size={18} /></article>
        <article><span>Monthly Income</span><strong className="profile-income">{privateMoney(summary.income)}</strong></article>
        <article><span>Monthly Expenses</span><strong className="profile-expense">{privateMoney(summary.expenses)}</strong></article>
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

      <section className="profile-security-card">
        <div className="profile-security-icon"><LockKeyhole size={22} /></div>
        <div className="profile-security-copy">
          <span>Security</span>
          <h3>Password & sign-in</h3>
          <p>Use your current password to set a new password for this Money Manager account.</p>
        </div>
        <button type="button" className="profile-security-btn" onClick={() => setPasswordOpen(true)}>
          <KeyRound size={17} /> Change Password
        </button>
      </section>

      {editing && (
        <div className="profile-edit-overlay" onClick={cancelEdit}>
          <section className="profile-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-edit-header">
              <div><span>Profile settings</span><h2>Edit personal details</h2></div>
              <button type="button" aria-label="Close profile editor" onClick={cancelEdit}><X size={20} /></button>
            </div>

            <form className="profile-edit-form" onSubmit={saveProfile}>
              <label><span>Full name</span><input name="name" value={form.name} onChange={onEditChange} placeholder="Your full name" /></label>
              <label><span>Email address</span><input name="email" type="email" value={form.email} onChange={onEditChange} placeholder="name@example.com" /></label>
              <label>
                <span>Gender</span>
                <select name="gender" value={form.gender} onChange={onEditChange}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Others">Others</option>
                </select>
              </label>
              <div className="profile-readonly-note">Username <strong>@{userData.username}</strong> remains your login ID and cannot be changed here.</div>
              <div className="profile-edit-actions">
                <button className="profile-cancel-btn" type="button" onClick={cancelEdit}>Cancel</button>
                <button className="profile-save-btn" type="submit" disabled={saving}><Save size={17} /> {saving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {passwordOpen && (
        <div className="profile-edit-overlay" onClick={closePasswordModal}>
          <section className="profile-edit-modal profile-password-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-edit-header">
              <div><span>Account security</span><h2>Change your password</h2></div>
              <button type="button" aria-label="Close password editor" onClick={closePasswordModal}><X size={20} /></button>
            </div>

            <form className="profile-edit-form" onSubmit={changePassword}>
              <div className="profile-password-note">
                <ShieldCheck size={18} />
                <p>We verify your current password before saving the new one. Use at least 8 characters.</p>
              </div>

              <PasswordInput
                label="Current password"
                name="currentPassword"
                visibilityKey="current"
                placeholder="Enter current password"
                showPasswords={showPasswords}
                passwordForm={passwordForm}
                updatePasswordField={updatePasswordField}
                toggleVisibility={togglePasswordVisibility}
              />
              <PasswordInput
                label="New password"
                name="newPassword"
                visibilityKey="next"
                placeholder="At least 8 characters"
                showPasswords={showPasswords}
                passwordForm={passwordForm}
                updatePasswordField={updatePasswordField}
                toggleVisibility={togglePasswordVisibility}
              />
              <PasswordInput
                label="Confirm new password"
                name="confirmPassword"
                visibilityKey="confirm"
                placeholder="Repeat new password"
                showPasswords={showPasswords}
                passwordForm={passwordForm}
                updatePasswordField={updatePasswordField}
                toggleVisibility={togglePasswordVisibility}
              />

              <div className="profile-edit-actions">
                <button className="profile-cancel-btn" type="button" onClick={closePasswordModal}>Cancel</button>
                <button className="profile-save-btn" type="submit" disabled={passwordSaving}>
                  <KeyRound size={17} /> {passwordSaving ? "Updating..." : "Update Password"}
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
