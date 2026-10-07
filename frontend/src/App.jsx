import { BrowserRouter, Routes, Route } from "react-router-dom";

import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import EmailConfirmedPage from "./pages/EmailConfirmedPage";
import SignOutPage from "./pages/SignOutPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import CompleteRegistrationPage from "./pages/CompleteRegistrationPage";
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
import NotificationsPage from "./pages/NotificationsPage";
import PlayRequestPage from "./pages/PlayRequestPage";
import MatchDetailsPage from "./pages/MatchDetailsPage";
import RecordResultPage from "./pages/RecordResultPage";
import ResultSubmittedPage from "./pages/ResultSubmittedPage";
import ResultConfirmedPage from "./pages/ResultConfirmedPage";

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

        {/* Auth redirects and account pages. Restored from the M4 commit
            (2c7d2e3): they were dropped in merge 24eb24b, which left the
            Google callback, email verification and password reset links on
            a blank page. */}

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


        {/* Signed in, but the 18+ age gate is not done yet (BL-007) */}

        <Route element={<ProtectedRoute requireRegistration={false} />}>
          <Route
            path="/complete-registration"
            element={<CompleteRegistrationPage />}
          />
        </Route>


        {/* Protected pages: signed in and registered */}

        <Route element={<ProtectedRoute />}>

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

          <Route
            path="/notifications"
            element={<NotificationsPage />}
          />
          
          <Route
            path="/play-requests/:requestId"
            element={<PlayRequestPage />}
          />
          
          <Route
            path="/matches/:matchId"
            element={<MatchDetailsPage />}
          />

          <Route
            path="/matches/:matchId/record-result"
            element={<RecordResultPage />}
          />

          <Route
            path="/matches/:matchId/result-submitted"
            element={<ResultSubmittedPage />}
          />

          <Route
            path="/matches/:matchId/result-confirmed"
            element={<ResultConfirmedPage />}
          />

          </Route>

        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;