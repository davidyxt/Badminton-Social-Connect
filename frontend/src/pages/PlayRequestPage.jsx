import { useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Star,
  MessageCircle,
  UserRound,
  Users,
  TriangleAlert,
  Check,
  X,
} from "lucide-react";

import "../styles/PlayRequestPage.css";


const fallbackRequest = {
  id: "request-1",

  status: "pending",

  game: {
    id: 1,

    format: "Singles",
    style: "Competitive",

    date: "Saturday",
    time: "3:00 PM",

    duration: "Approx. 60–90 mins",

    venue:
      "Melbourne Sports & Aquatic Centre",

    venueDetail:
      "Albert Park · 2.4 km",

    maxPlayers: 2,
  },

  requester: {
    id: 2,

    name: "Alex T.",
    initials: "AT",

    rating: 1248,
    verifiedMatches: 12,

    reliability: 94,

    level: "Intermediate",

    preferredFormat:
      "Singles",

    profileImageUrl: null,

    message:
      "Hi! I’d love to join this game if a spot is still available.",
  },

  host: {
    id: 1,

    name: "Jordan K.",
    initials: "JK",

    profileImageUrl: null,
  },
};


function PlayRequestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { requestId } = useParams();


  const passedRequest =
    location.state?.request;


  const request = {
    ...fallbackRequest,
    ...passedRequest,

    id:
      passedRequest?.id ??
      requestId,
  };


  const [requestStatus, setRequestStatus] =
    useState(
      request.status ??
      "pending"
    );


  /* ======================================================
     ACCEPT

     Later:
     1. update game_requests status → accepted
     2. add requester to game_players
     3. send notification to requester
     ====================================================== */

  const handleAccept = async () => {

    console.log(
      "Accept request:",
      request.id
    );

    setRequestStatus(
      "accepted"
    );
  };


  /* ======================================================
     DECLINE

     Later:
     update game_requests status → declined
     ====================================================== */

  const handleDecline = async () => {

    console.log(
      "Decline request:",
      request.id
    );

    setRequestStatus(
      "declined"
    );
  };


  return (
    <div className="play-request-page">


      {/* ==================================================
          HEADER
          ================================================== */}

      <header className="play-request-header">

        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft size={22} />
        </button>


        <h1>
          Play Request
        </h1>

      </header>


      {/* ==================================================
          GAME SUMMARY
          ================================================== */}

      <section className="play-request-game-summary">

        <div className="play-request-tags">

          <span className="play-request-format">
            {request.game.format}
          </span>

          <span className="play-request-style">
            {request.game.style}
          </span>

        </div>


        <div className="play-request-game-row">

          <div className="play-request-info-icon">
            <Clock3 size={18} />
          </div>


          <div>

            <strong>
              {request.game.date},{" "}
              {request.game.time}
            </strong>

            <span>
              {request.game.duration}
            </span>

          </div>

        </div>


        <div className="play-request-divider" />


        <button
          type="button"
          className="play-request-game-row venue-row"
          onClick={() =>
            navigate(
              `/games/${request.game.id}`
            )
          }
        >

          <div className="play-request-info-icon">
            <MapPin size={18} />
          </div>


          <div>

            <strong>
              {request.game.venue}
            </strong>

            <span>
              {
                request.game
                  .venueDetail
              }
            </span>

          </div>

        </button>

      </section>


      {/* ==================================================
          REQUESTER
          ================================================== */}

      <section className="play-request-card">

        <div className="play-request-section-label">
          REQUEST FROM
        </div>


        <div className="requester-main-row">


          {/* AVATAR */}

          <div className="requester-avatar">

            {request.requester
              .profileImageUrl ? (

              <img
                src={
                  request
                    .requester
                    .profileImageUrl
                }
                alt={
                  request
                    .requester
                    .name
                }
              />

            ) : (

              request.requester
                .initials

            )}

          </div>


          {/* DETAILS */}

          <div className="requester-info">

            <strong>
              {
                request.requester
                  .name
              }
            </strong>


            <div className="requester-rating">

              <Star
                size={13}
                fill="currentColor"
              />

              <span>
                Rating{" "}
                {
                  request.requester
                    .rating
                }
                {" · "}
                {
                  request.requester
                    .verifiedMatches
                }{" "}
                verified
              </span>

            </div>


            <div className="requester-reliability">

              <div className="requester-reliability-track">

                <div
                  className="requester-reliability-fill"
                  style={{
                    width:
                      `${request.requester.reliability}%`,
                  }}
                />

              </div>


              <strong>
                {
                  request.requester
                    .reliability
                }
                %
              </strong>

            </div>

          </div>

        </div>


        {/* TAGS */}

        <div className="requester-tags">

          <span>
            {
              request.requester
                .level
            }
          </span>

          <span>
            Preferred:{" "}
            {
              request.requester
                .preferredFormat
            }
          </span>

        </div>


        {/* MESSAGE */}

        {request.requester.message && (

          <div className="requester-message">

            “{request.requester.message}”

          </div>

        )}


        {/* PROFILE / MESSAGE */}

        <div className="requester-actions">

          <button
            type="button"
            className="requester-secondary-button"
            onClick={() =>
              navigate(
                `/players/${request.requester.id}`,
                {
                  state: {
                    player:
                      request.requester,
                  },
                }
              )
            }
          >
            View Full Profile
          </button>


          <button
            type="button"
            className="requester-secondary-button"
            onClick={() =>
              console.log(
                "Message:",
                request.requester.id
              )
            }
          >
            <MessageCircle
              size={16}
            />

            Message
          </button>

        </div>

      </section>


      {/* ==================================================
          PLAYERS GOING
          ================================================== */}

      <section className="play-request-card">

        <div className="play-request-card-header">

          <div className="play-request-section-label">
            PLAYERS GOING
          </div>


          <div className="play-request-count">
            <Users size={14} />

            1 confirmed
            {" · "}
            1 pending
          </div>

        </div>


        <div className="request-player-list">


          {/* HOST */}

          <div className="request-player">

            <div className="request-player-avatar">

              {request.host.initials}

            </div>

            <strong>
              {request.host.name}
            </strong>

            <span className="host-pill">
              Host
            </span>

          </div>


          {/* REQUESTER */}

          <div className="request-player">

            <div className="request-player-avatar pending">

              {
                request.requester
                  .initials
              }

            </div>

            <strong>
              {
                request.requester
                  .name
              }
            </strong>

            <span className="pending-pill">
              Requested
            </span>

          </div>


          {/* OPEN SPOT */}

          {request.game.maxPlayers >
            2 && (

            <div className="request-player">

              <div className="request-open-avatar">

                <UserRound
                  size={22}
                />

              </div>

              <strong>
                Open spot
              </strong>

            </div>

          )}

        </div>

      </section>


      {/* ==================================================
          WARNING
          ================================================== */}

      {requestStatus ===
        "pending" && (

        <div className="play-request-warning">

          <TriangleAlert
            size={22}
          />

          <p>
            Review the player’s
            profile before accepting.
            Accepting this request
            reserves the spot and
            notifies the player.
          </p>

        </div>

      )}


      {/* ==================================================
          ACCEPTED STATE
          ================================================== */}

      {requestStatus ===
        "accepted" && (

        <div className="play-request-result accepted">

          <Check size={22} />

          <div>

            <strong>
              Request accepted
            </strong>

            <p>
              {
                request.requester
                  .name
              }{" "}
              has been added to the
              game.
            </p>

          </div>

        </div>

      )}


      {/* ==================================================
          DECLINED STATE
          ================================================== */}

      {requestStatus ===
        "declined" && (

        <div className="play-request-result declined">

          <X size={22} />

          <div>

            <strong>
              Request declined
            </strong>

            <p>
              The player will be
              notified that the
              request was declined.
            </p>

          </div>

        </div>

      )}


      {/* ==================================================
          ACTIONS
          ================================================== */}

      <div className="play-request-actions">


        {requestStatus ===
          "pending" ? (

          <>

            <button
              type="button"
              className="decline-request-button"
              onClick={
                handleDecline
              }
            >
              Decline
            </button>


            <button
              type="button"
              className="accept-request-button"
              onClick={
                handleAccept
              }
            >
              Accept Request
            </button>

          </>

        ) : (

          <button
            type="button"
            className="view-game-after-request"
            onClick={() =>
              navigate(
                `/games/${request.game.id}`
              )
            }
          >
            View Game
          </button>

        )}

      </div>

    </div>
  );
}


export default PlayRequestPage;