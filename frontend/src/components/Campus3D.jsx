import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap, Marker, Popup, NavigationControl,
  FullscreenControl, GeolocateControl, ScaleControl,
} from "maplibre-gl";
import { supabase } from "../services/supabaseClient";
import "maplibre-gl/dist/maplibre-gl.css";

const apiKey = (import.meta.env.VITE_MAPTILER_KEY ?? "").trim();
const campusView = { center: [75.914, 25.0125], zoom: 16.5, pitch: 45, bearing: -20 };
const pathLayerIds = ["walkways-outline", "walkways-line"];

function placeName(place) {
  return String(place.name ?? "").trim() || "Campus location";
}

function matchesSearch(place, query) {
  return placeName(place).toLowerCase().includes(query.trim().toLowerCase());
}

function validCoordinate(value, limit) {
  return (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" && Number.isFinite(Number(value)) &&
    Math.abs(Number(value)) <= limit;
}

function isCampusPlace(place) {
  return place.id != null && !placeName(place).toLowerCase().startsWith("demo ") &&
    validCoordinate(place.latitude, 90) && validCoordinate(place.longitude, 180);
}

function lngLat(place) {
  return [Number(place.longitude), Number(place.latitude)];
}

function walkwayFeatures(walkways) {
  return walkways.flatMap(({ id, coordinates }) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2 ||
        !coordinates.every((point) => Array.isArray(point) && point.length === 2 &&
          Number.isFinite(point[0]) && Math.abs(point[0]) <= 90 &&
          Number.isFinite(point[1]) && Math.abs(point[1]) <= 180)) return [];

    return [{
      type: "Feature",
      properties: { walkwayId: String(id) },
      geometry: {
        type: "LineString",
        // Walkways in Supabase use [lat, lng]; GeoJSON uses [lng, lat].
        coordinates: coordinates.map(([lat, lng]) => [lng, lat]),
      },
    }];
  });
}

