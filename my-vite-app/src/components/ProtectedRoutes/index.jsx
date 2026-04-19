import { Navigate, Outlet } from "react-router-dom";
import Cookies from "js-cookie";
import Navbar from "../Navbar";
const ProtectedRoutes = ({ children }) => {
  const jwtToken = Cookies.get("jwt_token");
  if (!jwtToken) {
    return <Navigate to="/login" />;
  }

  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
};

export default ProtectedRoutes;
