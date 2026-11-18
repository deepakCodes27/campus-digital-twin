import { useEffect, useState } from "react";
import {
  MapContainer,
  Tooltip,
  CircleMarker,
  Popup,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import { supabase } from "../services/supabaseClient";
import {
  calculatePathDistance,
  findWalkwayRoute,
} from "../utils/routing";
import "leaflet/dist/leaflet.css";
import { BaseLayers, MapTools } from "./MapFeatures";

function LocationPicker({ enabled, onPick }) {
  useMapEvents({
    click(event) {
      if (enabled) {
        onPick([event.latlng.lat, event.latlng.lng]);
      }
    },
  });

  return null;
}
export default function Navigation({ requestedRoom = null }) {
  const [buildings, setBuildings] = useState([]);
  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addingLocation, setAddingLocation] = useState(false);
  const [pickedPosition, setPickedPosition] = useState(null);
  const [locationName, setLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [editorMessage, setEditorMessage] = useState("");
  const [walkways, setWalkways] = useState([]);
  const [walkwaysLoading, setWalkwaysLoading] = useState(true);
  const [walkwaysError, setWalkwaysError] = useState("");
  const [drawingPath, setDrawingPath] = useState(false);
  const [pathPoints, setPathPoints] = useState([]);
  const [savingPath, setSavingPath] = useState(false);
  const [pathMessage, setPathMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function checkAdmin() {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;
        if (!authData.user) return;

        const { data, error: roleError } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (roleError) throw roleError;

        if (active) setIsAdmin(Boolean(data));
      } catch {
        if (active) {
          setEditorMessage("Could not check map editing permissions.");
        }
      }
    }

    checkAdmin();

    return () => {
      active = false;
    };
  }, []);

  async function saveLocation(event) {
    event.preventDefault();

    const name = locationName.trim();

    if (!isAdmin || !pickedPosition || !name || savingLocation) return;

    setSavingLocation(true);
    setEditorMessage("");

    try {
      const { data, error: saveError } = await supabase
        .from("buildings")
        .insert({
          name,
          latitude: pickedPosition[0],
          longitude: pickedPosition[1],
        })
        .select("id, name, latitude, longitude")
        .single();

      if (saveError) throw saveError;

      setBuildings((current) =>
        [...current, data].sort((a, b) => a.name.localeCompare(b.name))
      );

      setLocationName("");
      setPickedPosition(null);
      setAddingLocation(false);
      setEditorMessage(`${data.name} saved successfully.`);
    } catch (err) {
      setEditorMessage(`Could not save location: ${err.message}`);
    } finally {
      setSavingLocation(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadBuildings() {
      try {
        const { data, error } = await supabase
          .from("buildings")
          .select("id, name, latitude, longitude")
          .order("name");

        if (error) throw error;
        if (!active) return;

        // Keep old demo markers out of the real college map.
        const places = (data ?? []).filter(
          (place) => !place.name.toLowerCase().startsWith("demo ")
        );

        setBuildings(places);

        const gate = places.find(
          (place) => place.name.toLowerCase() === "main gate entrance"
        );

        const requestedBuilding = requestedRoom
          ? places.find(
            (place) => String(place.id) === requestedRoom.buildingId
          )
          : null;

        // Prefer Main Gate, unless it is also the requested destination.
        const first =
          gate && gate.id !== requestedBuilding?.id
            ? gate
            : places.find((place) => place.id !== requestedBuilding?.id);

        const second = requestedRoom
          ? requestedBuilding
          : places.find((place) => place.id !== first?.id);

        setStart(first ? String(first.id) : "");
        setDestination(second ? String(second.id) : "");
        setSearched(false);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBuildings();

    return () => {
      active = false;
    };
  }, [requestedRoom]);

  useEffect(() => {
    let active = true;

    async function loadWalkways() {
      try {
        const { data, error: loadError } = await supabase
          .from("walkways")
          .select(
            "id, start_building_id, end_building_id, coordinates, distance_metres"
          );

        if (loadError) throw loadError;

        if (active) {
          setWalkways(data ?? []);
          setWalkwaysError("");
        }
      } catch (err) {
        if (active) setWalkwaysError(err.message);
      } finally {
        if (active) setWalkwaysLoading(false);
      }
    }

    loadWalkways();

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <p>Loading campus locations...</p>;
  if (error) return <p role="alert">Could not load locations: {error}</p>;
  if (!buildings.length) return <p>No non-demo buildings found in Supabase.</p>;

  const nodes = Object.fromEntries(
    buildings.map((place) => [
      String(place.id),
      { name: place.name, position: [place.latitude, place.longitude] },
    ])
  );

  const route =
    searched && !walkwaysLoading && !walkwaysError
      ? findWalkwayRoute(start, destination, nodes, walkways)
      : null;

  // Starting and ending coordinates come from the selected locations.
  // Map clicks add intermediate points in walking order.
  const draftPath =
    drawingPath && nodes[start] && nodes[destination]
      ? [
        nodes[start].position,
        ...pathPoints,
        nodes[destination].position,
      ]
      : [];

  async function savePath() {
    if (
      !isAdmin ||
      !drawingPath ||
      savingPath ||
      walkwaysLoading ||
      walkwaysError ||
      start === destination ||
      draftPath.length < 2
    ) {
      return;
    }

    const distance = calculatePathDistance(draftPath);

    if (!Number.isFinite(distance) || distance <= 0 || distance >= 100000) {
      setPathMessage("Please draw a valid campus walking path.");
      return;
    }

    setSavingPath(true);
    setPathMessage("");

    try {
      const { data, error: saveError } = await supabase
        .from("walkways")
        .insert({
          start_building_id: start,
          end_building_id: destination,
          coordinates: draftPath,
          distance_metres: distance,
        })
        .select(
          "id, start_building_id, end_building_id, coordinates, distance_metres"
        )
        .single();

      if (saveError) throw saveError;

      setWalkways((current) => [...current, data]);
      setDrawingPath(false);
      setPathPoints([]);
      setSearched(true);
      setPathMessage("Walking path saved successfully.");
    } catch (err) {
      setPathMessage(`Could not save path: ${err.message}`);
    } finally {
      setSavingPath(false);
    }
  }

  const options = buildings.map((place) => (
    <option key={place.id} value={String(place.id)}>
      {place.name}
    </option>
  ));

  return (
    <section className="navigation-section">
      <span className="eyebrow">FIND YOUR WAY</span><h2>Every journey starts here.</h2><p>Choose your destination and follow the campus walking paths.</p>
      {requestedRoom && (
        <div
          style={{
            padding: "16px",
            marginBottom: "16px",
            border: "1px solid #64748b",
            borderRadius: "12px",
          }}
        >
          <h3>{requestedRoom.roomNumber ? `Room ${requestedRoom.roomNumber}` : requestedRoom.buildingName}</h3>

          <p>
            Building: {requestedRoom.buildingName}
            <br />
            {requestedRoom.roomNumber && <>Floor: {requestedRoom.floor ?? "Not specified"}</>}
          </p>

          {!nodes[requestedRoom.buildingId] ? (
            <p role="alert">
              This destination is not available on the navigation map.
              Ask an administrator to check its building link.
            </p>
          ) : destination === requestedRoom.buildingId ? (
            <p>
              Your destination is selected.
              Choose your starting point and click Find walking route.
              Use the room details above for indoor orientation, if provided.
            </p>
          ) : (
            <p>
              You have selected a different destination. The route will follow
              your current selection.
            </p>
          )}
        </div>
      )}
      <p>{buildings.length} campus locations loaded.</p>
      {isAdmin && (
        <div
          style={{
            padding: "16px",
            marginBottom: "20px",
            border: "1px solid #64748b",
            borderRadius: "12px",
          }}
        >
          <h3>Map editor</h3>

          <button
            type="button"
            disabled={savingLocation || drawingPath || savingPath}
            onClick={() => {
              setAddingLocation((current) => !current);
              setPickedPosition(null);
              setLocationName("");
              setEditorMessage("");
            }}
          >
            {addingLocation ? "Cancel adding location" : "Add location"}
          </button>

          {addingLocation && (
            <>
              <p>
                Click the building entrance on the map below.
                Click again to adjust the selected position.
              </p>

              {pickedPosition && (
                <form onSubmit={saveLocation}>
                  <p>Position selected. Enter the location name.</p>

                  <label htmlFor="new-location-name">Location name</label>

                  <input
                    id="new-location-name"
                    type="text"
                    placeholder="For example: Computer Science Block"
                    value={locationName}
                    onChange={(event) => setLocationName(event.target.value)}
                    required
                    maxLength={150}
                    disabled={savingLocation}
                  />

                  <button
                    type="submit"
                    disabled={savingLocation || !locationName.trim()}
                  >
                    {savingLocation ? "Saving..." : "Save location"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {editorMessage && <p role="status">{editorMessage}</p>}
      <form onSubmit={(event) => {
        event.preventDefault();
        setSearched(true);
      }}>
        <label htmlFor="route-start">Starting point</label>
        <select id="route-start" value={start} onChange={(event) => {
          setStart(event.target.value);
          setSearched(false);
        }}>
          {options}
        </select>

        <label htmlFor="route-destination">Destination</label>
        <select id="route-destination" value={destination} onChange={(event) => {
          setDestination(event.target.value);
          setSearched(false);
        }}>
          <option value="" disabled>Choose a destination</option>
          {options}
        </select>

        <button disabled={
          !start ||
          !destination ||
          start === destination ||
          drawingPath ||
          walkwaysLoading ||
          Boolean(walkwaysError)
        }>
          Find walking route
        </button>
      </form>
      {walkwaysLoading && <p>Loading walking paths...</p>}

      {walkwaysError && (
        <p role="alert">
          Could not load walking paths: {walkwaysError}. Refresh to retry.
        </p>
      )}

      {isAdmin && (
        <div
          style={{
            margin: "20px 0",
            padding: "16px",
            border: "1px solid #64748b",
            borderRadius: "12px",
          }}
        >
          <h3>Walking path editor</h3>

          {!drawingPath ? (
            <>
              <p>
                Choose the starting point and destination above, then click
                Draw path.
              </p>

              <button
                type="button"
                disabled={
                  !start ||
                  !destination ||
                  start === destination ||
                  addingLocation ||
                  savingLocation ||
                  walkwaysLoading ||
                  Boolean(walkwaysError)
                }
                onClick={() => {
                  setDrawingPath(true);
                  setPathPoints([]);
                  setPathMessage("");
                  setSearched(false);
                }}
              >
                Draw path
              </button>
            </>
          ) : (
            <>
              <p>
                Drawing: {nodes[start]?.name} → {nodes[destination]?.name}
              </p>

              <p>
                The endpoints are already selected. Click each turn along
                the walkway, in order from start to destination.
                For a straight walkway, save without adding any turns.
              </p>

              <p>
                {pathPoints.length} intermediate points · approximately{" "}
                {Math.round(calculatePathDistance(draftPath))} metres
              </p>

              <p>Save only paths that students can walk in both directions.</p>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={savingPath || pathPoints.length === 0}
                  onClick={() => setPathPoints((current) => current.slice(0, -1))}
                >
                  Undo last point
                </button>

                <button
                  type="button"
                  disabled={savingPath}
                  onClick={savePath}
                >
                  {savingPath ? "Saving..." : "Save path"}
                </button>

                <button
                  type="button"
                  disabled={savingPath}
                  onClick={() => {
                    setDrawingPath(false);
                    setPathPoints([]);
                    setPathMessage("");
                  }}
                >
                  Cancel drawing
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {pathMessage && <p role="status">{pathMessage}</p>}
      {searched && (
        <p role="status" className="route-summary">
          {route
            ? `${route.path.map((id) => nodes[id].name).join(" → ")} · ${route.distance} m`
            : "These locations are on the map, but no verified walkway connects them yet."}
        </p>
      )}

      <MapContainer
        bounds={buildings.map((p) => [p.latitude, p.longitude])}
        boundsOptions={{ padding: [25, 25], maxZoom: 18 }}
        scrollWheelZoom={false}
        style={{ height: "600px", width: "100%" }}
      >
        <BaseLayers />
        <MapTools positions={buildings.map(p => [p.latitude, p.longitude])} routeCoordinates={route?.coordinates} />
        <LocationPicker enabled={isAdmin && addingLocation && !savingLocation} onPick={setPickedPosition} />

        <LocationPicker
          enabled={isAdmin && drawingPath && !savingPath}
          onPick={(point) => {
            setPathPoints((current) => [...current, point]);
          }}
        />

        {addingLocation && pickedPosition && (
          <CircleMarker
            center={pickedPosition}
            radius={11}
            pathOptions={{
              color: "#16a34a",
              fillColor: "#22c55e",
              fillOpacity: 0.9,
              weight: 3,
            }}
          >
            <Popup>New location — enter its name above and save.</Popup>
          </CircleMarker>
        )}
        {/* Saved campus walkways */}
        {walkways.map((walkway) => (
          <Polyline
            key={walkway.id}
            positions={walkway.coordinates}
            pathOptions={{
              color: "#64748b",
              weight: 4,
              opacity: 0.6,
            }}
            interactive={false}
          />
        ))}

        {/* Preview of the path being drawn */}
        {drawingPath && draftPath.length >= 2 && (
          <Polyline
            positions={draftPath}
            pathOptions={{
              color: "#a855f7",
              weight: 5,
              dashArray: "8 8",
            }}
            interactive={false}
          />
        )}

        {/* Shortest route through saved walkways */}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: "#f97316", weight: 6 }}
            interactive={false}
          />
        )}

        {buildings.map((place) => (
          <CircleMarker
            key={place.id}
            center={[place.latitude, place.longitude]}
            radius={8}
            pathOptions={{ color: "white", weight: 3, fillColor: String(place.id) === start ? "#0f766e" : String(place.id) === destination ? "#f97316" : "#64748b", fillOpacity: 1 }}
          >
            <Tooltip direction="top">{place.name}</Tooltip><Popup>{place.name}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </section>
  );
}