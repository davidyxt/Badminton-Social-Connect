import * as api from "../services/badmintonApi";
import { useEffect, useState } from "react";

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

  const [
    notifications,
    setNotifications,
  ] = useState(
    []
  );
  const [loadError,setLoadError]=useState("");
  const [userId,setUserId]=useState(null);
  useEffect(()=>{let live=true;api.getCurrentUserId().then(id=>{if(!live||!id)return;setUserId(id);return api.getNotifications(id)}).then(rows=>{if(live&&rows)setNotifications(rows.map(n=>({id:n.notificationId,type:n.type,title:n.message||"Notification",message:"",time:"",unread:!n.isRead,target:null})));}).catch(e=>{if(live)setLoadError(e.message)});return()=>{live=false};},[]);


  const handleNotificationClick = async notification => {
    if(!notification.unread)return;
    try{await api.markNotificationRead(notification.id);
      setNotifications(previous=>previous.map(item=>item.id===notification.id?{...item,unread:false}:item));
    }catch(e){setLoadError(e.message);}
  };
  const markAllRead = async () => {
    if(!userId)return;
    try{await api.markNotificationsRead(userId);
      setNotifications(previous=>previous.map(item=>({...item,unread:false})));
    }catch(e){setLoadError(e.message);}
  };

  const hasUnread =
    notifications.some(
      (notification) =>
        notification.unread
    );


  return (
    <div className="notifications-page">
      {loadError && <p role="alert">{loadError}</p>}

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