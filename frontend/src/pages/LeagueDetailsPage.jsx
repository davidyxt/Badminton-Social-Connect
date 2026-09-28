import { useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  Trophy,
  UserRound,
} from "lucide-react";

import "../styles/LeagueDetailsPage.css";


const fallbackLeague = {
  id: "test",
  name: "Northside Social League",

  format: "Singles",
  style: "Friendly",

  round: 4,
  totalRounds: 7,

  players: 8,

  availability: "Open",
  isJoined: false,

  currentUserPosition: 3,

  table: [
    {
      id: 1,
      rank: 1,
      name: "Jordan K.",
      initials: "JK",
      played: 4,
      wins: 4,
      losses: 0,
      points: 8,
    },
    {
      id: 2,
      rank: 2,
      name: "Sam T.",
      initials: "ST",
      played: 4,
      wins: 3,
      losses: 1,
      points: 6,
    },
    {
      id: 3,
      rank: 3,
      name: "Alex C.",
      initials: "AC",
      played: 4,
      wins: 2,
      losses: 2,
      points: 4,
      currentUser: true,
    },
    {
      id: 4,
      rank: 4,
      name: "Maya R.",
      initials: "MR",
      played: 4,
      wins: 2,
      losses: 2,
      points: 4,
    },
    {
      id: 5,
      rank: 5,
      name: "Ben K.",
      initials: "BK",
      played: 3,
      wins: 1,
      losses: 2,
      points: 2,
    },
    {
      id: 6,
      rank: 6,
      name: "Priya N.",
      initials: "PN",
      played: 3,
      wins: 1,
      losses: 2,
      points: 2,
    },
    {
      id: 7,
      rank: 7,
      name: "Luke M.",
      initials: "LM",
      played: 3,
      wins: 0,
      losses: 3,
      points: 0,
    },
    {
      id: 8,
      rank: 8,
      name: "Chris L.",
      initials: "CL",
      played: 2,
      wins: 0,
      losses: 2,
      points: 0,
    },
  ],

  matches: [
    {
      id: 1,
      status: "Completed",
      date: "3 Sep",

      player1: {
        name: "Jordan K.",
        initials: "JK",
      },

      player2: {
        name: "Sam T.",
        initials: "ST",
      },

      result:
        "21–18, 17–21, 21–16",
    },

    {
      id: 2,
      status: "Completed",
      date: "2 Sep",

      player1: {
        name: "Alex C.",
        initials: "AC",
      },

      player2: {
        name: "Maya R.",
        initials: "MR",
      },

      result:
        "21–17, 21–14",
    },

    {
      id: 3,
      status: "Upcoming",
      date: "18 Sep",

      player1: {
        name: "Alex C.",
        initials: "AC",
      },

      player2: {
        name: "Sam T.",
        initials: "ST",
      },

      result: null,

      canArrange: true,
    },

    {
      id: 4,
      status: "Awaiting Result",
      date: "5 Sep",

      player1: {
        name: "Jordan K.",
        initials: "JK",
      },

      player2: {
        name: "Ben K.",
        initials: "BK",
      },

      result: null,
    },
  ],

  playerList: [
    {
      id: 1,
      name: "Jordan K.",
      initials: "JK",
      level: "Advanced",
      rating: 1265,
    },
    {
      id: 2,
      name: "Sam T.",
      initials: "ST",
      level: "Intermediate",
      rating: 1198,
    },
    {
      id: 3,
      name: "Alex C.",
      initials: "AC",
      level: "Intermediate",
      rating: 1172,
      currentUser: true,
    },
    {
      id: 4,
      name: "Maya R.",
      initials: "MR",
      level: "Intermediate",
      rating: 1150,
    },
    {
      id: 5,
      name: "Ben K.",
      initials: "BK",
      level: "Intermediate",
      rating: 1108,
    },
    {
      id: 6,
      name: "Priya N.",
      initials: "PN",
      level: "Intermediate",
      rating: 1084,
    },
    {
      id: 7,
      name: "Luke M.",
      initials: "LM",
      level: "Beginner",
      rating: 1018,
    },
    {
      id: 8,
      name: "Chris L.",
      initials: "CL",
      level: "Beginner",
      rating: 990,
    },
  ],
};


function LeagueDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leagueId } = useParams();

  const passedLeague =
    location.state?.league;

  const league = {
    ...fallbackLeague,
    ...passedLeague,

    id:
      passedLeague?.id ??
      leagueId,

    table:
      passedLeague?.table ??
      fallbackLeague.table,

    matches:
      passedLeague?.matches ??
      fallbackLeague.matches,

    playerList:
      passedLeague?.playerList ??
      fallbackLeague.playerList,
  };


  const [activeTab, setActiveTab] =
    useState("table");


  const [isJoined, setIsJoined] =
    useState(
      league.isJoined ??
      league.availability === "Joined"
    );


  /* ======================================================
     TEMPORARY JOIN FUNCTION

     Later replace setIsJoined(true) with Supabase logic.
     ====================================================== */

  const handleJoinLeague = async () => {
    console.log(
      "Join league:",
      league.id
    );

    setIsJoined(true);
  };


  return (
    <div className="league-details-page">

      {/* ==================================================
          SECONDARY HEADER
          ================================================== */}

      <header className="league-details-header">

        <button
          type="button"
          className="league-details-back"
          onClick={() =>
            navigate("/leagues")
          }
          aria-label="Back to mini leagues"
        >
          <ArrowLeft size={22} />
        </button>

        <h1>
          {league.name
            .replace(" League", "")}
        </h1>

      </header>


      {/* ==================================================
          BLUE LEAGUE HERO
          ================================================== */}

      <section className="league-details-hero">

        <div>

          <h2>
            {league.name}
          </h2>

          <p>
            {league.players} players
            {" · "}
            {league.format}
            {" · "}
            Round {league.round} of{" "}
            {league.totalRounds}
          </p>

        </div>


        {isJoined &&
          league.currentUserPosition && (

            <div className="league-position-box">

              <strong>
                #
                {
                  league.currentUserPosition
                }
              </strong>

              <span>
                Your pos.
              </span>

            </div>

          )}

      </section>


      {/* ==================================================
          TABS
          ================================================== */}

      <nav className="league-details-tabs">

        <button
          type="button"
          className={
            activeTab === "table"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("table")
          }
        >
          Table
        </button>


        <button
          type="button"
          className={
            activeTab === "matches"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("matches")
          }
        >
          Matches
        </button>


        <button
          type="button"
          className={
            activeTab === "players"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("players")
          }
        >
          Players
        </button>

      </nav>


      {/* ==================================================
          CONTENT
          ================================================== */}

      <main className="league-details-content">


        {/* =================================================
            TABLE
            ================================================= */}

        {activeTab === "table" && (

          <section className="league-table-card">

            <div className="league-table-header">

              <span>#</span>

              <span>Player</span>

              <span>P</span>

              <span>W</span>

              <span>L</span>

              <span>Pts</span>

            </div>


            {league.table.map(
              (player) => (

                <div
                  className={`league-table-row ${
                    player.currentUser
                      ? "current-player"
                      : ""
                  }`}
                  key={player.id}
                >

                  <strong className="table-position">
                    {player.rank}
                  </strong>


                  <div className="table-player">

                    <div className="table-avatar">
                      {
                        player.initials
                      }
                    </div>

                    <strong>
                      {player.name}

                      {player.currentUser &&
                        " (You)"}
                    </strong>

                  </div>


                  <span>
                    {player.played}
                  </span>

                  <span className="table-win">
                    {player.wins}
                  </span>

                  <span className="table-loss">
                    {player.losses}
                  </span>

                  <strong>
                    {player.points}
                  </strong>

                </div>

              )
            )}

          </section>

        )}


        {/* =================================================
            MATCHES
            ================================================= */}

        {activeTab === "matches" && (

          <section className="league-matches-list">

            {league.matches.map(
              (match) => (

                <article
                  className="league-match-card"
                  key={match.id}
                >

                  <div className="league-match-top">

                    <span
                      className={`match-status ${match.status
                        .toLowerCase()
                        .replaceAll(
                          " ",
                          "-"
                        )}`}
                    >
                      {match.status}
                    </span>

                    <span className="league-match-date">
                      {match.date}
                    </span>

                  </div>


                  <div className="league-match-players">

                    <div className="match-player">

                      <div className="match-player-avatar">
                        {
                          match
                            .player1
                            .initials
                        }
                      </div>

                      <strong>
                        {
                          match
                            .player1
                            .name
                        }
                      </strong>

                    </div>


                    <span className="match-vs">
                      vs
                    </span>


                    <div className="match-player">

                      <div className="match-player-avatar orange">
                        {
                          match
                            .player2
                            .initials
                        }
                      </div>

                      <strong>
                        {
                          match
                            .player2
                            .name
                        }
                      </strong>

                    </div>

                  </div>


                  {match.result && (
                    <p className="match-result">
                      {match.result}
                    </p>
                  )}


                  {match.status ===
                    "Awaiting Result" && (

                    <p className="match-result muted">
                      Awaiting result
                    </p>

                  )}


                  {match.canArrange && (

                    <button
                      type="button"
                      className="arrange-league-match-button"
                      onClick={() =>
                        navigate(
                          "/post-game",
                          {
                            state: {
                              leagueId:
                                league.id,

                              leagueName:
                                league.name,

                              opponent:
                                match.player2,
                            },
                          }
                        )
                      }
                    >
                      Arrange Match
                    </button>

                  )}

                </article>

              )
            )}

          </section>

        )}


        {/* =================================================
            PLAYERS
            ================================================= */}

        {activeTab === "players" && (

          <section className="league-player-list">

            {league.playerList.map(
              (player) => (

                <article
                  className={`league-player-card ${
                    player.currentUser
                      ? "current-league-player"
                      : ""
                  }`}
                  key={player.id}
                >

                  <div className="league-player-avatar">
                    {player.initials}
                  </div>


                  <div className="league-player-details">

                    <strong>
                      {player.name}

                      {player.currentUser &&
                        " (You)"}
                    </strong>

                    <span>
                      {player.level}
                    </span>

                  </div>


                  <div className="league-player-rating">

                    <strong>
                      {player.rating}
                    </strong>

                    <span>
                      Rating
                    </span>

                  </div>

                </article>

              )
            )}

          </section>

        )}

      </main>


      {/* ==================================================
          JOIN LEAGUE

          Only exists for leagues the user has NOT joined.
          ================================================== */}

      {!isJoined && (

        <div className="join-league-area">

          <button
            type="button"
            className="join-league-button"
            onClick={
              handleJoinLeague
            }
          >
            Join League
          </button>

        </div>

      )}

    </div>
  );
}


export default LeagueDetailsPage;