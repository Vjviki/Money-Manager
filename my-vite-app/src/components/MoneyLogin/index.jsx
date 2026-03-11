import { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Cookies from "js-cookie";
import "./index.css";

const MoneyLogin = () => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const showpasswordLogin = () => {
    setShowPassword((prevState) => !prevState);
  };

  const handleUsernameChange = (event) => {
    setUsername(event.target.value);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const onSubmitSuccess = (jwtToken) => {
    Cookies.set("jwt_token", jwtToken, {
      expires: 10,
      path: "/",
    });

    navigate("/");
  };
  const onSubmitFailure = (errorMsg) => {
    setErrorMessage(errorMsg);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const userDetails = { username, password };
    const url = "http://localhost:3000/login";
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userDetails),
    };
    const response = await fetch(url, options);
    const data = await response.json();
    if (response.ok === true) {
      onSubmitSuccess(data.jwtToken);
    } else {
      onSubmitFailure(data.errorMessage);
    }
  };

  const token = Cookies.get("jwt_token");
  if (token !== undefined) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-header">Money Manager</h1>
        <p className="login-subtitle">Login to your account</p>
        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="username" className="label" forhtml="username">
              Username
            </label>
            <input
              type="text"
              placeholder="Enter your username"
              className="input-field"
              id="username"
              onChange={handleUsernameChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="password" className="label" forhtml="password">
              Password
            </label>
            <div className="moneysignup-password-container">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                className="moneysignup-password-input"
                id="password"
                onChange={handlePasswordChange}
              />
              <button
                type="button"
                className="password-eye-icon"
                onClick={showpasswordLogin}
              >
                {showPassword ? (
                  <Eye size={20} className="eye-icon" />
                ) : (
                  <EyeOff size={20} className="eye-icon" />
                )}
              </button>
            </div>
          </div>
          <button type="submit" className="login-btn">
            Login
          </button>
          <p className="error-message">{errorMessage}</p>
        </form>
        <p className="signup-text">
          Don’t have an account?{" "}
          <Link className="signup-link" to="/register">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default MoneyLogin;
