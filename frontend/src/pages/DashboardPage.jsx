import { useNavigate } from "react-router-dom";
import "../styles/DashboardPage.css";

import {
  CalendarDays,
  Trophy,
  Search,
  Plus,
} from "lucide-react";

const dashboardData = {
  user: {
    firstName: "John",
    lastName: "Doe",
    initials: "JD",
  },

  rating: {
    value: 1271,
    level: "INTERMEDIATE (B1)",
    matches: 52,
    winRate: 63,
    victoriaRank: 184,
    monthlyChange: 24,
  },

  upcomingMatch: null,

  league: null,

  recentActivity: [],
};

function DashboardPage() {
  const navigate = useNavigate();

  const { user, rating, upcomingMatch, league, recentActivity } =
    dashboardData;

  return (
    <div className="dashboard-page">

      {/* HERO */}

      <section className="dashboard-hero">
        <p className="dashboard-greeting">
          Good Afternoon,
        </p>

        <h1 className="dashboard-name">
          {user.firstName} {user.lastName}
          <span className="dashboard-racket">🏸</span>
        </h1>

        <p className="dashboard-subtitle">
          Ready for a game?
        </p>

        <div className="dashboard-actions">

          <button
            className="dashboard-action-button primary"
            onClick={() => navigate("/find")}
          >
            <span className="search-symbol"></span>

            Find a Match
          </button>

          <button
            className="dashboard-action-button secondary"
            type="button"
          >
            <span className="plus-symbol">+</span>

            Post a Game
          </button>

        </div>
      </section>


      {/* MAIN CONTENT */}

      <main className="dashboard-content">

        {/* RATING */}

        <section className="dashboard-card rating-card">

          <div className="card-top-row">
            <span className="card-label">
              YOUR RATING
            </span>

            <button
              className="card-link"
              onClick={() => navigate("/rankings")}
            >
              View Ranking
              <span>→</span>
            </button>
          </div>

          <div className="rating-main-row">

            <div>
              <div className="rating-number">
                {rating.value.toLocaleString()}
              </div>

              <div className="rating-level">
                {rating.level}
              </div>
            </div>

            <div className="rating-change">
              ↗ + {rating.monthlyChange} this month
            </div>

          </div>

          <div className="rating-divider"></div>

          <div className="rating-stats">

            <div className="rating-stat">
              <strong>
                {rating.matches}
              </strong>

              <span>
                Matches
              </span>
            </div>

            <div className="rating-stat">
              <strong>
                {rating.winRate}%
              </strong>

              <span>
                Win Rate
              </span>
            </div>

            <div className="rating-stat">
              <strong>
                #{rating.victoriaRank}
              </strong>

              <span>
                VIC Rank
              </span>
            </div>

          </div>

        </section>


        {/* UPCOMING MATCH */}

        {upcomingMatch ? (
          <section className="dashboard-card">
            {/* Actual match card will render here later */}
          </section>
        ) : (
          <section className="dashboard-card empty-dashboard-card">

            <div className="empty-card-icon">
              <CalendarDays size={26} strokeWidth={2} />
            </div>

            <div className="empty-card-content">
              <h3>No game planned</h3>

              <p>
                Find a player or create a match to get your next game organised.
              </p>
            </div>

            <div className="empty-card-actions">

              <button
                className="empty-primary-button"
                onClick={() => navigate("/find")}
              >
                <Search size={17} />
                Find a Match
              </button>

              <button
                className="empty-secondary-button"
                type="button"
              >
                <Plus size={18} />
                Post a Game
              </button>

            </div>

          </section>
        )}


       {/* MINI LEAGUE */}

        {league ? (
          <section className="dashboard-card">
            {/* Actual league information will render here later */}
          </section>
        ) : (
          <section className="dashboard-card empty-dashboard-card">

            <div className="empty-card-icon">
              <Trophy size={26} strokeWidth={2} />
            </div>

            <div className="empty-card-content">
              <h3>No mini league joined</h3>

              <p>
                Join a mini league to compete with players and track your position.
              </p>
            </div>

            <button
              className="empty-primary-button full-width"
              onClick={() => navigate("/leagues")}
            >
              <Trophy size={17} />
              Explore Mini Leagues
            </button>

          </section>
        )}


        {/* RECENT ACTIVITY */}

        <section className="activity-section">
          <h2>RECENT ACTIVITY</h2>

          {recentActivity.length > 0 ? (
            <div className="activity-list">
              {recentActivity.map((activity) => (
                <div
                  className="activity-card"
                  key={activity.id}
                >
                  <div className="activity-icon">
                    {activity.type === "match" ? "◯" : "▥"}
                  </div>

                  <div className="activity-information">
                    <strong>
                      {activity.title}
                    </strong>

                    <span>
                      {activity.detail}
                    </span>
                  </div>

                  <span className="activity-time">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-activity-card">
              <div className="no-activity-icon">
                <span>↻</span>
              </div>

              <div>
                <h3>No recent activity</h3>

                <p>
                  Your matches, rating changes and league activity will appear here.
                </p>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}

export default DashboardPage;