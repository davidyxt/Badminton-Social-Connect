import { useState } from "react";
import {
  Trophy,
  TrendingUp,
} from "lucide-react";

import "../styles/RankingsPage.css";


/* ======================================================
   TEMPORARY PLACEHOLDER DATA

   Later:
   - currentUser → logged-in profile + rating data
   - leaderboard → Supabase leaderboard query
   - ratingHistory → historical rating table/query
   ====================================================== */

const currentUser = {
  name: "John Doe",
  initials: "JD",
  level: "Intermediate (B1)",
  rating: 1271,
  wins: 21,
  losses: 10,
  verified: 19,
  victoriaRank: 184,
  ratingChange: 23,
};


const ratingHistory = [
  1198,
  1215,
  1229,
  1245,
  1256,
  1261,
  1271,
];


const victoriaLeaderboard = [
  {
    id: 1,
    rank: 1,
    name: "Chris L.",
    initials: "CL",
    level: "Advanced",
    rating: 1578,
    change: 12,
  },
  {
    id: 2,
    rank: 2,
    name: "Sarah M.",
    initials: "SM",
    level: "Advanced",
    rating: 1534,
    change: 5,
  },
  {
    id: 3,
    rank: 3,
    name: "Daniel W.",
    initials: "DW",
    level: "Advanced",
    rating: 1502,
    change: -3,
  },
  {
    id: 4,
    rank: 4,
    name: "Ben H.",
    initials: "BH",
    level: "Advanced",
    rating: 1487,
    change: 8,
  },
  {
    id: 5,
    rank: 5,
    name: "Mei L.",
    initials: "ML",
    level: "Advanced",
    rating: 1451,
    change: 2,
  },
  {
    id: 6,
    rank: 6,
    name: "Jake O.",
    initials: "JO",
    level: "Intermediate",
    rating: 1398,
    change: 15,
  },
  {
    id: 7,
    rank: 7,
    name: "Anna K.",
    initials: "AK",
    level: "Intermediate",
    rating: 1376,
    change: -6,
  },
  {
    id: 8,
    rank: 8,
    name: "Raj P.",
    initials: "RP",
    level: "Intermediate",
    rating: 1342,
    change: 3,
  },
  {
    id: 9,
    rank: 9,
    name: "Tom W.",
    initials: "TW",
    level: "Intermediate",
    rating: 1319,
    change: -1,
  },
  {
    id: 10,
    rank: 10,
    name: "Lucy H.",
    initials: "LH",
    level: "Intermediate",
    rating: 1298,
    change: 7,
  },
];


const nearbyLeaderboard = [
  {
    id: 11,
    rank: 1,
    name: "Marcus T.",
    initials: "MT",
    level: "Advanced",
    rating: 1422,
    change: 8,
  },
  {
    id: 12,
    rank: 2,
    name: "Emily C.",
    initials: "EC",
    level: "Intermediate",
    rating: 1379,
    change: 11,
  },
  {
    id: 13,
    rank: 3,
    name: "Nathan P.",
    initials: "NP",
    level: "Intermediate",
    rating: 1330,
    change: -2,
  },
];


const leagueLeaderboard = [
  {
    id: 14,
    rank: 1,
    name: "Samantha R.",
    initials: "SR",
    level: "Advanced",
    rating: 1510,
    change: 6,
  },
  {
    id: 15,
    rank: 2,
    name: "Jordan K.",
    initials: "JK",
    level: "Intermediate",
    rating: 1365,
    change: 10,
  },
  {
    id: 16,
    rank: 3,
    name: "Alex N.",
    initials: "AN",
    level: "Intermediate",
    rating: 1304,
    change: 3,
  },
];


function RatingTrendChart() {
  const width = 300;
  const height = 90;

  const minRating = Math.min(...ratingHistory) - 10;
  const maxRating = Math.max(...ratingHistory) + 10;

  const points = ratingHistory
    .map((rating, index) => {
      const x =
        (index / (ratingHistory.length - 1)) *
        width;

      const y =
        height -
        ((rating - minRating) /
          (maxRating - minRating)) *
          height;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="ranking-chart">

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <polyline
          points={points}
          className="ranking-chart-line"
        />

        {ratingHistory.map((rating, index) => {
          const x =
            (index /
              (ratingHistory.length - 1)) *
            width;

          const y =
            height -
            ((rating - minRating) /
              (maxRating - minRating)) *
              height;

          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="3"
              className={
                index ===
                ratingHistory.length - 1
                  ? "ranking-chart-point latest"
                  : "ranking-chart-point"
              }
            />
          );
        })}

      </svg>

      <div className="ranking-chart-labels">
        <span>Month 1</span>
        <span>Latest</span>
      </div>

    </div>
  );
}


