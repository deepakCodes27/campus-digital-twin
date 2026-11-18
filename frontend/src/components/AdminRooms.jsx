import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const roomColumns = `
  id,
  building_id,
  room_number,
  floor,
  capacity,
  status,
  building:buildings(name)
`;

export default function AdminRooms({ userId }) {
  const [rooms, setRooms] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [editingRoomId, setEditingRoomId] = useState(null);
  const [buildingId, setBuildingId] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [floor, setFloor] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [newStatus, setNewStatus] = useState("available");

  const formRef = useRef(null);
  const saveInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        if (!userId) return;

        const { data: membership, error: accessError } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (accessError) throw accessError;
        if (!membership) return;

        const [roomResult, buildingResult] = await Promise.all([
          supabase
            .from("rooms")
            .select(roomColumns)
            .order("room_number")
            .limit(100),

          supabase
            .from("buildings")
            .select("id, name")
            .order("name"),
        ]);

        if (roomResult.error) throw roomResult.error;
        if (buildingResult.error) throw buildingResult.error;

        if (!active) return;

        setRooms(roomResult.data ?? []);
        setBuildings(
          (buildingResult.data ?? []).filter(
            (building) =>
              !building.name.toLowerCase().startsWith("demo ")
          )
        );
        setIsAdmin(true);
      } catch (error) {
        if (active) setMessage(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [userId]);

  function resetForm() {
    setEditingRoomId(null);
    setBuildingId("");
    setRoomNumber("");
    setFloor("0");
    setCapacity("");
    setNewStatus("available");
  }

  function startEditing(room) {
    if (saveInProgress.current) return;

    setEditingRoomId(room.id);
    setBuildingId(
      room.building_id == null ? "" : String(room.building_id)
    );
    setRoomNumber(room.room_number ?? "");
    setFloor(room.floor == null ? "" : String(room.floor));
    setCapacity(
      room.capacity == null ? "" : String(room.capacity)
    );
    setNewStatus(room.status);
    setMessage("");

    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelEditing() {
    if (saveInProgress.current) return;

    resetForm();
    setMessage("");
  }

  async function saveRoom(event) {
    event.preventDefault();

    if (!isAdmin || saveInProgress.current) return;

    const name = roomNumber.trim();
    const floorNumber = Number(floor);
    const capacityNumber =
      capacity.trim() === "" ? null : Number(capacity);

    const selectedBuilding = buildings.find(
      (building) => String(building.id) === buildingId
    );

    if (!name || !selectedBuilding) {
      setMessage("Select a building and enter a room number.");
      return;
    }

    if (
      floor.trim() === "" ||
      !Number.isInteger(floorNumber) ||
      floorNumber < -2147483648 ||
      floorNumber > 2147483647
    ) {
      setMessage("Enter a valid whole number for the floor.");
      return;
    }

    if (
      capacityNumber !== null &&
      (!Number.isInteger(capacityNumber) ||
        capacityNumber <= 0 ||
        capacityNumber > 2147483647)
    ) {
      setMessage("Capacity must be a valid positive whole number.");
      return;
    }

    if (
      !["available", "occupied", "maintenance"].includes(newStatus)
    ) {
      setMessage("Choose a valid availability status.");
      return;
    }

    const roomIdToEdit = editingRoomId;

    saveInProgress.current = true;
    setSaving(true);
    setMessage("");

    try {
      const values = {
        building_id: buildingId,
        room_number: name,
        floor: floorNumber,
        capacity: capacityNumber,
        status: newStatus,
      };

      const query =
        roomIdToEdit !== null
          ? supabase
            .from("rooms")
            .update(values)
            .eq("id", roomIdToEdit)
          : supabase.from("rooms").insert(values);

      const { data, error } = await query
        .select(roomColumns)
        .single();

      if (error) throw error;

      setRooms((previous) =>
        roomIdToEdit !== null
          ? previous.map((room) =>
            room.id === data.id ? data : room
          )
          : [data, ...previous]
      );

      resetForm();

      setMessage(
        `Room ${data.room_number} ${roomIdToEdit !== null ? "updated" : "added"
        } successfully.`
      );
    } catch (error) {
      setMessage(
        error.code === "23505"
          ? "That room number already exists in this building."
          : `Could not save room: ${error.message}`
      );
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  async function updateStatus(id, status) {
    if (
      !isAdmin ||
      saveInProgress.current ||
      editingRoomId !== null
    ) {
      return;
    }

    saveInProgress.current = true;
    setSaving(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("rooms")
        .update({ status })
        .eq("id", id)
        .select("id, status")
        .single();

      if (error) throw error;

      setRooms((previous) =>
        previous.map((room) =>
          room.id === data.id
            ? { ...room, status: data.status }
            : room
        )
      );

      setMessage("Room status updated.");
    } catch (error) {
      setMessage(`Update failed: ${error.message}`);
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Checking admin access...</p>;
  }

  if (!isAdmin) {
    return (
      <p role="alert">
        {message || "This section is available to admins only."}
      </p>
    );
  }

  const linkedBuildingMissing =
    editingRoomId !== null &&
    buildingId !== "" &&
    !buildings.some(
      (building) => String(building.id) === buildingId
    );

  return (
    <section>
      <h2>Room Admin</h2>
      <p>
        Add classrooms, edit their details, and manually manage
        availability.
      </p>

      <form
        ref={formRef}
        id="room-editor"
        onSubmit={saveRoom}
        style={{
          padding: "16px",
          marginBottom: "24px",
          border: "1px solid #64748b",
          borderRadius: "12px",
        }}
      >
        <h3>
          {editingRoomId !== null ? "Edit room" : "Add room"}
        </h3>

        {message && <p role="status">{message}</p>}

        {editingRoomId !== null && (
          <p>
            Update the details below, then select Save changes.
          </p>
        )}

        <fieldset
          disabled={saving || buildings.length === 0}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label htmlFor="new-room-building">Building</label>
          <select
            id="new-room-building"
            value={buildingId}
            onChange={(event) => setBuildingId(event.target.value)}
            required
          >
            <option value="">Choose the actual building</option>

            {linkedBuildingMissing && (
              <option value={buildingId} disabled>
                Current building unavailable — choose another
              </option>
            )}

            {buildings.map((building) => (
              <option
                key={building.id}
                value={String(building.id)}
              >
                {building.name}
              </option>
            ))}
          </select>

          <p>
            Select the building containing the room.
          </p>

          <label htmlFor="new-room-number">
            Room number or label
          </label>
          <input
            id="new-room-number"
            type="text"
            value={roomNumber}
            onChange={(event) => setRoomNumber(event.target.value)}
            placeholder="For example: 201 or Computer Lab 1"
            maxLength={100}
            required
          />

          <label htmlFor="new-room-floor">
            Floor (0 = ground floor)
          </label>
          <input
            id="new-room-floor"
            type="number"
            step="1"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            required
          />

          <label htmlFor="new-room-capacity">
            Seating capacity (optional)
          </label>
          <input
            id="new-room-capacity"
            type="number"
            min="1"
            step="1"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            placeholder="Leave blank if unknown"
          />

          <label htmlFor="new-room-status">
            Current availability
          </label>
          <select
            id="new-room-status"
            value={newStatus}
            onChange={(event) => setNewStatus(event.target.value)}
          >
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">
              Under maintenance
            </option>
          </select>

          <button type="submit" disabled={saving}>
            {saving
              ? "Saving..."
              : editingRoomId !== null
                ? "Save changes"
                : "Add room"}
          </button>
        </fieldset>

        {editingRoomId !== null && (
          <button
            type="button"
            disabled={saving}
            onClick={cancelEditing}
            style={{ marginTop: "10px" }}
          >
            Cancel editing
          </button>
        )}

        {buildings.length === 0 && (
          <p>
            Add the actual building through Navigation first.
          </p>
        )}
      </form>

      <h3>Manage existing rooms</h3>
      <p>
        Loads up to 100 rooms, plus rooms added in this session.
        Availability is updated manually.
      </p>

      {editingRoomId !== null && (
        <p>
          Save or cancel the current edit before editing another
          room or using the availability dropdowns.
        </p>
      )}

      {rooms.length === 0 ? (
        <p>No rooms found.</p>
      ) : (
        <div className="rooms-grid">
          {rooms.map((room) => (
            <article className="room-item" key={room.id}>
              <h3>{room.room_number}</h3>

              <p>
                Building:{" "}
                {room.building?.name ?? "Building unavailable"}
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

              <button
                type="button"
                disabled={saving || editingRoomId !== null}
                onClick={() => startEditing(room)}
              >
                {editingRoomId === room.id
                  ? "Currently editing"
                  : "Edit room"}
              </button>

              <label htmlFor={`room-admin-${room.id}`}>
                Availability
              </label>

              <select
                id={`room-admin-${room.id}`}
                className="admin-status"
                value={room.status}
                disabled={saving || editingRoomId !== null}
                onChange={(event) =>
                  updateStatus(room.id, event.target.value)
                }
              >
                <option value="available">Available</option>
                <option value="occupied">Occupied</option>
                <option value="maintenance">
                  Under maintenance
                </option>
              </select>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}