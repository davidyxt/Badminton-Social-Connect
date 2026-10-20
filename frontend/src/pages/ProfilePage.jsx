import { useNavigate } from "react-router-dom";

import {
  UserRound,
  Gamepad2,
  ClipboardList,
  Star,
  Lock,
  Bell,
  Ban,
  Flag,
  CircleHelp,
  FileText,
  ShieldCheck,
  Settings,
  Camera,
  ChevronRight,
} from "lucide-react";

import "../styles/ProfilePage.css";


const profile = {
  name: "Alex Chen",
  initials: "AC",
  level: "Intermediate",
  reliability: 94,
  location: "Albert Park area · Melbourne, VIC",

  rating: 1271,
  winRate: 63,
  vicRank: 184,

  verifiedMatches: 19,
};


function ProfilePage() {
  const navigate = useNavigate();


  const accountItems = [
    {
      id: "profile",
      icon: UserRound,
      title: "Your Profile",
      subtitle: "Name, photo, preferences",
    },

    {
      id: "preferences",
      icon: Gamepad2,
      title: "Playing Preferences",
      subtitle: "Format, availability, area",
    },

    {
      id: "history",
      icon: ClipboardList,
      title: "Match History",
      subtitle:
        `${profile.verifiedMatches} verified matches`,
    },

    {
      id: "reliability",
      icon: Star,
      title: "Reliability",
      subtitle:
        `${profile.reliability}% · Established player`,
    },
  ];


  const safetyItems = [
    {
      id: "privacy",
      icon: Lock,
      title: "Privacy Settings",
      subtitle: "Profile visibility, location",
    },

    {
      id: "notifications",
      icon: Bell,
      title: "Notifications",
      subtitle: "Manage alerts",
    },

    {
      id: "blocked",
      icon: Ban,
      title: "Blocked Users",
      subtitle: "0 users blocked",
    },

    {
      id: "report",
      icon: Flag,
      title: "Report a Problem",
      subtitle: "Incidents, misconduct",
    },
  ];


  const appItems = [
    {
      id: "support",
      icon: CircleHelp,
      title: "Help & Support",
      subtitle: "FAQs, contact us",
    },

    {
      id: "terms",
      icon: FileText,
      title: "Terms & Privacy Policy",
      subtitle: "",
    },
  ];


  const renderMenuGroup = (items) => (
    <div className="profile-menu-card">

      {items.map((item) => {
        const Icon = item.icon;

        return (
          <button
            type="button"
            className="profile-menu-row"
            key={item.id}
            onClick={() => {
              console.log(
                "Profile menu:",
                item.id
              );
            }}
          >

            <div className="profile-menu-icon">
              <Icon size={18} />
            </div>


            <div className="profile-menu-text">

              <strong>
                {item.title}
              </strong>

              {item.subtitle && (
                <span>
                  {item.subtitle}
                </span>
              )}

            </div>


            <ChevronRight
              size={17}
              className="profile-menu-chevron"
            />

          </button>
        );
      })}

    </div>
  );


  return (
    <div className="profile-page">

      {/* PAGE TITLE */}

      <header className="profile-page-header">

        <h1>
          Profile
        </h1>

        <button
          type="button"
          className="profile-settings-button"
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>

      </header>


      {/* PROFILE SUMMARY */}

      <section className="profile-summary">

        <div className="profile-summary-main">

          <div className="profile-photo">

            <span>
              {profile.initials}
            </span>

            <button
              type="button"
              className="profile-photo-button"
              aria-label="Change profile photo"
            >
              <Camera size={12} />
            </button>

          </div>


          <div className="profile-summary-info">

            <h2>
              {profile.name}
            </h2>


            <div className="profile-tags">

              <span className="profile-level">
                {profile.level}
              </span>

              <span className="profile-reliability">
                {profile.reliability}% reliable
              </span>

            </div>


            <p>
              {profile.location}
            </p>

          </div>

        </div>


        <div className="profile-summary-divider" />


        <div className="profile-stats">

          <div>
            <strong>
              {profile.rating}
            </strong>

            <span>
              Rating
            </span>
          </div>


          <div>
            <strong>
              {profile.winRate}%
            </strong>

            <span>
              Win Rate
            </span>
          </div>


          <div>
            <strong>
              #{profile.vicRank}
            </strong>

            <span>
              VIC Rank
            </span>
          </div>

        </div>

      </section>


      {/* ACCOUNT */}

      <main className="profile-content">

        <section>

          <h3 className="profile-section-label">
            ACCOUNT
          </h3>

          {renderMenuGroup(accountItems)}

        </section>


        {/* PRIVACY */}

        <section>

          <h3 className="profile-section-label">
            PRIVACY & SAFETY
          </h3>

          {renderMenuGroup(safetyItems)}

        </section>


        {/* APP */}

        <section>

          <h3 className="profile-section-label">
            APP
          </h3>

          {renderMenuGroup(appItems)}

        </section>


        {/* PRIVACY INFO */}

        <div className="profile-privacy-message">

          <ShieldCheck size={18} />

          <div>

            <strong>
              Your privacy is protected
            </strong>

            <p>
              Your exact address is never shared.
              Only approximate area information
              is shown.
            </p>

          </div>

        </div>


        {/* SIGN OUT */}

        <button
          type="button"
          className="profile-signout-button"
          onClick={() => {
            console.log("Sign out");
            navigate("/login");
          }}
        >
          Sign Out
        </button>


        <button
          type="button"
          className="profile-delete-button"
        >
          Delete Account
        </button>

      </main>

    </div>
  );
}


export default ProfilePage;