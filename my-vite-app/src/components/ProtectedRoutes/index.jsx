import { Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { validToken, tokenExpiry, endSession } from "../../utils/session";
import Navbar from "../Navbar";

const ProtectedRoutes = ({ theme, onToggleTheme }) => {
  const [jwtToken, setToken] = useState(validToken);
  useEffect(() => {
    const check = () => setToken(validToken());
    window.addEventListener("session-ended", check);
    document.addEventListener("visibilitychange", check);
    const timer = jwtToken ? setTimeout(() => endSession(jwtToken), Math.max(0, tokenExpiry(jwtToken) - Date.now())) : null;
    return () => {
      clearTimeout(timer);
      window.removeEventListener("session-ended", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [jwtToken]);

  if (!jwtToken) {
    return <Navigate to="/login" />;
  }

  return (
    <>
      <Navbar theme={theme} onToggleTheme={onToggleTheme} />
      <Outlet />
    </>
  );
};

export default ProtectedRoutes;
