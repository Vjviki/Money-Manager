import { Menu, X } from "lucide-react";
import Cookies from "js-cookie";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./index.css";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeBar, setActiveBar] = useState("home");

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const navigate = useNavigate();

  const logoutBtn = () => {
    Cookies.remove("jwt_token");
    navigate("/login");
  };

  const profileBtn = () => {
    navigate("/profile");
    setActiveBar("profile");
  };

  const homeBtn = () => {
    navigate("/");
    setActiveBar("home");
  };

  const analyticBtn = () => {
    navigate("/analytics");
    setActiveBar("analytics");
  };

  return (
    <nav className="navbar">
      <div className="responsive-navbar-container">
        {/* Logo */}
        <button className="navbar-logo">
          <h1 className="navbar-logo-title">MM</h1>
        </button>

        {/* Menu Icon (for mobile) */}
        <button className="navbar-menu-icon" onClick={toggleMenu}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Links */}
        <div className={`navbar-menu-links ${menuOpen ? "open" : ""}`}>
          <button
            className={`navbar-menu-link ${activeBar == "home" ? "active" : ""}`}
            onClick={homeBtn}
          >
            Home
          </button>
          <button
            className={`navbar-menu-link ${activeBar == "analytics" ? "active" : ""}`}
            onClick={analyticBtn}
          >
            Analytics
          </button>
          <button
            className={`navbar-menu-link ${activeBar == "profile" ? "active" : ""}`}
            onClick={profileBtn}
          >
            Profile
          </button>
          <button className="navbar-logout-button" onClick={logoutBtn}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
