import { useState } from "react";

import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  Info,
  Plus,
} from "lucide-react";

import "../styles/MatchResultFlow.css";


const fallbackMatch = {
  id: "match-1",

  currentUser: {
    id: 1,
    name: "Alex C.",
    initials: "AC",
  },

  opponent: {
    id: 2,
    name: "Jordan K.",
    initials: "JK",
  },
};


function RecordResultPage() {
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

    currentUser:
      passedMatch?.currentUser ??
      fallbackMatch.currentUser,

    opponent:
      passedMatch?.opponent ??
      fallbackMatch.opponent,
  };


  const [winnerId, setWinnerId] =
    useState(
      match.currentUser.id
    );


  const [sets, setSets] =
    useState([
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
    ]);


  const updateSet = (
    index,
    field,
    value
  ) => {

    setSets((previous) =>
      previous.map(
        (set, setIndex) =>
          setIndex === index
            ? {
                ...set,
                [field]:
                  value,
              }
            : set
      )
    );

  };


  const addSet = () => {

    setSets((previous) => [
      ...previous,
      {
        player1: "",
        player2: "",
      },
    ]);

  };


  const handleSubmit = () => {

    const result = {
      id:
        `result-${Date.now()}`,

      matchId:
        match.id,

      winnerId,

      sets,

      status:
        "pending_confirmation",
    };


    navigate(
      `/matches/${match.id}/result-submitted`,
      {
        state: {
          match,
          result,
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
          Record Result
        </h1>

      </header>


      <main className="match-flow-content">

        <section className="match-flow-card">


          {/* PLAYERS */}

          <div className="result-versus">

            <div className="result-player">

              <div className="large-match-avatar">
                {
                  match.currentUser
                    .initials
                }
              </div>

              <strong>
                {
                  match.currentUser
                    .name
                }
              </strong>

              <span>
                You
              </span>

            </div>


            <strong className="versus-text">
              VS
            </strong>


            <div className="result-player">

              <div className="large-match-avatar dark">
                {
                  match.opponent
                    .initials
                }
              </div>

              <strong>
                {
                  match.opponent
                    .name
                }
              </strong>

              <span>
                Opponent
              </span>

            </div>

          </div>


          {/* WINNER */}

          <h3 className="result-section-title">
            WINNER
          </h3>


          <div className="winner-buttons">

            <button
              type="button"
              className={
                winnerId ===
                match.currentUser.id
                  ? "selected"
                  : ""
              }
              onClick={() =>
                setWinnerId(
                  match.currentUser.id
                )
              }
            >
              I Won
            </button>


            <button
              type="button"
              className={
                winnerId ===
                match.opponent.id
                  ? "selected"
                  : ""
              }
              onClick={() =>
                setWinnerId(
                  match.opponent.id
                )
              }
            >
              {
                match.opponent
                  .name
              }{" "}
              Won
            </button>

          </div>


          {/* SCORES */}

          <h3 className="result-section-title scores-heading">
            SCORES
            <span>
              {" "}
              (OPTIONAL)
            </span>
          </h3>


          <div className="score-list">

            {sets.map(
              (set, index) => (

                <div
                  className="score-row"
                  key={index}
                >

                  <span>
                    Set {index + 1}
                  </span>


                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={
                      set.player1
                    }
                    onChange={(event) =>
                      updateSet(
                        index,
                        "player1",
                        event.target.value
                      )
                    }
                  />


                  <strong>
                    –
                  </strong>


                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={
                      set.player2
                    }
                    onChange={(event) =>
                      updateSet(
                        index,
                        "player2",
                        event.target.value
                      )
                    }
                  />

                </div>

              )
            )}

          </div>


          <button
            type="button"
            className="add-set-button"
            onClick={addSet}
          >
            <Plus size={15} />
            Add Set
          </button>

        </section>


        <div className="result-info-message">

          <Info size={19} />

          <p>
            Rankings are only updated
            once{" "}
            <strong>
              {match.opponent.name}
            </strong>{" "}
            confirms this result.
            Unconfirmed results don't
            affect your rating.
          </p>

        </div>

      </main>


      <div className="match-flow-bottom-action">

        <button
          type="button"
          className="match-flow-primary"
          onClick={
            handleSubmit
          }
        >
          Submit Result
        </button>

      </div>

    </div>
  );
}


export default RecordResultPage;