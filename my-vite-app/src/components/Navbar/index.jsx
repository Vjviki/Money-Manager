import { Menu, MoonStar, SunMedium, X } from "lucide-react";
import Cookies from "js-cookie";
import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import "./index.css";

const Navbar = ({ theme, onToggleTheme }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const navigate = useNavigate();

  const logoutBtn = () => {
    Cookies.remove("jwt_token");
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="responsive-navbar-container">
        <button className="navbar-logo" type="button">
          <h1 className="navbar-logo-title">MM</h1>
        </button>

        <button className="navbar-menu-icon" onClick={toggleMenu} type="button">
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

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

          <button
            type="button"
            className="theme-toggle-btn navbar-theme-btn"
            onClick={onToggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <SunMedium size={16} />
            ) : (
              <MoonStar size={16} />
            )}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          <button
            className="navbar-logout-button"
            onClick={logoutBtn}
            type="button"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
