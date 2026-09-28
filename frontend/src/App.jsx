import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import PostGamePage from "./pages/PostGamePage";
import PostGameConfirmationPage from "./pages/PostGameConfirmationPage";
import DashboardPage from "./pages/DashboardPage";
import FindGamesPage from "./pages/FindGamesPage";
import GameDetailsPage from "./pages/GameDetailsPage";
import GameRequestConfirmationPage from "./pages/GameRequestConfirmationPage";
import RankingsPage from "./pages/RankingsPage";
import MiniLeaguesPage from "./pages/MiniLeaguesPage";
import CreateLeaguePage from "./pages/CreateLeaguePage";
import LeagueCreatedConfirmationPage from "./pages/LeagueCreatedConfirmationPage";
import LeagueDetailsPage from "./pages/LeagueDetailsPage";
import ProfilePage from "./pages/ProfilePage";
import PlayerProfilePage from "./pages/PlayerProfilePage";

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


        {/* Focused pages without bottom navigation */}

        <Route
          path="/post-game"
          element={<PostGamePage />}
        />


        {/* Protected pages */}

          {/* Pages WITH top/bottom navigation */}

          <Route element={<AuthenticatedLayout />}>

            <Route
              path="/dashboard"
              element={<DashboardPage />}
            />

            <Route
              path="/find"
              element={<FindGamesPage />}
            />

            <Route
              path="/games/:gameId"
              element={<GameDetailsPage />}
            />
            
            <Route
              path="/rankings"
              element={<RankingsPage />}
            />

            <Route
              path="/post-game/confirmation/:gameId"
              element={<PostGameConfirmationPage />}
            />
            
            <Route
            path="/games/:gameId/request-confirmation"
            element={<GameRequestConfirmationPage />}
          />

          <Route
            path="/leagues"
            element={<MiniLeaguesPage />}
          />

          <Route
            path="/leagues/create"
            element={<CreateLeaguePage />}
          />

          <Route
            path="/leagues/:leagueId/created"
            element={<LeagueCreatedConfirmationPage />}
          />

          <Route
            path="/leagues/:leagueId"
            element={<LeagueDetailsPage />}
          />

          <Route
            path="/profile"
            element={<ProfilePage />}
          />

          <Route
            path="/players/:playerId"
            element={<PlayerProfilePage />}
          />

          </Route>

      {/* Remember to replace protected route after */}

      </Routes>
    </BrowserRouter>
  );
}

export default App;