import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import {
    MessageCircle,
    TriangleAlert,
    CheckCircle2,
  } from "lucide-react";
  
  import "../styles/MatchResultFlow.css";
  
  
  const fallbackMatch = {
    id: "match-1",
  
    opponent: {
      id: 2,
      name: "Jordan K.",
      initials: "JK",
      level: "Intermediate",
    },
  
    format: "Singles",
  
    date: "Saturday, 7 September",
    time: "3:00 PM",
  
    venue: "MSAC, Albert Park",
  
    level: "Intermediate",
  
    confirmed: true,
  };
  
  
  function MatchDetailsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { matchId } = useParams();
  
    const passedMatch =
      location.state?.match;
  
    const match = {
      ...fallbackMatch,
      ...passedMatch,
  
      id:
        passedMatch?.id ??
        matchId,
    };
  
  
    return (
      <div className="match-flow-page">
  
        {/* SECONDARY HEADER */}
  
        <header className="match-flow-header">
  
          <button
            type="button"
            onClick={() =>
              navigate(-1)
            }
          >
            ←
          </button>
  
          <h1>
            Match Details
          </h1>
  
        </header>
  
  
        <main className="match-flow-content">
  
  
          {/* CONFIRMED */}
  
          <section className="confirmed-banner">
  
            <div className="confirmed-banner-title">
  
              <CheckCircle2 size={22} />
  
              <strong>
                Match Confirmed
              </strong>
  
            </div>
  
            <p>
              Both players have confirmed.
              See you on court!
            </p>
  
          </section>
  
  
          {/* MATCH */}
  
          <section className="match-flow-card">
  
            <div className="match-opponent">
  
              <div className="match-avatar">
                {match.opponent.initials}
              </div>
  
  
              <div>
  
                <h2>
                  {match.opponent.name}
                </h2>
  
                <span className="match-level-pill">
                  {match.opponent.level}
                </span>
  
              </div>
  
            </div>
  
  
            <div className="match-flow-divider" />
  
  
            <div className="match-detail-row">
              <span>Format</span>
  
              <strong>
                {match.format}
              </strong>
            </div>
  
  
            <div className="match-detail-row">
              <span>Date</span>
  
              <strong>
                {match.date}
              </strong>
            </div>
  
  
            <div className="match-detail-row">
              <span>Time</span>
  
              <strong>
                {match.time}
              </strong>
            </div>
  
  
            <div className="match-detail-row">
              <span>Venue</span>
  
              <strong>
                {match.venue}
              </strong>
            </div>
  
  
            <div className="match-detail-row">
              <span>Level</span>
  
              <strong>
                {match.level}
              </strong>
            </div>
  
          </section>
  
  
          {/* ACTIONS */}
  
          <div className="match-secondary-actions">
  
            <button
              type="button"
              onClick={() =>
                console.log(
                  "Message:",
                  match.opponent.id
                )
              }
            >
              <MessageCircle size={17} />
              Message
            </button>
  
  
            <button
              type="button"
              className="cancel-match-button"
              onClick={() =>
                console.log(
                  "Cancel match:",
                  match.id
                )
              }
            >
              Cancel Match
            </button>
  
          </div>
  
  
          {/* WARNING */}
  
          <div className="match-warning">
  
            <TriangleAlert size={20} />
  
            <p>
              Cancellations within 24 hours
              affect your reliability.
              Cancel early if needed.
            </p>
  
          </div>
  
        </main>
  
  
        {/* BOTTOM ACTION */}
  
        <div className="match-flow-bottom-action">
  
          <button
            type="button"
            className="match-flow-primary"
            onClick={() =>
              navigate(
                `/matches/${match.id}/record-result`,
                {
                  state: {
                    match,
                  },
                }
              )
            }
          >
            Record Result After Match
          </button>
  
        </div>
  
      </div>
    );
  }
  
  
  export default MatchDetailsPage;