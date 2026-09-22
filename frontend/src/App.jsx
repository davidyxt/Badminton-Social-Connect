import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";

import DashboardPage from "./pages/DashboardPage";

import AuthenticatedLayout from "./layouts/AuthenticatedLayout";

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


        {/* Pages WITH top/bottom navigation */}

        <Route element={<AuthenticatedLayout />}>

          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          
        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default App;