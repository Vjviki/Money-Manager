import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  User,
  UserRound,
} from "lucide-react";
import "./index.css";

const API_URL = "https://money-manager-wmon.onrender.com/register";

const initialForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  gender: "",
};

const MoneyRegister = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [userInfo, setUserInfo] = useState(initialForm);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setMessage("");
    setMessageType("");
    setUserInfo((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    const cleanName = userInfo.name.trim();
    const cleanUsername = userInfo.username.trim();
    const cleanEmail = userInfo.email.trim();

    if (!cleanName || !cleanUsername || !cleanEmail || !userInfo.password || !userInfo.gender) {
      return "Please complete all required fields.";
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      return "Please enter a valid email address.";
    }

    if (userInfo.password.length < 8) {
      return "Password must be at least 8 characters.";
    }

    if (userInfo.password !== userInfo.confirmPassword) {
      return "Passwords do not match.";
    }

    return "";
  };

  const signUpForm = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setMessageType("error-message");
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setMessage("");
    setMessageType("");

    try {
      const payload = {
        name: userInfo.name.trim(),
        username: userInfo.username.trim(),
        email: userInfo.email.trim().toLowerCase(),
        password: userInfo.password,
        gender: userInfo.gender,
      };

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || data.error || "Unable to create your account.");
      }

      setMessageType("success-message");
      setMessage(data.message || "Account created successfully. Redirecting to sign in...");
      setUserInfo(initialForm);

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      setMessageType("error-message");
      setMessage(
        isNetworkError
          ? "Unable to reach the server. Check your internet connection and try again."
          : error.message,
      );
    } finally {
      setLoading(false);
    }
  };

  const token = Cookies.get("jwt_token");
  if (token !== undefined) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="signup-page">
      <section className="signup-showcase" aria-hidden="true">
        <div className="signup-brand-mark">MM</div>
        <div className="signup-showcase-copy">
          <span className="signup-kicker">Money Manager</span>
          <h1>Start building better money habits.</h1>
          <p>
            Create your account to track income, expenses, savings and monthly trends in one place.
          </p>
          <div className="signup-benefits">
            <div><CheckCircle2 size={18} /> Simple transaction tracking</div>
            <div><CheckCircle2 size={18} /> Clear spending analytics</div>
            <div><CheckCircle2 size={18} /> Secure personal account</div>
          </div>
        </div>
      </section>

      <section className="signup-form-side">
        <div className="moneysignup-form-container">
          <div className="signup-mobile-brand">Money Manager</div>
          <div className="signup-heading-block">
            <p className="signup-eyebrow">Create account</p>
            <h2 className="sign-up-header">Sign up for Money Manager</h2>
            <p className="sign-in-subheader">
              Already have an account? <Link to="/login" className="sign-in-link">Sign in</Link>
            </p>
          </div>

          <form className="moneysignup-form" onSubmit={signUpForm} noValidate>
            <div className="signup-grid">
              <label className="moneysignup-input-container" htmlFor="name">
                <span className="input-label">Full name</span>
                <div className="signup-input-shell">
                  <UserRound size={18} />
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={userInfo.name}
                    placeholder="Enter your full name"
                    className="moneysignup-input"
                    onChange={handleChange}
                    autoComplete="name"
                    disabled={loading}
                    required
                  />
                </div>
              </label>

              <label className="moneysignup-input-container" htmlFor="username">
                <span className="input-label">Username</span>
                <div className="signup-input-shell">
                  <User size={18} />
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={userInfo.username}
                    placeholder="Choose a username"
                    className="moneysignup-input"
                    onChange={handleChange}
                    autoComplete="username"
                    disabled={loading}
                    required
                  />
                </div>
              </label>
            </div>

            <label className="moneysignup-input-container" htmlFor="email">
              <span className="input-label">Email address</span>
              <div className="signup-input-shell">
                <Mail size={18} />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={userInfo.email}
                  placeholder="you@example.com"
                  className="moneysignup-input"
                  onChange={handleChange}
                  autoComplete="email"
                  inputMode="email"
                  disabled={loading}
                  required
                />
              </div>
            </label>

            <div className="signup-grid">
              <label className="moneysignup-input-container" htmlFor="password">
                <span className="input-label">Password</span>
                <div className="signup-input-shell signup-password-shell">
                  <LockKeyhole size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={userInfo.password}
                    placeholder="At least 8 characters"
                    className="moneysignup-input"
                    onChange={handleChange}
                    autoComplete="new-password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="password-eye-icon"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    disabled={loading}
                  >
                    {showPassword ? <Eye size={19} /> : <EyeOff size={19} />}
                  </button>
                </div>
              </label>

              <label className="moneysignup-input-container" htmlFor="confirmPassword">
                <span className="input-label">Confirm password</span>
                <div className="signup-input-shell signup-password-shell">
                  <LockKeyhole size={18} />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={userInfo.confirmPassword}
                    placeholder="Repeat your password"
                    className="moneysignup-input"
                    onChange={handleChange}
                    autoComplete="new-password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    className="password-eye-icon"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
                    disabled={loading}
                  >
                    {showConfirmPassword ? <Eye size={19} /> : <EyeOff size={19} />}
                  </button>
                </div>
              </label>
            </div>

            <fieldset className="gender-fieldset" disabled={loading}>
              <legend className="input-label">Gender</legend>
              <div className="gender-radio-container">
                {["Male", "Female", "Others"].map((gender) => (
                  <label key={gender} className={`gender-radio-option-container ${userInfo.gender === gender ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="gender"
                      value={gender}
                      checked={userInfo.gender === gender}
                      onChange={handleChange}
                      className="radio-input"
                    />
                    <span>{gender}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {message && (
              <div className={`signup-message ${messageType}`} role="status">
                {message}
              </div>
            )}

            <button type="submit" className="moneysignup-button" disabled={loading}>
              {loading ? (
                <>
                  <LoaderCircle size={19} className="signup-spinner" /> Creating account...
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          <p className="signup-footer-note">By creating an account, you can securely access your personal Money Manager dashboard.</p>
        </div>
      </section>
    </main>
  );
};

export default MoneyRegister;
