import { Navigate , Outlet} from "react-router-dom";
import Cookies from "js-cookie";

const ProtectedRoutes = ({ children }) => {
  const jwtToken = Cookies.get("jwt_token");
  if (!jwtToken) {
    return <Navigate to="/login" />;
  }

  return <Outlet />
};

export default ProtectedRoutes;
