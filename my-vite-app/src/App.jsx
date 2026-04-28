import { Routes, Route, Navigate  } from "react-router-dom";
import MoneyManager from "./components/MoneyManager";
import MoneyLogin from "./components/MoneyLogin";
import MoneySignUp from "./components/MoneyRegister";
import UserProfileDetails from "./components/UserProfile";
import ProtectedRoutes from "./components/ProtectedRoutes";
import Analytics from "./components/Analytics";

import "./App.css";

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<MoneyLogin />} />
      <Route path="/register" element={<MoneySignUp />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/" element={<MoneyManager />} />
        <Route path="/profile" element={<UserProfileDetails />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="*" element={<Navigate to="/" replace/>} />
      </Route>
    </Routes>
  );
};

export default App;
