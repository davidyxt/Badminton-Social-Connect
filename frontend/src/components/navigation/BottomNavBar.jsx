import { NavLink } from "react-router-dom";
import {
  Home,
  Search,
  BarChart3,
  Trophy,
} from "lucide-react";

import "./BottomNavBar.css";

function BottomNavBar() {
  return (
    <nav className="bottom-nav-bar">
      <NavLink
        to="/dashboard"
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Home className="bottom-nav-icon" strokeWidth={2.2} />
        <span>Home</span>
      </NavLink>

      <NavLink
        to="/find"
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Search className="bottom-nav-icon" strokeWidth={2.2} />
        <span>Find</span>
      </NavLink>

      <NavLink
        to="/rankings"
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <BarChart3 className="bottom-nav-icon" strokeWidth={2.2} />
        <span>Ranking</span>
      </NavLink>

      <NavLink
        to="/leagues"
        className={({ isActive }) =>
          `bottom-nav-item ${isActive ? "active" : ""}`
        }
      >
        <Trophy className="bottom-nav-icon" strokeWidth={2.2} />
        <span>Leagues</span>
      </NavLink>
    </nav>
  );
}

export default BottomNavBar;