function RankingsPage() {
  const [activeLeaderboard, setActiveLeaderboard] =
    useState("victoria");


  const getLeaderboard = () => {
    if (activeLeaderboard === "nearby") {
      return nearbyLeaderboard;
    }

    if (activeLeaderboard === "league") {
      return leagueLeaderboard;
    }

    return victoriaLeaderboard;
  };


  const leaderboard = getLeaderboard();


  return (
    <div className="rankings-page">

      {/* ==================================================
          BLUE USER SECTION
          ================================================== */}

      <section className="ranking-hero">

        <h1>RANKING</h1>


        <div className="ranking-user-card">

          <div className="ranking-user-top">

            <div className="ranking-avatar">
              {currentUser.initials}
            </div>


            <div className="ranking-user-info">

              <strong>
                {currentUser.name}
              </strong>

              <span>
                {currentUser.level}
              </span>

            </div>


            <div className="ranking-current-rank">

              <strong>
                #{currentUser.victoriaRank}
              </strong>

              <span>
                VIC Rank
              </span>

            </div>

          </div>


          <div className="ranking-divider" />


          <div className="ranking-user-stats">

            <div className="ranking-stat">

              <div className="ranking-rating-value">

                <strong>
                  {currentUser.rating.toLocaleString()}
                </strong>

                <span className="ranking-positive-change">
                  ↑ {currentUser.ratingChange}
                </span>

              </div>

              <span>Rating</span>

            </div>


            <div className="ranking-stat">
              <strong>
                {currentUser.wins}
              </strong>

              <span>Wins</span>
            </div>


            <div className="ranking-stat">
              <strong>
                {currentUser.losses}
              </strong>

              <span>Losses</span>
            </div>


            <div className="ranking-stat">
              <strong>
                {currentUser.verified}
              </strong>

              <span>Verified</span>
            </div>

          </div>

        </div>

      </section>


      {/* ==================================================
          MAIN CONTENT
          ================================================== */}

      <main className="rankings-content">


        {/* RATING TREND */}

        <section className="ranking-card trend-card">

          <div className="ranking-card-header">

            <h2>
              Rating Trend
            </h2>

            <span>
              Past Month
            </span>

          </div>


          <RatingTrendChart />

        </section>


        {/* LEADERBOARD TITLE + FILTERS */}

        <section className="leaderboard-section">

          <div className="leaderboard-heading">

            <h2>
              Leaderboard
            </h2>


            <div className="leaderboard-tabs">

              <button
                type="button"
                className={
                  activeLeaderboard ===
                  "victoria"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setActiveLeaderboard(
                    "victoria"
                  )
                }
              >
                Victoria
              </button>


              <button
                type="button"
                className={
                  activeLeaderboard ===
                  "nearby"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setActiveLeaderboard(
                    "nearby"
                  )
                }
              >
                Nearby
              </button>


              <button
                type="button"
                className={
                  activeLeaderboard ===
                  "league"
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setActiveLeaderboard(
                    "league"
                  )
                }
              >
                League
              </button>

            </div>

          </div>


          {/* LEADERBOARD */}

          <div className="leaderboard-card">

            <div className="leaderboard-list">

              {leaderboard.map((player) => (

                <div
                  className="leaderboard-row"
                  key={player.id}
                >

                  <div
                    className={`leaderboard-position ${
                      player.rank <= 3
                        ? `position-${player.rank}`
                        : ""
                    }`}
                  >

                    {player.rank <= 3 ? (
                      <Trophy size={15} />
                    ) : (
                      player.rank
                    )}

                  </div>


                  <div className="leaderboard-avatar">
                    {player.initials}
                  </div>


                  <div className="leaderboard-player">

                    <strong>
                      {player.name}
                    </strong>

                    <span>
                      {player.level}
                    </span>

                  </div>


                  <div className="leaderboard-rating">

                    <strong>
                      {player.rating}
                    </strong>

                    <span
                      className={
                        player.change >= 0
                          ? "rating-up"
                          : "rating-down"
                      }
                    >
                      {player.change >= 0
                        ? "+"
                        : ""}
                      {player.change}
                    </span>

                  </div>

                </div>

              ))}


              {/* CURRENT USER */}

              <div className="leaderboard-row current-user-row">

                <div className="leaderboard-position">
                  {currentUser.victoriaRank}
                </div>


                <div className="leaderboard-avatar current-user-avatar">
                  {currentUser.initials}
                </div>


                <div className="leaderboard-player">

                  <strong>
                    {currentUser.name} (You)
                  </strong>

                  <span>
                    {currentUser.level}
                  </span>

                </div>


                <div className="leaderboard-rating">

                  <strong>
                    {currentUser.rating}
                  </strong>

                  <span className="rating-up orange-change">
                    +
                    {currentUser.ratingChange}
                  </span>

                </div>

              </div>

            </div>

          </div>

        </section>


        <div className="ranking-footer-message">

          <TrendingUp size={18} />

          <span>
            Keep playing to improve your
            ranking.
          </span>

        </div>

      </main>

    </div>
  );
}

export default RankingsPage;