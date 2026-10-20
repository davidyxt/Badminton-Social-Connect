import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  CheckCircle2,
  ClipboardList,
  Trophy,
  AlarmClock,
  XCircle,
  CircleDot,
  BarChart3,
  BellOff,
} from "lucide-react";

import "../styles/NotificationsPage.css";


/* ======================================================
   TEMPORARY DATA

   Later this can come from Supabase.

   Set this to [] to test the empty state.
   ====================================================== */

const initialNotifications = [
  {
    id: 1,
    type: "request",
    title: "Jordan K. accepted your game request.",
    message: "Tap to view match details",
    time: "2 min ago",
    unread: true,
    target: "/games/1",
  },

  {
    id: 2,
    type: "result",
    title:
      "Sam T. submitted your match result. Please confirm it.",
    message:
      "21–18, 17–21, 21–16 — Sam won",
    time: "1 hour ago",
    unread: true,
    target: "/games/2",
  },

  {
    id: 3,
    type: "league",
    title:
      "You moved to #3 in Northside Social League.",
    message:
      "After your win vs Maya R.",
    time: "2 days ago",
    unread: true,
    target: "/leagues/1",
  },

  {
    id: 4,
    type: "reminder",
    title:
      "Your match is tomorrow at 3:00 PM.",
    message:
      "vs Jordan K. · MSAC, Albert Park",
    time: "1 day ago",
    unread: false,
    target: "/games/3",
  },

  {
    id: 5,
    type: "cancelled",
    title:
      "Maya R. cancelled your match.",
    message:
      "Find another game or post your own",
    time: "3 days ago",
    unread: false,
    target: "/find",
  },

  {
    id: 6,
    type: "game",
    title:
      "New game posted near you.",
    message:
      "Singles · Intermediate · Albert Park",
    time: "4 days ago",
    unread: false,
    target: "/find",
  },

  {
    id: 7,
    type: "rating",
    title:
      "Your rating increased to 1271.",
    message:
      "+23 after win vs Jordan K.",
    time: "5 days ago",
    unread: false,
    target: "/rankings",
  },
];


function getNotificationIcon(type) {
  switch (type) {
    case "request":
      return CheckCircle2;

    case "result":
      return ClipboardList;

    case "league":
      return Trophy;

    case "reminder":
      return AlarmClock;

    case "cancelled":
      return XCircle;

    case "rating":
      return BarChart3;

    default:
      return CircleDot;
  }
}


function NotificationsPage() {
  const navigate = useNavigate();

  const [
    notifications,
    setNotifications,
  ] = useState(
    initialNotifications
  );


  const handleNotificationClick = (
    notification
  ) => {
    setNotifications(
      (previous) =>
        previous.map((item) =>
          item.id ===
          notification.id
            ? {
                ...item,
                unread: false,
              }
            : item
        )
    );


    if (notification.target) {
      navigate(
        notification.target
      );
    }
  };


  const markAllRead = () => {
    setNotifications(
      (previous) =>
        previous.map(
          (notification) => ({
            ...notification,
            unread: false,
          })
        )
    );
  };


  const hasUnread =
    notifications.some(
      (notification) =>
        notification.unread
    );


  return (
    <div className="notifications-page">

      {/* HEADER */}

      <header className="notifications-header">

        <h1>
          Notifications
        </h1>


        {notifications.length >
          0 && (
          <button
            type="button"
            className="mark-all-read-button"
            onClick={markAllRead}
            disabled={!hasUnread}
          >
            Mark all read
          </button>
        )}

      </header>


      {/* ==================================================
          NOTIFICATIONS
          ================================================== */}

      {notifications.length > 0 ? (

        <div className="notifications-list">

          {notifications.map(
            (notification) => {

              const Icon =
                getNotificationIcon(
                  notification.type
                );


              return (
                <button
                  type="button"
                  key={
                    notification.id
                  }
                  className={`notification-row ${
                    notification.unread
                      ? "unread"
                      : ""
                  }`}
                  onClick={() =>
                    handleNotificationClick(
                      notification
                    )
                  }
                >

                  <div
                    className={`notification-icon notification-${notification.type}`}
                  >
                    <Icon
                      size={21}
                      strokeWidth={2}
                    />
                  </div>


                  <div className="notification-content">

                    <strong>
                      {
                        notification.title
                      }
                    </strong>


                    <p>
                      {
                        notification.message
                      }
                    </p>


                    <span>
                      {
                        notification.time
                      }
                    </span>

                  </div>


                  {notification.unread && (
                    <span className="notification-unread-dot" />
                  )}

                </button>
              );
            }
          )}

        </div>

      ) : (

        /* ==================================================
           EMPTY STATE
           ================================================== */

        <div className="notifications-empty">

          <div className="notifications-empty-icon">
            <BellOff
              size={31}
              strokeWidth={1.8}
            />
          </div>


          <h2>
            No notifications
          </h2>


          <p>
            You're all caught up.
            New game requests,
            league updates and match
            activity will appear here.
          </p>

        </div>

      )}

    </div>
  );
}


export default NotificationsPage;