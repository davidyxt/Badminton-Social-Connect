import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import PostGamePage from "./pages/PostGamePage";
import PostGameConfirmationPage from "./pages/PostGameConfirmationPage";

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

         {/* Focused pages without bottom navigation */}

        <Route
          path="/post-game"
          element={<PostGamePage />}
        />

        {/* Pages WITH top/bottom navigation */}

        <Route element={<AuthenticatedLayout />}>

          <Route
            path="/dashboard"
            element={<DashboardPage />}
          />

          <Route
            path="/post-game/confirmation/:gameId"
            element={<PostGameConfirmationPage />}
          />

        </Route>

      </Routes>

    </BrowserRouter>
  );
}

export default App;