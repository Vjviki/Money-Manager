import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import Cookies from "js-cookie";
import ForgotPassword from "../ForgotPassword";
import "./index.css";

const API = "https://money-manager-wmon.onrender.com";

const MoneyLogin = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const onSubmitSuccess = (jwtToken) => {
    Cookies.set("jwt_token", jwtToken, {
      expires: 10,
      path: "/",
    });
    navigate("/");
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setErrorMessage("Enter your username and password.");
      return;
    }

    try {
      setLoginLoading(true);
      const response = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password }),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.errorMessage || "Unable to sign in. Please check your details.");
      }

      if (!data.jwtToken) {
        throw new Error("The server did not return a login token. Please try again.");
      }

      onSubmitSuccess(data.jwtToken);
    } catch (error) {
      if (error instanceof TypeError) {
        setErrorMessage("Unable to connect to the server. Check your internet connection and try again.");
      } else {
        setErrorMessage(error.message || "Unable to sign in right now.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const token = Cookies.get("jwt_token");
  if (token !== undefined) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand-icon"><KeyRound size={22} /></div>
        <h1 className="login-header">Money Manager</h1>
        <p className="login-subtitle">Welcome back. Sign in to manage your money.</p>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username" className="label">Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              className="input-field"
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              disabled={loginLoading}
            />
          </div>

          <div className="form-group login-password-group">
            <div className="login-label-row">
              <label htmlFor="password" className="label">Password</label>
              <button type="button" className="forgot-password-link" onClick={() => setForgotOpen(true)}>
                Forgot password?
              </button>
            </div>
            <div className="moneysignup-password-container">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                className="moneysignup-password-input"
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loginLoading}
              />
              <button
                type="button"
                className="password-eye-icon"
                onClick={() => setShowPassword((prevState) => !prevState)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {errorMessage && <div className="login-alert login-alert-error">{errorMessage}</div>}

          <button type="submit" className="login-btn" disabled={loginLoading}>
            {loginLoading ? (
              <><LoaderCircle size={18} className="login-spinner" /> Signing in...</>
            ) : (
              "Login"
            )}
          </button>
        </form>

        <p className="signup-text">
          Don’t have an account?{" "}
          <Link className="signup-link" to="/register">Sign Up</Link>
        </p>
      </div>

      {forgotOpen && <ForgotPassword onClose={() => setForgotOpen(false)} />}
    </div>
  );
};

export default MoneyLogin;