function satelliteStyle() {
  const key = encodeURIComponent(apiKey);
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [`https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}@2x.jpg?key=${key}`],
        tileSize: 512,
        maxzoom: 19,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a>',
      },
      elevation: {
        type: "raster-dem",
        url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${key}`,
        encoding: "mapbox",
      },
    },
    layers: [{ id: "satellite-imagery", type: "raster", source: "satellite" }],
    terrain: { source: "elevation", exaggeration: 1 },
  };
}

export default function Campus3D({ onNavigate }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const openPopupRef = useRef(null);
  const navigateRef = useRef(onNavigate);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [places, setPlaces] = useState([]);
  const [placesMessage, setPlacesMessage] = useState("Loading campus locations...");
  const [placeSearch, setPlaceSearch] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState("");
  const [walkwayMessage, setWalkwayMessage] = useState("Loading walking paths...");
  const [walkwaysReady, setWalkwaysReady] = useState(false);
  const [showWalkways, setShowWalkways] = useState(true);

  // MapLibre owns the popup buttons. Keep their Dashboard callback current
  // without rebuilding the map or fetching the campus data a second time.
  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (!apiKey || !containerRef.current) return;
    let active = true;
    let map;
    let observer;
    const markers = new Map();
    const listeners = new AbortController();
    markersRef.current = markers;

    async function loadPlaces() {
      try {
        const { data, error } = await supabase.from("buildings")
          .select("id, name, latitude, longitude").order("name");
        if (error) throw error;
        if (!active) return;
        const rows = (data ?? []).filter(isCampusPlace);

        for (const place of rows) {
          const id = String(place.id);
          const name = placeName(place);
          const content = document.createElement("div");
          content.style.cssText = "display:grid;gap:9px;padding:4px 14px 4px 2px;min-width:130px";
          const title = document.createElement("strong");
          title.textContent = name;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Get directions";
          button.setAttribute("aria-label", `Get directions to ${name}`);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            const navigate = navigateRef.current;
            if (active && typeof navigate === "function") navigate(place);
          }, { signal: listeners.signal });
          content.append(title, button);

          const popup = new Popup({ offset: 24, maxWidth: "245px" }).setDOMContent(content);
          popup.on("open", () => {
            if (!active) return;
            const previous = openPopupRef.current;
            if (previous && previous !== popup) previous.remove();
            openPopupRef.current = popup;
            button.disabled = typeof navigateRef.current !== "function";
            setSelectedPlaceId(id);
            // An on-map pin can be outside the current search results.
            setPlaceSearch((query) => matchesSearch(place, query) ? query : "");
          });
          popup.on("close", () => {
            if (openPopupRef.current === popup) openPopupRef.current = null;
          });
          const marker = new Marker({ color: "#0f766e", scale: 0.7 })
            .setLngLat(lngLat(place)).setPopup(popup).addTo(map);
          marker.getElement().setAttribute("aria-label", `View ${name}`);
          markers.set(id, marker);
        }
        setPlaces(rows);
        setPlacesMessage(rows.length
          ? `${rows.length} campus locations loaded. Select a pin to get directions.`
          : "No campus locations to display.");
      } catch (error) {
        if (active) setPlacesMessage(`Could not load locations: ${error.message}`);
      }
    }

    async function loadWalkways() {
      try {
        const { data, error } = await supabase.from("walkways").select("id, coordinates");
        if (error) throw error;
        if (!active) return;
        const rows = data ?? [];
        const features = walkwayFeatures(rows);
        const skipped = rows.length - features.length;
        map.addSource("campus-walkways", {
          type: "geojson", data: { type: "FeatureCollection", features },
        });
        const layout = { "line-cap": "round", "line-join": "round" };
        map.addLayer({
          id: pathLayerIds[0], type: "line", source: "campus-walkways", layout,
          paint: { "line-color": "#083344", "line-width": 8, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: pathLayerIds[1], type: "line", source: "campus-walkways", layout,
          paint: { "line-color": "#22d3ee", "line-width": 4 },
        });
        setWalkwaysReady(features.length > 0);
        setWalkwayMessage(`${features.length} saved walking ${features.length === 1 ? "path" : "paths"} loaded.` +
          (skipped ? ` Skipped ${skipped} with invalid coordinates.` : ""));
      } catch (error) {
        if (active) setWalkwayMessage(`Could not load walking paths: ${error.message}`);
      }
    }

    try {
      map = new MapLibreMap({
        container: containerRef.current, ...campusView, maxPitch: 75, maxZoom: 20,
        style: satelliteStyle(),
      });
      mapRef.current = map;
      map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new FullscreenControl(), "top-right");
      map.addControl(new GeolocateControl({
        positionOptions: { enableHighAccuracy: true }, trackUserLocation: false,
      }), "top-right");
      map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");
      map.once("load", () => {
        if (!active) return;
        setReady(true);
        void loadPlaces();
        void loadWalkways();
      });
      map.on("error", () => {
        if (active) setErrorMessage("Some map resources could not load. Check your connection and MapTiler key settings.");
      });
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(() => { if (active) map.resize(); });
        observer.observe(containerRef.current);
      }
    } catch {
      queueMicrotask(() => {
        if (active) setErrorMessage("Could not start the 3D map. Check browser graphics acceleration or open Campus Map.");
      });
    }
    return () => {
      active = false;
      listeners.abort();
      observer?.disconnect();
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      markersRef.current = null;
      openPopupRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !walkwaysReady) return;
    for (const id of pathLayerIds) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showWalkways ? "visible" : "none");
    }
  }, [showWalkways, walkwaysReady]);

  const matchingPlaces = places.filter((place) => matchesSearch(place, placeSearch));
  const selectedPlace = places.find((place) => String(place.id) === selectedPlaceId);

  function focusOnPlace(id) {
    setSelectedPlaceId(id);
    const marker = markersRef.current?.get(id);
    if (!marker) { openPopupRef.current?.remove(); return; }
    mapRef.current?.flyTo({ center: marker.getLngLat(), zoom: 18, pitch: 45, duration: 1200 });
    if (!marker.getPopup().isOpen()) marker.togglePopup();
  }

  function clearSelection(query = "") {
    openPopupRef.current?.remove();
    setSelectedPlaceId("");
    setPlaceSearch(query);
  }

  if (!apiKey) return (
    <section><h2>3D Campus</h2>
      <p role="alert">Add VITE_MAPTILER_KEY to your frontend environment file, then restart Vite.</p>
    </section>
  );

  return (
    <section>
      <h2>Explore the campus in 3D</h2>
      <p>Explore campus locations and saved walking paths over satellite imagery. Tilt shows the terrain; individual buildings are not 3D models.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
        <button type="button" disabled={!ready} onClick={() => { clearSelection(); mapRef.current?.flyTo(campusView); }}>Campus view</button>
        <button type="button" disabled={!ready} onClick={() => mapRef.current?.easeTo({ pitch: 0, bearing: 0, duration: 800 })}>Top view</button>
        <button type="button" disabled={!ready} onClick={() => mapRef.current?.easeTo({ pitch: 45, bearing: -20, duration: 800 })}>3D tilt</button>
        <button type="button" disabled={!ready} onClick={() => {
          const map = mapRef.current;
          if (map) map.easeTo({ bearing: map.getBearing() + 45, duration: 800 });
        }}>Rotate 45°</button>
      </div>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      <p role="status">{ready ? placesMessage : errorMessage ? "The map has not finished loading." : "Loading 3D map..."}</p>
      <div style={{ padding: 16, marginBottom: 16, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 12 }}>
        <label htmlFor="campus-3d-search">Find a campus location</label>
        <input id="campus-3d-search" type="search" placeholder="Search canteen, hostel, gate..."
          value={placeSearch} disabled={!ready || !places.length}
          onChange={(event) => clearSelection(event.target.value)} />
        <label htmlFor="campus-3d-place">Choose a location</label>
        <select id="campus-3d-place" value={selectedPlaceId}
          disabled={!ready || !matchingPlaces.length} onChange={(event) => focusOnPlace(event.target.value)}>
          <option value="">Select a location to view</option>
          {matchingPlaces.map((place) => <option key={place.id} value={String(place.id)}>{placeName(place)}</option>)}
        </select>
        <button type="button" disabled={!selectedPlace || typeof onNavigate !== "function"}
          onClick={() => { if (selectedPlace && typeof onNavigate === "function") onNavigate(selectedPlace); }}>
          Get directions
        </button>
        {ready && places.length > 0 && matchingPlaces.length === 0 &&
          <p role="status">No locations match your search. Try another name.</p>}
      </div>
      {ready && <p role="status">{walkwayMessage}</p>}
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <input type="checkbox" checked={showWalkways} disabled={!walkwaysReady}
          onChange={(event) => setShowWalkways(event.target.checked)}
          style={{ width: 18, height: 18, margin: 0, accentColor: "#0f766e" }} />
        Show walking paths
      </label>
      <div ref={containerRef} aria-label="Interactive 3D campus map" style={{
        height: "min(70vh, 700px)", minHeight: 400, width: "100%", borderRadius: 18,
        overflow: "hidden", border: "1px solid #cbd5e1",
      }} />
      <p>Drag to move. Scroll to zoom. Right-click and drag to rotate or tilt.</p>
    </section>
  );
}