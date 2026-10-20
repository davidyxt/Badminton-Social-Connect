import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/landingPage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import EmailConfirmedPage from "./pages/EmailConfirmedPage";
import SignOutPage from "./pages/SignOutPage";
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/confirmed" element={<EmailConfirmedPage />} />
        <Route path="/signout" element={<SignOutPage />} />

        {/* Only authenticated users can view private pages or make changes. */}
        <Route element={<ProtectedRoute />}>
          {/* This editor does not use the shared top/bottom navigation. */}
          <Route path="/post-game" element={<PostGamePage />} />
          <Route element={<AuthenticatedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/find" element={<FindGamesPage />} />
            <Route path="/games/:gameId" element={<GameDetailsPage />} />
            <Route path="/games/:gameId/record-result" element={<RecordResultPage />} />
            <Route path="/games/:gameId/request-confirmation" element={<GameRequestConfirmationPage />} />
            <Route path="/post-game/confirmation/:gameId" element={<PostGameConfirmationPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/leagues" element={<MiniLeaguesPage />} />
            <Route path="/leagues/create" element={<CreateLeaguePage />} />
            <Route path="/leagues/:leagueId/created" element={<LeagueCreatedConfirmationPage />} />
            <Route path="/leagues/:leagueId" element={<LeagueDetailsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/players/:playerId" element={<PlayerProfilePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/play-requests/:requestId" element={<PlayRequestPage />} />
            <Route path="/matches/:matchId" element={<MatchDetailsPage />} />
            <Route path="/matches/:matchId/record-result" element={<RecordResultPage />} />
            <Route path="/matches/:matchId/result-submitted" element={<ResultSubmittedPage />} />
            <Route path="/matches/:matchId/result-confirmed" element={<ResultConfirmedPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
