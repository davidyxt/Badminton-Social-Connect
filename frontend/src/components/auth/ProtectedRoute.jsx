import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

// Signed-out players go to /login. Signed-in players who have not passed the
// 18+ age gate yet go to /complete-registration: until then the database hides
// every other player and game from them (BL-007).
function ProtectedRoute({ requireRegistration = true }) {
  const { session, player, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!session) return <Navigate to="/login" replace />;

  if (requireRegistration && !player?.registered) {
    return (
      <Navigate
        to="/complete-registration"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;
