import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Users,
  Trophy,
  Image as ImageIcon,
} from "lucide-react";

import "../styles/MiniLeaguesPage.css";


/* ======================================================
   TEMPORARY DATA

   Later:
   yourLeagues → leagues the logged-in user has joined
   discoverLeagues → available leagues from Supabase

   imageUrl can later contain a Supabase Storage URL.
   ====================================================== */

const yourLeaguesData = [
  {
    id: 1,
    name: "UniMelb Badminton League",
    format: "Singles",
    style: "Friendly",
    round: 4,
    totalRounds: 7,
    players: 58,
    availability: "Joined",
    imageUrl: null,
  },
];


const discoverLeaguesData = [
  {
    id: 2,
    name: "Box Hill Competitive",
    format: "Singles",
    style: "Competitive",
    round: 1,
    totalRounds: 8,
    players: 7,
    availability: "Open",
    imageUrl: null,
  },

  {
    id: 3,
    name: "Shuttle Buddies League",
    format: "Doubles",
    style: "Friendly",
    round: 5,
    totalRounds: 6,
    players: 24,
    availability: "Open",
    imageUrl: null,
  },

  {
    id: 4,
    name: "Carlton Social League",
    format: "Doubles",
    style: "Friendly",
    round: 2,
    totalRounds: 5,
    players: 16,
    availability: "Open",
    imageUrl: null,
  },
];


function MiniLeaguesPage() {

    const navigate = useNavigate();
    
    const [yourTimeFilter, setYourTimeFilter] =
        useState("all");

    const [yourFormatFilter, setYourFormatFilter] =
        useState("all");

    const [discoverTimeFilter, setDiscoverTimeFilter] =
        useState("all");

    const [
        availabilityFilter,
        setAvailabilityFilter,
    ] = useState("all");


  /* ======================================================
     YOUR LEAGUES FILTER
     ====================================================== */

  const yourLeagues = useMemo(() => {
    return yourLeaguesData.filter((league) => {
      const matchesFormat =
        yourFormatFilter === "all" ||
        league.format.toLowerCase() ===
          yourFormatFilter;

      return matchesFormat;
    });
  }, [yourFormatFilter, yourTimeFilter]);


  /* ======================================================
     DISCOVER FILTER
     ====================================================== */

  const discoverLeagues = useMemo(() => {
    return discoverLeaguesData.filter((league) => {
      const matchesAvailability =
        availabilityFilter === "all" ||
        league.availability.toLowerCase() ===
          availabilityFilter;

      return matchesAvailability;
    });
  }, [
    discoverTimeFilter,
    availabilityFilter,
  ]);


  /* ======================================================
     REUSABLE LEAGUE CARD
     ====================================================== */

  const renderLeagueCard = (
    league,
    isJoined = false
  ) => {
    return (
      <article
        className="mini-league-card"
        key={league.id}
      >

        {/* TAGS */}

        <div className="league-card-tags">

          <span className="league-format-tag">
            {league.format}
          </span>

          <span
            className={`league-style-tag ${league.style.toLowerCase()}`}
          >
            {league.style}
          </span>

        </div>


        {/* IMAGE */}

        <div
          className={`league-card-image ${
            !league.imageUrl
              ? "league-card-image-empty"
              : ""
          }`}
          style={
            league.imageUrl
              ? {
                  backgroundImage:
                    `url(${league.imageUrl})`,
                }
              : undefined
          }
        >

          {!league.imageUrl && (
            <div className="league-image-placeholder">

              <ImageIcon size={30} />

              <span>
                League photo
              </span>

            </div>
          )}

        </div>


        {/* DETAILS */}

        <div className="league-card-content">

          <h3>
            {league.name}
          </h3>


          <div className="league-card-bottom">

            <div className="league-card-information">

              <span>
                Round {league.round} of{" "}
                {league.totalRounds}
              </span>

              <span className="league-player-count">
                <Users size={12} />
                {league.players} Players
              </span>

            </div>


            <button
              type="button"
              className="view-league-button"
              onClick={() =>
                navigate(
                  `/leagues/${league.id}`,
                  {
                    state: {
                      league: {
                        ...league,
                        isJoined,
                      },
                    },
                  }
                )
              }
            >
              View League
            </button>

          </div>

        </div>

      </article>
    );
  };


  return (
    <div className="mini-leagues-page">


      {/* ==================================================
          HEADER
          ================================================== */}

      <header className="mini-leagues-header">

        <h1>
          Mini Leagues
        </h1>

        <button
            type="button"
            className="create-league-button"
            onClick={() => navigate("/leagues/create")}
            >
            Create League
            <Plus size={14} />
        </button>

      </header>

      <main className="mini-leagues-content">

        {/* =================================================
            YOUR LEAGUES
            ================================================= */}

        <section className="league-section">

          <h2>
            Your Leagues
          </h2>


          <div className="league-filter-row">

            <select
              value={yourTimeFilter}
              onChange={(event) =>
                setYourTimeFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Time
              </option>

              <option value="current">
                Current
              </option>

              <option value="past">
                Past
              </option>
            </select>


            <select
              value={yourFormatFilter}
              onChange={(event) =>
                setYourFormatFilter(
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

          </div>


          <div className="league-list">

            {yourLeagues.length > 0 ? (
              yourLeagues.map((league) =>
                renderLeagueCard(
                  league,
                  true
                )
              )
            ) : (
              <div className="league-empty-state">

                <Trophy size={28} />

                <h3>
                  No leagues joined
                </h3>

                <p>
                  Join a league below to
                  start competing.
                </p>

              </div>
            )}

          </div>

        </section>


        {/* =================================================
            DISCOVER LEAGUES
            ================================================= */}

        <section className="league-section discover-section">

          <h2>
            Discover Leagues
          </h2>


          <div className="league-filter-row">

            <select
              value={discoverTimeFilter}
              onChange={(event) =>
                setDiscoverTimeFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Time
              </option>

              <option value="current">
                Current
              </option>

              <option value="upcoming">
                Upcoming
              </option>
            </select>


            <select
              value={availabilityFilter}
              onChange={(event) =>
                setAvailabilityFilter(
                  event.target.value
                )
              }
            >
              <option value="all">
                All Availability
              </option>

              <option value="open">
                Open
              </option>

              <option value="full">
                Full
              </option>
            </select>

          </div>


          <div className="league-list">

            {discoverLeagues.length > 0 ? (
              <>
                {discoverLeagues.map(
                  (league) =>
                    renderLeagueCard(league)
                )}


                <div className="league-results-end">

                  <Trophy size={22} />

                  <strong>
                    That's all the leagues
                    available!
                  </strong>

                  <p>
                    Check back later for
                    new mini leagues.
                  </p>

                </div>
              </>
            ) : (
              <div className="league-empty-state">

                <Trophy size={28} />

                <h3>
                  No leagues found
                </h3>

                <p>
                  Try changing your
                  filters.
                </p>

              </div>
            )}

          </div>

        </section>

      </main>

    </div>
  );
}

export default MiniLeaguesPage;