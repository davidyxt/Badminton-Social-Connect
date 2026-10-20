import {
    useLocation,
    useNavigate,
  } from "react-router-dom";
  
  import {
    Trophy,
    TrendingUp,
  } from "lucide-react";
  
  import "../styles/MatchResultFlow.css";
  
  
  const fallbackMatch = {
    currentUser: {
      id: 1,
      name: "Alex C.",
    },
  
    opponent: {
      id: 2,
      name: "Jordan K.",
    },
  };
  
  
  const fallbackResult = {
    winnerId: 1,
  
    oldRating: 1248,
    newRating: 1271,
    ratingChange: 23,
  
    vicRank: 184,
  
    leaguePosition: 3,
  };
  
  
  function ResultConfirmedPage() {
    const navigate = useNavigate();
    const location = useLocation();
  
  
    const match =
      location.state?.match ??
      fallbackMatch;
  
  
    const result =
      location.state?.result ??
      fallbackResult;
  
  
    const userWon =
      result.winnerId ===
      match.currentUser.id;
  
  
    return (
      <div className="result-confirmed-page">
  
        <main className="result-confirmed-content">
  
  
          <div className="result-medal">
  
            <Trophy size={42} />
  
          </div>
  
  
          <span className="result-confirmed-label">
            RESULT CONFIRMED
          </span>
  
  
          <h1>
  
            {userWon
              ? "YOU WON!"
              : "RESULT CONFIRMED"}
  
          </h1>
  
  
          <p>
  
            {userWon
              ? `Great match against ${match.opponent.name}.`
              : `${match.opponent.name} won the match.`}
  
          </p>
  
  
          {/* RATING */}
  
          <section className="rating-update-card">
  
            <h2>
              RATING UPDATE
            </h2>
  
  
            <div className="rating-update-values">
  
              <div>
  
                <strong className="old-rating">
                  {result.oldRating}
                </strong>
  
                <span>
                  Previous
                </span>
  
              </div>
  
  
              <div className="rating-arrow">
  
                →
  
                <strong>
                  +
                  {
                    result.ratingChange
                  }
                </strong>
  
              </div>
  
  
              <div>
  
                <strong className="new-rating">
                  {
                    result.newRating
                  }
                </strong>
  
                <span>
                  New Rating
                </span>
  
              </div>
  
            </div>
  
  
            <div className="match-flow-divider" />
  
  
            <div className="rating-ranking-update">
  
              <div>
  
                <TrendingUp
                  size={15}
                />
  
                <strong>
                  #{result.vicRank}
                </strong>
  
                <span>
                  VIC Rank
                </span>
  
              </div>
  
  
              <div>
  
                <TrendingUp
                  size={15}
                />
  
                <strong>
                  #
                  {
                    result
                      .leaguePosition
                  }
                </strong>
  
                <span>
                  Mini League
                </span>
  
              </div>
  
            </div>
  
          </section>
  
  
          <button
            type="button"
            className="confirmed-ranking-button"
            onClick={() =>
              navigate("/rankings")
            }
          >
            View Ranking
          </button>
  
  
          <button
            type="button"
            className="confirmed-find-button"
            onClick={() =>
              navigate("/find")
            }
          >
            Find Another Game
          </button>
  
        </main>
  
      </div>
    );
  }
  
  
  export default ResultConfirmedPage;