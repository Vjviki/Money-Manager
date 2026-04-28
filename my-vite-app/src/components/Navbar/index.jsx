import { Menu, X } from "lucide-react";
import Cookies from "js-cookie";
import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import "./index.css";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <NavLink
            to="/"
            className={({ isActive }) =>
              `navbar-menu-link ${isActive ? "active" : ""}`
            }
          >
            Home
          </NavLink>
          <NavLink
            to="/analytics"
            className={({ isActive }) =>
              `navbar-menu-link ${isActive ? "active" : ""}`
            }
          >
            Analytics
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `navbar-menu-link ${isActive ? "active" : ""}`
            }
          >
            Profile
          </NavLink>
          <button className="navbar-logout-button" onClick={logoutBtn}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
