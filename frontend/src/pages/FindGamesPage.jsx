import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Search,
  Clock3,
  MapPin,
  Users,
  UserRound,
} from "lucide-react";

import "../styles/FindGamesPage.css";

/* ======================================================
   TEMPORARY DATA

   Later:
   - games → fetch from Supabase
   - players → fetch from Supabase

   imageUrl can later contain a Storage/public image URL.
   Leave it null for now.
   ====================================================== */

const games = [
  {
    id: 1,
    title: "Competitive Afternoon Game",
    format: "Singles",
    style: "Competitive",
    rank: "Intermediate",
    date: "Wed, 30 Sep",
    time: "1:30 PM – 2:30 PM",
    location:
      "Melbourne Sports & Aquatic Centre, Albert Park",
    playerCount: 1,
    maxPlayers: 2,
    imageUrl: null,
  },

  {
    id: 2,
    title: "Friday Night Doubles",
    format: "Doubles",
    style: "Friendly",
    rank: "Any Rank",
    date: "Fri, 2 Oct",
    time: "7:00 PM – 8:30 PM",
    location:
      "Melbourne Sports Centres, Parkville",
    playerCount: 2,
    maxPlayers: 4,
    imageUrl: null,
  },

  {
    id: 3,
    title: "UniMelb Challenge",
    format: "Singles",
    style: "Competitive",
    rank: "Advanced",
    date: "Sat, 3 Oct",
    time: "7:00 PM – 8:30 PM",
    location:
      "Nona Lee Sports Centre, Tin Alley",
    playerCount: 1,
    maxPlayers: 2,
    imageUrl: null,
  },

  {
    id: 4,
    title: "Sunday Social Hit",
    format: "Doubles",
    style: "Friendly",
    rank: "Beginner",
    date: "Sun, 4 Oct",
    time: "11:00 AM – 12:30 PM",
    location:
      "MSAC — Albert Park",
    playerCount: 3,
    maxPlayers: 4,
    imageUrl: null,
  },
];


const players = [
  {
    id: 1,
    name: "Jordan K.",
    initials: "JK",
    rank: "Intermediate (B1)",
    location: "Albert Park",
    reliability: 96,
  },

  {
    id: 2,
    name: "Sarah M.",
    initials: "SM",
    rank: "Advanced (A2)",
    location: "Parkville",
    reliability: 93,
  },

  {
    id: 3,
    name: "Daniel L.",
    initials: "DL",
    rank: "Beginner (C1)",
    location: "Carlton",
    reliability: 89,
  },
];


