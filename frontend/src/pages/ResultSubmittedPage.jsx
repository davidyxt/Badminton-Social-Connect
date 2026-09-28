import {
    useLocation,
    useNavigate,
    useParams,
  } from "react-router-dom";
  
  import {
    Clock3,
    Check,
  } from "lucide-react";
  
  import "../styles/MatchResultFlow.css";
  
  
  const fallbackData = {
    match: {
      id: "match-1",
  
      currentUser: {
        id: 1,
        name: "Alex C.",
      },
  
      opponent: {
        id: 2,
        name: "Jordan K.",
      },
    },
  
    result: {
      winnerId: 1,
  
      sets: [
        {
          player1: "21",
          player2: "18",
        },
  
        {
          player1: "17",
          player2: "21",
        },
  
        {
          player1: "21",
          player2: "16",
        },
      ],
    },
  };
  
  
  function ResultSubmittedPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { matchId } = useParams();
  
  
    const match =
      location.state?.match ??
      fallbackData.match;
  
  
    const result =
      location.state?.result ??
      fallbackData.result;
  
  
    const userWon =
      result.winnerId ===
      match.currentUser.id;
  
  
    const confirmResult = () => {
  
      const confirmedResult = {
        ...result,
  
        status:
          "confirmed",
  
        oldRating: 1248,
        newRating: 1271,
        ratingChange: 23,
  
        vicRank: 184,
        leaguePosition: 3,
      };
  
  
      navigate(
        `/matches/${matchId}/result-confirmed`,
        {
          state: {
            match,
            result:
              confirmedResult,
          },
        }
      );
  
    };
  
  
    return (
      <div className="match-flow-page">
  
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
            Result Submitted
          </h1>
  
        </header>
  
  
        <main className="result-submitted-content">
  
          <div className="waiting-icon">
            <Clock3 size={32} />
          </div>
  
  
          <h2>
            Waiting for confirmation
          </h2>
  
  
          <p className="waiting-description">
  
            Waiting for{" "}
  
            <strong>
              {match.opponent.name}
            </strong>
  
            {" "}to confirm this result.
  
          </p>
  
  
          {/* RESULT */}
  
          <section className="match-flow-card submitted-score-card">
  
            <h3>
              RESULT YOU SUBMITTED
            </h3>
  
  
            {result.sets.map(
              (set, index) => (
  
                <div
                  className="submitted-set"
                  key={index}
                >
  
                  <span>
                    Set {index + 1}
                  </span>
  
                  <strong className="submitted-score-winner">
                    {set.player1}
                  </strong>
  
                  <span>
                    –
                  </span>
  
                  <strong>
                    {set.player2}
                  </strong>
  
                </div>
  
              )
            )}
  
  
            <div className="match-flow-divider" />
  
  
            <strong className="submitted-result-text">
  
              {userWon
                ? "You won ✓"
                : `${match.opponent.name} won`}
  
            </strong>
  
          </section>
  
  
          {/* DEVELOPMENT / OPPONENT PREVIEW */}
  
          <section className="opponent-confirmation-preview">
  
            <h3>
              WHAT{" "}
              {match.opponent.name.toUpperCase()}{" "}
              SEES:
            </h3>
  
  
            <p>
              {match.currentUser.name} submitted
              a match result. Please confirm
              or dispute.
            </p>
  
  
            <div>
  
              <button
                type="button"
                className="confirm-result-button"
                onClick={
                  confirmResult
                }
              >
                Confirm Result
              </button>
  
  
              <button
                type="button"
                className="dispute-result-button"
                onClick={() =>
                  console.log(
                    "Dispute result"
                  )
                }
              >
                Dispute
              </button>
  
            </div>
  
          </section>
  
        </main>
  
      </div>
    );
  }
  
  
  export default ResultSubmittedPage;