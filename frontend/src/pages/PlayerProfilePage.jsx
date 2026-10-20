import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import {
    ArrowLeft,
    Flag,
    ShieldCheck,
  } from "lucide-react";
  
  import "../styles/PlayerProfilePage.css";
  
  
  const fallbackPlayer = {
    id: "test",
  
    name: "Jordan K.",
    initials: "JK",
  
    level: "Intermediate",
    status: "Established",
  
    rating: 1265,
  
    wins: 11,
    losses: 7,
    matches: 18,
  
    reliability: 96,
  
    recentForm: [
      "W",
      "W",
      "L",
      "W",
      "W",
    ],
  
    preferredFormat: "Singles",
  
    area: "Albert Park",
  
    league: {
      id: 1,
      name: "Southside Singles League",
      position: 4,
    },
  
    profileImageUrl: null,
  };
  
  
  function PlayerProfilePage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { playerId } = useParams();
  
  
    const passedPlayer =
      location.state?.player;
  
  
    const player = {
      ...fallbackPlayer,
      ...passedPlayer,
  
      id:
        passedPlayer?.id ??
        playerId,
    };
  
  
    return (
      <div className="player-profile-page">
  
        {/* HEADER */}
  
        <header className="player-profile-header">
  
          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
            aria-label="Go back"
          >
            <ArrowLeft size={21} />
          </button>
  
  
          <h1>
            Player Profile
          </h1>
  
  
          <button
            type="button"
            className="player-report-button"
            aria-label="Report player"
          >
            <Flag size={18} />
          </button>
  
        </header>
  
  
        {/* PROFILE */}
  
        <section className="player-profile-summary">
  
          <div className="player-profile-top">
  
            <div className="other-player-avatar">
  
              {player.profileImageUrl ? (
                <img
                  src={
                    player.profileImageUrl
                  }
                  alt={player.name}
                />
              ) : (
                player.initials
              )}
  
            </div>
  
  
            <div>
  
              <h2>
                {player.name}
              </h2>
  
  
              <div className="other-player-tags">
  
                <span>
                  {player.level}
                </span>
  
                <span className="established">
                  {player.status}
                </span>
  
              </div>
  
            </div>
  
          </div>
  
  
          <div className="player-profile-divider" />
  
  
          <div className="other-player-stats">
  
            <div>
              <strong>
                {player.rating}
              </strong>
  
              <span>
                Rating
              </span>
            </div>
  
  
            <div>
              <strong>
                {player.wins}
              </strong>
  
              <span>
                Wins
              </span>
            </div>
  
  
            <div>
              <strong>
                {player.losses}
              </strong>
  
              <span>
                Losses
              </span>
            </div>
  
  
            <div>
              <strong>
                {player.matches}
              </strong>
  
              <span>
                Matches
              </span>
            </div>
  
          </div>
  
        </section>
  
  
        <main className="player-profile-content">
  
          {/* RELIABILITY */}
  
          <section className="player-profile-card">
  
            <div className="player-reliability-header">
  
              <h3>
                Reliability
              </h3>
  
              <strong>
                {player.reliability}%
              </strong>
  
            </div>
  
  
            <div className="player-reliability-track">
  
              <div
                className="player-reliability-fill"
                style={{
                  width:
                    `${player.reliability}%`,
                }}
              />
  
            </div>
  
  
            <p>
              {player.matches} verified
              matches completed
            </p>
  
          </section>
  
  
          {/* RECENT FORM */}
  
          <section className="player-profile-card">
  
            <h3>
              Recent Form
            </h3>
  
  
            <div className="recent-form-list">
  
              {player.recentForm.map(
                (result, index) => (
  
                  <span
                    key={index}
                    className={
                      result === "W"
                        ? "form-win"
                        : "form-loss"
                    }
                  >
                    {result}
                  </span>
  
                )
              )}
  
            </div>
  
          </section>
  
  
          {/* DETAILS */}
  
          <section className="player-profile-card player-info-card">
  
            <div>
  
              <span>
                Preferred format
              </span>
  
              <strong>
                {
                  player.preferredFormat
                }
              </strong>
  
            </div>
  
  
            <div>
  
              <span>
                Usually plays near
              </span>
  
              <strong>
                {player.area}
              </strong>
  
            </div>
  
  
            {player.league && (
  
              <button
                type="button"
                className="player-league-link"
                onClick={() =>
                  navigate(
                    `/leagues/${player.league.id}`
                  )
                }
              >
  
                <span>
                  Mini League
                </span>
  
  
                <div>
  
                  <strong>
                    {
                      player
                        .league
                        .name
                    }
                  </strong>
  
                  <small>
                    #
                    {
                      player
                        .league
                        .position
                    }
                  </small>
  
                </div>
  
              </button>
  
            )}
  
          </section>
  
  
          {/* SAFETY */}
  
          <div className="player-safety-message">
  
            <ShieldCheck size={18} />
  
            <p>
              Only play at public venues.
              If this player makes you
              uncomfortable, use the report
              button above.
            </p>
  
          </div>
  
        </main>
  
  
        {/* ACTIONS */}
  
        <div className="player-profile-actions">
  
          <button
            type="button"
            className="request-game-button"
            onClick={() =>
              navigate("/post-game", {
                state: {
                  opponent: player,
                },
              })
            }
          >
            Request Game
          </button>
  
  
          <button
            type="button"
            className="block-player-button"
            onClick={() => {
              console.log(
                "Block player:",
                player.id
              );
            }}
          >
            Block
          </button>
  
        </div>
  
      </div>
    );
  }
  
  
  export default PlayerProfilePage;