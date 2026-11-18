import { useEffect, useState } from "react";
import { fetchRooms } from "../services/api";

export default function Rooms({ onNavigateToRoom, onReportRoom }) {
  const [rooms, setRooms] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [floorFilter, setFloorFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadRooms() {
      try {
        const data = await fetchRooms();

        if (!Array.isArray(data)) {
          throw new Error("The room service returned an unexpected response.");
        }

        if (active) {
          setRooms(data);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadRooms();

    return () => {
      active = false;
    };
  }, []);

  const floors = [
    ...new Set(
      rooms
        .map((room) => room.floor)
        .filter((floor) => floor !== null && floor !== undefined)
        .map(String)
    ),
  ].sort((a, b) => Number(a) - Number(b));

  const query = search.trim().toLowerCase();

  const visibleRooms = rooms.filter((room) => {
    const matchesStatus =
      statusFilter === "all" || room.status === statusFilter;

    const matchesSearch =
      String(room.room_number ?? "").toLowerCase().includes(query) ||
      String(room.building?.name ?? "").toLowerCase().includes(query);

    const matchesFloor =
      floorFilter === "all" || String(room.floor) === floorFilter;

    return matchesStatus && matchesSearch && matchesFloor;
  });

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setFloorFilter("all");
  }

  return (
    <section className="rooms-section">
      <h2>Room Directory</h2>

      <p>
        Find rooms, navigate to their building entrances, and report
        maintenance problems. Availability is updated manually.
      </p>

      <label htmlFor="room-search">Search rooms</label>
      <input
        id="room-search"
        type="search"
        placeholder="Enter room number or building name"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <label htmlFor="room-status">Filter by status</label>
      <select
        id="room-status"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="all">All rooms</option>
        <option value="available">Available</option>
        <option value="occupied">Occupied</option>
        <option value="maintenance">Under maintenance</option>
      </select>

      <label htmlFor="room-floor">Filter by floor</label>
      <select
        id="room-floor"
        value={floorFilter}
        onChange={(event) => setFloorFilter(event.target.value)}
      >
        <option value="all">All floors</option>

        {floors.map((floor) => (
          <option key={floor} value={floor}>
            {Number(floor) === 0 ? "Ground floor" : `Floor ${floor}`}
          </option>
        ))}
      </select>

      <button type="button" onClick={clearFilters}>
        Clear filters
      </button>

      {!loading && !errorMessage && (
        <p role="status">
          Showing {visibleRooms.length} of {rooms.length} rooms
        </p>
      )}

      {loading ? (
        <p>Loading rooms...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load rooms: {errorMessage}</p>
      ) : visibleRooms.length === 0 ? (
        <p>
          {rooms.length === 0
            ? "No rooms have been added yet."
            : "No rooms match your search and filters. Try Clear filters."}
        </p>
      ) : (
        <div className="rooms-grid">
          {visibleRooms.map((room) => (
            <article className="room-item" key={room.id}>
              <h3>{room.room_number}</h3>

              <p>
                Building: {room.building?.name ?? "Unavailable"}
              </p>

              <p>
                Floor:{" "}
                {room.floor == null
                  ? "Not specified"
                  : Number(room.floor) === 0
                    ? "Ground floor"
                    : room.floor}
              </p>

              <p>
                Capacity:{" "}
                {room.capacity == null
                  ? "Not specified"
                  : `${room.capacity} people`}
              </p>

              <span className={`room-status ${room.status}`}>
                {room.status === "maintenance"
                  ? "Under maintenance"
                  : room.status === "available"
                    ? "Available"
                    : room.status === "occupied"
                      ? "Occupied"
                      : "Status unavailable"}
              </span>

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  disabled={
                    room.building_id == null ||
                    typeof onNavigateToRoom !== "function"
                  }
                  onClick={() => {
                    if (
                      room.building_id == null ||
                      typeof onNavigateToRoom !== "function"
                    ) {
                      return;
                    }

                    onNavigateToRoom({
                      buildingId: String(room.building_id),
                      buildingName: room.building?.name ?? "Building",
                      roomNumber: room.room_number,
                      floor: room.floor,
                    });
                  }}
                >
                  Navigate to building
                </button>

                <button
                  type="button"
                  disabled={typeof onReportRoom !== "function"}
                  onClick={() => {
                    if (typeof onReportRoom === "function") {
                      onReportRoom(room);
                    }
                  }}
                >
                  Report a problem
                </button>
              </div>

              {room.building_id == null && (
                <p>
                  This room needs a linked building before navigation
                  is available.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}