function FindGamesPage() {

    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("matches");

    const [searchTerm, setSearchTerm] = useState("");

    const [rankFilter, setRankFilter] =
    useState("all");

    const [formatFilter, setFormatFilter] =
    useState("all");

  /* ======================================================
     FILTER MATCHES
     ====================================================== */

  const filteredGames = useMemo(() => {
    const search =
      searchTerm.trim().toLowerCase();

    return games.filter((game) => {
      const matchesSearch =
        !search ||
        game.title
          .toLowerCase()
          .includes(search) ||
        game.location
          .toLowerCase()
          .includes(search) ||
        game.rank
          .toLowerCase()
          .includes(search);

      const matchesRank =
        rankFilter === "all" ||
        game.rank
          .toLowerCase()
          .includes(rankFilter);

      const matchesFormat =
        formatFilter === "all" ||
        game.format.toLowerCase() ===
          formatFilter;

      return (
        matchesSearch &&
        matchesRank &&
        matchesFormat
      );
    });
  }, [
    searchTerm,
    rankFilter,
    formatFilter,
  ]);


  /* ======================================================
     FILTER PLAYERS
     ====================================================== */

  const filteredPlayers = useMemo(() => {
    const search =
      searchTerm.trim().toLowerCase();

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        player.name
          .toLowerCase()
          .includes(search) ||
        player.location
          .toLowerCase()
          .includes(search) ||
        player.rank
          .toLowerCase()
          .includes(search);

      const matchesRank =
        rankFilter === "all" ||
        player.rank
          .toLowerCase()
          .includes(rankFilter);

      return matchesSearch && matchesRank;
    });
  }, [searchTerm, rankFilter]);


  return (
    <div className="find-games-page">

      {/* PAGE TITLE */}

      <section className="find-games-header">

        <h1>Find Games</h1>

        <div className="find-search-wrapper">

          <input
            type="text"
            placeholder={
              activeTab === "matches"
                ? "Search location, time or level"
                : "Search player, location or level"
            }
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(
                event.target.value
              )
            }
          />

          <Search
            size={18}
            strokeWidth={2}
          />

        </div>


        {/* MATCHES / PLAYERS */}

        <div className="find-tab-switcher">

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
            Matches 🏸
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
            <Users size={15} />
          </button>

        </div>


        {/* FILTERS */}

        <div className="find-filter-row">

          <select
            value={rankFilter}
            onChange={(event) =>
              setRankFilter(
                event.target.value
              )
            }
          >
            <option value="all">
              All Ranks
            </option>

            <option value="beginner">
              Beginner
            </option>

            <option value="intermediate">
              Intermediate
            </option>

            <option value="advanced">
              Advanced
            </option>
          </select>


          {activeTab === "matches" && (
            <select
              value={formatFilter}
              onChange={(event) =>
                setFormatFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Formats
              </option>

              <option value="singles">
                Singles
              </option>

              <option value="doubles">
                Doubles
              </option>
            </select>
          )}

        </div>

      </section>


      {/* ==================================================
          MATCH RESULTS
          ================================================== */}

      {activeTab === "matches" && (
        <section className="find-results">

          {filteredGames.length > 0 ? (
            <>
              {filteredGames.map((game) => (
                <article
                  className="game-card"
                  key={game.id}
                >

                  {/* IMAGE AREA */}

                  <div
                    className={`game-image ${
                      !game.imageUrl
                        ? "game-image-empty"
                        : ""
                    }`}
                    style={
                      game.imageUrl
                        ? {
                            backgroundImage:
                              `url(${game.imageUrl})`,
                          }
                        : undefined
                    }
                  >

                    <div className="game-badges">

                      <span className="game-format-badge">
                        {game.format}
                      </span>

                      <span
                        className={`game-style-badge ${game.style.toLowerCase()}`}
                      >
                        {game.style}
                      </span>

                    </div>


                    {!game.imageUrl && (
                      <div className="game-image-placeholder">
                        <span>
                          Game photo
                        </span>
                      </div>
                    )}


                    <h2>
                      {game.title}
                    </h2>

                  </div>


                  {/* INFORMATION */}

                  <div className="game-card-content">

                    <div className="game-info-row">
                      <Clock3 size={17} />

                      <span>
                        {game.date},{" "}
                        {game.time}
                      </span>
                    </div>


                    <div className="game-info-row">
                      <MapPin size={17} />

                      <span>
                        {game.location}
                      </span>
                    </div>


                    <div className="game-info-row">
                      <Users size={17} />

                      <span>
                        {game.playerCount} /{" "}
                        {game.maxPlayers} players
                      </span>
                    </div>


                    <div className="game-card-actions">

                      <button
                        type="button"
                        className="game-primary-button"
                        onClick={() =>
                          navigate(
                            `/games/${game.id}/request-confirmation`,
                            {
                              state: {
                                player: {
                                  id: game.host?.id ?? `host-${game.id}`,
                                  name: game.host?.name ?? "Game Host",
                                  initials: game.host?.initials ?? "GH",
                                  profileImageUrl:
                                    game.host?.profileImageUrl ?? null,
                                },
                              },
                            }
                          )
                        }
                      >
                        Request to Play
                      </button>

                      <button
                        type="button"
                        className="game-secondary-button"
                        onClick={() =>
                            navigate(`/games/${game.id}`, {
                            state: { game },
                            })
                        }
                        >
                        View Details
                    </button>

                    </div>

                  </div>

                </article>
              ))}


              {/* ALWAYS AFTER LAST GAME */}

              <div className="find-results-end">

                <span>🏸</span>

                <strong>
                  That's all the games
                  available!
                </strong>

                <p>
                  Check back later for new
                  matches.
                </p>

              </div>
            </>
          ) : (
            <div className="find-empty-state">

              <Search size={30} />

              <h3>
                No games found
              </h3>

              <p>
                Try changing your search
                or filters.
              </p>

            </div>
          )}

        </section>
      )}


      {/* ==================================================
          PLAYER RESULTS
          ================================================== */}

      {activeTab === "players" && (
        <section className="find-results">

          {filteredPlayers.length > 0 ? (
            <>
              {filteredPlayers.map(
                (player) => (
                  <article
                    className="player-card"
                    key={player.id}
                  >

                    <div className="player-main-row">

                      <div className="player-avatar">
                        {player.initials}
                      </div>


                      <div className="player-information">

                        <h2>
                          {player.name}
                        </h2>

                        <span className="player-rank">
                          {player.rank}
                        </span>

                        <div className="player-location">
                          <MapPin
                            size={14}
                          />

                          <span>
                            {
                              player.location
                            }
                          </span>
                        </div>

                      </div>


                      <div className="player-reliability">

                        <strong>
                          {
                            player.reliability
                          }
                          %
                        </strong>

                        <span>
                          Reliability
                        </span>

                      </div>

                    </div>


                    <div className="player-divider" />


                    <div className="player-card-actions">

                      <button
                        type="button"
                        className="game-primary-button"
                      >
                        Request to Play
                      </button>

                      <button
                        type="button"
                        className="game-secondary-button"
                        onClick={() =>
                          navigate(
                            `/players/${player.id}`,
                            {
                              state: {
                                player,
                              },
                            }
                          )
                        }
                      >
                        View Profile
                      </button>

                    </div>

                  </article>
                )
              )}


              <div className="find-results-end">

                <UserRound size={22} />

                <strong>
                  That's all the players
                  available!
                </strong>

                <p>
                  More players will appear
                  as the community grows.
                </p>

              </div>
            </>
          ) : (
            <div className="find-empty-state">

              <UserRound size={30} />

              <h3>
                No players found
              </h3>

              <p>
                Try changing your search
                or rank filter.
              </p>

            </div>
          )}

        </section>
      )}

    </div>
  );
}

export default FindGamesPage;