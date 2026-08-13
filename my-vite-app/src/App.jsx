import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MoneyManager from "./components/MoneyManager";
import MoneyLogin from "./components/MoneyLogin";
import MoneyRegister from "./components/MoneyRegister";
import UserProfile from "./components/UserProfile";
import ProtectedRoutes from "./components/ProtectedRoutes";
import Analytics from "./components/Analytics";

import "./App.css";

const App = () => {
  const [theme, setTheme] = useState("light");

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  return (
    <div
      className={`theme-shell ${theme === "dark" ? "dark-theme" : "light-theme"}`}
    >
      <Routes>
        <Route path="/login" element={<MoneyLogin />} />
        <Route path="/register" element={<MoneyRegister />} />
        <Route
          element={
            <ProtectedRoutes theme={theme} onToggleTheme={toggleTheme} />
          }
        >
          <Route path="/" element={<MoneyManager />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
};

export default App;
