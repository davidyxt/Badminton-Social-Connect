import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import {
    ArrowLeft,
    Clock3,
    MapPin,
    ChevronRight,
    Star,
    Users,
    UserRound,
    TriangleAlert,
    Image as ImageIcon,
  } from "lucide-react";
  
  import "../styles/GameDetailsPage.css";
  
  
  function GameDetailsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { gameId } = useParams();
  
  
    /* ======================================================
       GAME DATA
  
       If we came from FindGamesPage, use the game that was
       passed through navigation state.
  
       If someone opens /games/test directly, use fallback
       development data instead.
       ====================================================== */
  
    const passedGame = location.state?.game;
  
  
    const fallbackGame = {
      id: gameId,
  
      title: "Competitive Afternoon Game",
  
      format: "Singles",
      style: "Competitive",
  
      date: "Saturday",
      time: "3:00 PM",
  
      duration: "Approx. 60–90 mins",
  
      location:
        "Melbourne Sports & Aquatic Centre",
  
      locationDetail:
        "Albert Park",
  
      imageUrl: null,
  
      maxPlayers: 2,
  
      players: [
        {
          id: 1,
          name: "Jordan K.",
          initials: "JK",
          host: true,
        },
      ],
  
      host: {
        name: "Jordan K.",
        initials: "JK",
        rating: 1265,
        verifiedMatches: 18,
        reliability: 96,
      },
    };
  
  
    const game = passedGame || fallbackGame;
  
  
    /* ======================================================
       SAFE FALLBACK VALUES
  
       These prevent the page crashing when temporary Find
       Games data doesn't yet contain full backend objects.
       ====================================================== */
  
    const host = game.host ?? {
      name: "Game Host",
      initials: "GH",
      rating: 0,
      verifiedMatches: 0,
      reliability: 100,
    };
  
  
    const players = game.players ?? [];
  
  
    const maxPlayers =
      game.maxPlayers ??
      (game.format === "Doubles" ? 4 : 2);
  
  
    /*
      FindGamesPage currently uses playerCount instead of
      providing a full players array.
  
      So use playerCount when available.
    */
  
    const confirmedPlayerCount =
      game.players?.length ??
      game.playerCount ??
      0;
  
  
    const spacesLeft = Math.max(
      maxPlayers - confirmedPlayerCount,
      0
    );
  
  
    const duration =
      game.duration ??
      "Approx. 60–90 mins";
  
  
    const locationDetail =
      game.locationDetail ??
      game.rank ??
      "";
  
  
    /* ======================================================
       PAGE
       ====================================================== */
  
    return (
      <div className="game-details-page">
  
        {/* SECONDARY HEADER */}
  
        <header className="game-details-header">
  
          <button
            type="button"
            className="game-details-back"
            onClick={() => navigate("/find")}
            aria-label="Back to find games"
          >
            <ArrowLeft size={22} />
          </button>
  
          <h1>Game Details</h1>
  
        </header>
  
  
        {/* ==================================================
            GAME IMAGE
            ================================================== */}
  
        <section
          className={`game-details-image ${
            !game.imageUrl
              ? "game-details-image-empty"
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
  
          {!game.imageUrl && (
            <div className="game-details-image-placeholder">
  
              <ImageIcon size={34} />
  
              <span>
                Game photo
              </span>
  
            </div>
          )}
  
  
          <div className="game-details-badges">
  
            <span className="details-format-badge">
              {game.format}
            </span>
  
            <span className="details-style-badge">
              {game.style}
            </span>
  
          </div>
  
        </section>
  
  
        {/* ==================================================
            CONTENT
            ================================================== */}
  
        <main className="game-details-content">
  
  
          {/* =================================================
              DATE / TIME / VENUE
              ================================================= */}
  
          <section className="details-card details-info-card">
  
            <div className="details-info-row">
  
              <div className="details-info-icon">
                <Clock3 size={18} />
              </div>
  
  
              <div className="details-info-text">
  
                <strong>
                  {game.date}, {game.time}
                </strong>
  
                <span>
                  {duration}
                </span>
  
              </div>
  
            </div>
  
  
            <div className="details-divider" />
  
  
            <button
              type="button"
              className="details-info-row details-location-button"
            >
  
              <div className="details-info-icon">
                <MapPin size={18} />
              </div>
  
  
              <div className="details-info-text">
  
                <strong>
                  {game.location}
                </strong>
  
                {locationDetail && (
                  <span>
                    {locationDetail}
                  </span>
                )}
  
              </div>
  
  
              <ChevronRight
                size={20}
                className="details-chevron"
              />
  
            </button>
  
          </section>
  
  
          {/* =================================================
              HOST
              ================================================= */}
  
          <section className="details-card">
  
            <div className="details-section-label">
              POSTED BY
            </div>
  
  
            <div className="details-host-row">
  
              <div className="details-host-avatar">
                {host.initials}
              </div>
  
  
              <div className="details-host-info">
  
                <strong>
                  {host.name}
                </strong>
  
  
                <div className="details-host-rating">
  
                  <Star
                    size={13}
                    fill="currentColor"
                  />
  
                  <span>
                    Rating {host.rating}
                    {" · "}
                    {host.verifiedMatches} verified
                  </span>
  
                </div>
  
  
                <div className="details-reliability-row">
  
                  <div className="details-reliability-track">
  
                    <div
                      className="details-reliability-fill"
                      style={{
                        width:
                          `${host.reliability}%`,
                      }}
                    />
  
                  </div>
  
  
                  <strong>
                    {host.reliability}%
                  </strong>
  
                </div>
  
              </div>
  
            </div>
  
  
            <button
              type="button"
              className="details-profile-button"
            >
              View Full Profile
            </button>
  
          </section>
  
  
          {/* =================================================
              PLAYERS GOING
              ================================================= */}
  
          <section className="details-card">
  
            <div className="details-card-header">
  
              <div className="details-section-label">
                PLAYERS GOING
              </div>
  
  
              <div className="details-player-count">
  
                <Users size={14} />
  
                <strong>
                  {confirmedPlayerCount} of{" "}
                  {maxPlayers} confirmed
                </strong>
  
              </div>
  
            </div>
  
  
            <div className="details-player-list">
  
  
              {/* REAL PLAYER DATA WHEN AVAILABLE */}
  
              {players.map((player) => (
  
                <div
                  className="details-player"
                  key={player.id}
                >
  
                  <div className="details-player-avatar">
                    {player.initials}
                  </div>
  
  
                  <strong>
                    {player.name}
                  </strong>
  
  
                  {player.host && (
                    <span className="details-host-badge">
                      Host
                    </span>
                  )}
  
                </div>
  
              ))}
  
  
              {/* TEMPORARY CONFIRMED PLAYER PLACEHOLDERS
  
                  This is useful because FindGamesPage currently
                  only knows playerCount, not the actual player list.
              */}
  
              {players.length === 0 &&
                confirmedPlayerCount > 0 && (
  
                  <div className="details-player">
  
                    <div className="details-player-avatar">
                      {host.initials}
                    </div>
  
                    <strong>
                      {host.name}
                    </strong>
  
                    <span className="details-host-badge">
                      Host
                    </span>
  
                  </div>
  
                )}
  
  
              {/* OPEN SPOTS */}
  
              {spacesLeft > 0 &&
                Array.from({
                  length: spacesLeft,
                }).map((_, index) => (
  
                  <div
                    className="details-player"
                    key={`empty-${index}`}
                  >
  
                    <div className="details-open-avatar">
  
                      <UserRound size={22} />
  
                    </div>
  
  
                    <strong>
                      Open spot
                    </strong>
  
  
                    <span className="details-open-text">
  
                      {spacesLeft === 1
                        ? "1 spot left"
                        : `${spacesLeft} spots left`}
  
                    </span>
  
                  </div>
  
                ))}
  
            </div>
  
          </section>
  
  
          {/* =================================================
              RELIABILITY WARNING
              ================================================= */}
  
          <div className="details-warning">
  
            <TriangleAlert size={22} />
  
            <p>
              Cancelling within 24 hours affects
              your reliability score. Repeated
              cancellations may limit your access
              to games.
            </p>
  
          </div>
  
  
          {/* =================================================
              REQUEST BUTTON
              ================================================= */}
  
            <button
            type="button"
            className="details-request-button"
            onClick={() =>
              navigate(
                `/games/${game.id}/request-confirmation`,
                {
                  state: {
                    player: {
                      id: game.host?.id ?? `host-${game.id}`,
                      name: host.name,
                      initials: host.initials,
                      profileImageUrl:
                        host.profileImageUrl ?? null,
                    },
                  },
                }
              )
            }
          >
            Request to Play
          </button>
            
        </main>
  
      </div>
    );
  }
  
  export default GameDetailsPage;