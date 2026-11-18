import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

const CampusMap = lazy(() => import("./campusMap"));
const Navigation = lazy(() => import("./Navigation"));
const Rooms = lazy(() => import("./Rooms"));
const Events = lazy(() => import("./Events"));
const Faculty = lazy(() => import("./Faculty"));
const Announcements = lazy(() => import("./Announcements"));
const MaintenanceReports = lazy(() => import("./MaintenanceReports"));
const AdminReports = lazy(() => import("./AdminReports"));
const AdminAnnouncements = lazy(() => import("./AdminAnnouncements"));
const AdminRooms = lazy(() => import("./AdminRooms"));
const AdminEvents = lazy(() => import("./AdminEvents"));
const Campus3D = lazy(() => import("./Campus3D"));

const studentSections = [
  { id: "map", label: "Campus Map" },
  { id: "navigation", label: "Navigation" },
  { id: "rooms", label: "Rooms" },
  { id: "events", label: "Events" },
  { id: "faculty", label: "Faculty" },
  { id: "announcements", label: "Announcements" },
  { id: "maintenance", label: "My Maintenance Reports" },
  { id: "campus-3d", label: "3D Campus" },
];

const adminSections = [
  { id: "admin", label: "Manage Reports" },
  { id: "notice-admin", label: "Manage Announcements" },
  { id: "room-admin", label: "Manage Rooms" },
  { id: "event-admin", label: "Manage Events" },
];

export default function Dashboard({ userId }) {
  const [activeSection, setActiveSection] = useState("map");
  const [adminUserId, setAdminUserId] = useState(null);
  const [accessError, setAccessError] = useState("");

  const [requestedRoom, setRequestedRoom] = useState(null);
  const [reportLocation, setReportLocation] = useState("");

  const isAdmin = Boolean(userId) && adminUserId === userId;

  useEffect(() => {
    let active = true;

    async function checkAdminAccess() {
      if (!userId) return;

      try {
        const { data, error } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) throw error;

        if (active) {
          setAdminUserId(data ? userId : null);
          setAccessError("");
        }
      } catch {
        if (active) {
          setAdminUserId(null);
          setAccessError(
            "Could not check admin access. Refresh the page to retry."
          );
        }
      }
    }

    checkAdminAccess();

    return () => {
      active = false;
    };
  }, [userId]);

  function navigateToRoom(room) {
    setRequestedRoom(room);
    setReportLocation("");
    setActiveSection("navigation");
  }

  function navigateFrom3D(place) {
    setRequestedRoom({
      buildingId: String(place.id),
      buildingName: place.name,
    });

    setActiveSection("navigation");
  }

  function navigateToPlace(place) {
    setRequestedRoom({ buildingId: String(place.id), buildingName: place.name });
    setReportLocation("");
    setActiveSection("navigation");
  }

  function reportRoomProblem(room) {
    const building =
      room.building?.name?.trim() || "Building not specified";

    const roomLabel =
      String(room.room_number ?? "").trim() || "Not specified";

    setReportLocation(`${building}, Room ${roomLabel}`);
    setRequestedRoom(null);
    setActiveSection("maintenance");
  }

  function selectSection(sectionId) {
    setRequestedRoom(null);
    setReportLocation("");
    setActiveSection(sectionId);
  }

  function renderButtons(sections) {
    return sections.map((section) => (
      <button
        key={section.id}
        type="button"
        aria-pressed={activeSection === section.id}
        onClick={() => selectSection(section.id)}
      >
        <span className="nav-symbol" aria-hidden="true">{({ map: "◈", navigation: "↗", rooms: "▦", events: "▤", faculty: "◎", announcements: "◉", maintenance: "◇" })[section.id] || "+"}</span>{section.label}
      </button>
    ));
  }

  return (
    <div className="dashboard-layout">
      <aside className="app-sidebar"><div className="sidebar-title">YOUR CAMPUS</div><nav className="dashboard-nav" aria-label="Campus features">
        {renderButtons(studentSections)}
      </nav>

        {accessError && <p role="alert">{accessError}</p>}

        {isAdmin && (
          <section className="admin-tools">
            <h2>Admin Tools</h2>

            <nav className="dashboard-nav" aria-label="Admin tools">
              {renderButtons(adminSections)}
            </nav>
          </section>
        )}

        <div className="sidebar-foot"><span className="status-dot" /> Career Point University<br /><small>Kota, Rajasthan</small></div></aside>
      <div className="dashboard-content">
        <Suspense fallback={<p role="status">Loading section...</p>}>
          {activeSection === "map" && <CampusMap onNavigate={navigateToPlace} />}

          {activeSection === "navigation" && (
            <Navigation requestedRoom={requestedRoom} />
          )}

          {activeSection === "rooms" && (
            <Rooms
              onNavigateToRoom={navigateToRoom}
              onReportRoom={reportRoomProblem}
            />
          )}

          {activeSection === "events" && <Events />}

          {activeSection === "faculty" && <Faculty />}

          {activeSection === "announcements" && <Announcements />}

          {activeSection === "campus-3d" && (
            <Campus3D onNavigate={navigateFrom3D} />
          )}

          {activeSection === "maintenance" && (
            <MaintenanceReports
              key={`${userId}:${reportLocation}`}
              userId={userId}
              initialLocation={reportLocation}
            />
          )}

          {isAdmin && activeSection === "admin" && (
            <AdminReports userId={userId} />
          )}

          {isAdmin && activeSection === "notice-admin" && (
            <AdminAnnouncements userId={userId} />
          )}

          {isAdmin && activeSection === "room-admin" && (
            <AdminRooms userId={userId} />
          )}

          {isAdmin && activeSection === "event-admin" && (
            <AdminEvents key={userId} userId={userId} />
          )}
        </Suspense>
      </div>
    </div>
  );
}