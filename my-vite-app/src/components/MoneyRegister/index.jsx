import { Link, Navigate } from "react-router-dom";
import Cookies from "js-cookie";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import "./index.css";

const MoneySignUp = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [userInfo, setUserInfo] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    gender: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setUserInfo((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const showpassword = () => {
    setShowPassword((prevState) => !prevState);
  };

  const signInForm = async (event) => {
    event.preventDefault();

    const url = "http://localhost:3000/register";
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userInfo),
    };

    const response = await fetch(url, options);
    const data = await response.json();
    if (response.ok === true) {
      setMessageType("success-message");
      setUserInfo({
        name: "",
        username: "",
        email: "",
        password: "",
      });
    } else {
      setMessageType("error-message");
    }
    setMessage(data.message);
    console.log(response);
  };

  const token = Cookies.get("jwt_token");
  if (token !== undefined) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="moneysignup-container">
      <div className="moneysignup-form-container">
        <h1 className="moneysignup-logo">Money Manager</h1>
        <h1 className="sign-up-header">Sign Up</h1>
        <p className="sign-in-subheader">
          Create an account or{" "}
          <Link to="/login" className="sign-in-link">
            Sign in
          </Link>
        </p>
        <form className="moneysignup-form" onSubmit={signInForm}>
          <div className="moneysignup-input-container">
            <label htmlFor="name" className="input-label">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={userInfo.name}
              placeholder="name"
              className="moneysignup-input"
              onChange={handleChange}
            />
          </div>
          <div className="moneysignup-input-container">
            <label htmlFor="username" className="input-label">
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={userInfo.username}
              placeholder="username"
              className="moneysignup-input"
              onChange={handleChange}
            />
          </div>
          <div className="moneysignup-input-container">
            <label htmlFor="email" className="input-label">
              Email
            </label>
            <input
              type="text"
              id="email"
              name="email"
              value={userInfo.email}
              placeholder="email"
              className="moneysignup-input"
              onChange={handleChange}
            />
          </div>
          <div className="moneysignup-input-container">
            <label htmlFor="password" className="input-label">
              Password
            </label>
            <div className="moneysignup-password-container">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                placeholder="password"
                value={userInfo.password}
                className="moneysignup-password-input"
                onChange={handleChange}
              />
              <button
                type="button"
                className="password-eye-icon"
                onClick={showpassword}
              >
                {showPassword ? (
                  <Eye size={20} className="eye-icon" />
                ) : (
                  <EyeOff size={20} className="eye-icon" />
                )}
              </button>
            </div>
          </div>
          <div className="moneysignup-input-container">
            <label htmlFor="gender" className="input-label">
              Gender
            </label>
            <div className="gender-radio-container">
              {["Male", "Female", "Other"].map((g) => (
                <div key={g} className="gender-radio-option-container">
                  <input
                    type="radio"
                    id={g}
                    name="gender"
                    value={g}
                    checked={userInfo.gender === g}
                    onChange={handleChange}
                    className="radio-input"
                  />
                  <label htmlFor={g} className="input-label">
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <button type="submit" className="moneysignup-button">
              Sign Up
            </button>
          </div>
          <p className={messageType}>{message}</p>
        </form>
      </div>
    </div>
  );
};

export default MoneySignUp;
