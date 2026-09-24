import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import EmailConfirmedPage from "./pages/EmailConfirmedPage";
import SignOutPage from "./pages/SignOutPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import DashboardPage from "./pages/DashboardPage";

import AuthenticatedLayout from "./layouts/AuthenticatedLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* Pages WITHOUT top/bottom navigation */}

        <Route
          path="/"
          element={<LandingPage />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/signup"
          element={<SignupPage />}
        />

        <Route
          path="/auth/callback"
          element={<AuthCallbackPage />}
        />

        <Route
          path="/auth/confirmed"
          element={<EmailConfirmedPage />}
        />

        <Route
          path="/signout"
          element={<SignOutPage />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPasswordPage />}
        />

        <Route
          path="/reset-password"
          element={<ResetPasswordPage />}
        />


        {/* Pages WITH top/bottom navigation */}

        <Route element={<ProtectedRoute />}>
          <Route element={<AuthenticatedLayout />}>

            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />

          </Route>
        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default App;