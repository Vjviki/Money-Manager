import {
  BarChart3,
  History,
  Home,
  LogOut,
  MoonStar,
  SunMedium,
  UserRound,
} from "lucide-react";
import Cookies from "js-cookie";
import { useNavigate, NavLink } from "react-router-dom";
import "./index.css";

const navigation = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/history", label: "History", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/profile", label: "Profile", icon: UserRound },
];

const Navbar = ({ theme, onToggleTheme }) => {
  const navigate = useNavigate();

  const logoutBtn = () => {
    Cookies.remove("jwt_token");
    navigate("/login");
  };

  return (
    <>
      <aside className="desktop-sidebar">
        <div className="brand-block">
          <div className="brand-logo">MM</div>
          <div>
            <strong>Money Manager</strong>
            <span>Track Today, Build Tomorrow</span>
          </div>
        </div>

        <div className="sidebar-links">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
              <Icon size={19} /> <span>{label}</span>
            </NavLink>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="financial-note">Small steps 🌱<br />make big financial freedom.</div>
          <button type="button" className="sidebar-logout" onClick={logoutBtn}><LogOut size={18} /> Logout</button>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="mobile-brand">
          <div className="brand-logo">MM</div>
          <div><strong>Money Manager</strong><span>Track Today, Build Tomorrow</span></div>
        </div>
        <div className="topbar-actions">
          <button type="button" className="theme-switch" onClick={onToggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            <span className={theme === "light" ? "selected" : ""}><SunMedium size={17} /></span>
            <span className={theme === "dark" ? "selected" : ""}><MoonStar size={17} /></span>
          </button>
          <button type="button" className="topbar-logout" onClick={logoutBtn}><LogOut size={18} /><span>Logout</span></button>
        </div>
      </header>

      <nav className="mobile-bottom-nav">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav-link ${isActive ? "active" : ""}`}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
};

export default Navbar;
