import { Outlet } from "react-router-dom";

import TopMenuBar from "../components/navigation/TopMenuBar";
import BottomNavBar from "../components/navigation/BottomNavBar";

import "./AuthenticatedLayout.css";

function AuthenticatedLayout() {
  return (
    <div className="authenticated-layout">

      <TopMenuBar />

      <main className="authenticated-content">
        <Outlet />
      </main>

      <BottomNavBar />

    </div>
  );
}

export default AuthenticatedLayout;