import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getNotifications, getPlayer } from "../../services/badmintonApi";
import "./TopMenuBar.css";

function TopMenuBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [initials, setInitials] = useState("?");
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let current = true;
    const fallback = user.user_metadata?.display_name || user.email?.split("@")[0] || "Player";
    const toInitials = (name) => (name || "Player").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    setInitials(toInitials(fallback));
    Promise.allSettled([getPlayer(user.id), getNotifications(user.id)]).then(([player, notifications]) => {
      if (!current) return;
      if (player.status === "fulfilled" && player.value?.displayName) {
        setInitials(toInitials(player.value.displayName));
      }
      if (notifications.status === "fulfilled") {
        setUnreadCount(notifications.value.filter((item) => !item.isRead).length);
      }
    });
    return () => { current = false; };
  }, [user?.id, user?.email, user?.user_metadata?.display_name]);

  return (
    <header className="top-menu-bar">
      <button className="top-menu-icon-button" aria-label="Open profile menu" type="button" onClick={() => navigate("/profile")}>
        <span className="hamburger-icon"><span></span><span></span><span></span></span>
      </button>
      <div className="top-menu-actions">
        <button className="notification-button" aria-label="Notifications" type="button" onClick={() => navigate("/notifications")}>
          <svg viewBox="0 0 24 24" className="top-menu-svg" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10 21h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
        <button className="profile-avatar" aria-label="Open profile" type="button" onClick={() => navigate("/profile")}>{initials}</button>
      </div>
    </header>
  );
}

export default TopMenuBar;
