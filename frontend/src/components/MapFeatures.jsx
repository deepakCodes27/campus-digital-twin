import { useEffect, useRef, useState } from "react";
import {
  Circle,
  CircleMarker,
  LayersControl,
  Popup,
  ScaleControl,
  TileLayer,
  useMap,
} from "react-leaflet";
import { DomEvent } from "leaflet";

const maptilerKey = (
  import.meta.env.VITE_MAPTILER_KEY ?? ""
).trim();

export function BaseLayers() {
  const [tileError, setTileError] = useState(false);

  return (
    <>
      <LayersControl position="topright">
        <LayersControl.BaseLayer
          checked={!maptilerKey}
          name="Street map"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
        </LayersControl.BaseLayer>

        {maptilerKey && (
          <LayersControl.BaseLayer checked name="Satellite">
            <TileLayer
              url={`https://api.maptiler.com/maps/satellite-v4/{z}/{x}/{y}.jpg?key=${encodeURIComponent(maptilerKey)}`}
              tileSize={512}
              zoomOffset={-1}
              minZoom={1}
              maxZoom={20}
              attribution='&copy; <a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">MapTiler</a>'
              eventHandlers={{
                tileerror: () => setTileError(true),
                tileload: () => setTileError(false),
              }}
            />
          </LayersControl.BaseLayer>
        )}
      </LayersControl>

      <ScaleControl position="bottomleft" imperial={false} />

      {(!maptilerKey || tileError) && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: "12px",
            left: "60px",
            right: "90px",
            zIndex: 1000,
            padding: "10px 14px",
            borderRadius: "10px",
            background: "#fff",
            color: "#92400e",
            boxShadow: "0 2px 12px #0002",
            fontSize: "13px",
            pointerEvents: "none",
          }}
        >
          {!maptilerKey
            ? "Satellite key missing. Check VITE_MAPTILER_KEY and restart Vite."
            : "Some satellite tiles could not load. Switch to Street map and check your MapTiler key, allowed origins, usage limit or internet connection."}
        </div>
      )}
    </>
  );
}

export function MapTools({
  positions = [],
  routeCoordinates = [],
}) {
  const map = useMap();
  const ref = useRef(null);

  const [notice, setNotice] = useState("");
  const [locating, setLocating] = useState(false);
  const [location, setLocation] = useState(null);

  const routeKey = JSON.stringify(routeCoordinates ?? []);

  useEffect(() => {
    const points = JSON.parse(routeKey);

    if (points.length > 1) {
      map.fitBounds(points, {
        padding: [50, 50],
        maxZoom: 18,
      });
    }
  }, [routeKey, map]);

  useEffect(() => {
    const element = ref.current;

    if (element) {
      DomEvent.disableClickPropagation(element);
      DomEvent.disableScrollPropagation(element);
    }

    function handleLocationFound(event) {
      setLocation({
        position: [event.latlng.lat, event.latlng.lng],
        accuracy: event.accuracy,
      });

      setNotice(
        `Your location · accuracy about ${Math.round(event.accuracy)} m`
      );
      setLocating(false);
      map.flyTo(event.latlng, 17);
    }

    function handleLocationError() {
      setNotice(
        "Location unavailable. Allow location access or select a campus starting point."
      );
      setLocating(false);
    }

    map.on("locationfound", handleLocationFound);
    map.on("locationerror", handleLocationError);

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(map.getContainer());

    return () => {
      observer.disconnect();
      map.off("locationfound", handleLocationFound);
      map.off("locationerror", handleLocationError);
      map.stopLocate();
    };
  }, [map]);

  function showCampus() {
    if (positions.length > 0) {
      map.fitBounds(positions, {
        padding: [35, 35],
        maxZoom: 18,
      });
    }
  }

  function findMyLocation() {
    setLocating(true);
    setNotice("Requesting your location…");

    map.locate({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
  }

  return (
    <>
      <div className="map-tools" ref={ref}>
        <button type="button" onClick={showCampus}>
          ⌖ Campus view
        </button>

        <button
          type="button"
          disabled={locating}
          onClick={findMyLocation}
        >
          {locating ? "Locating…" : "◎ My location"}
        </button>

        {notice && <p role="status">{notice}</p>}
      </div>

      {location && (
        <>
          <Circle
            center={location.position}
            radius={location.accuracy}
            pathOptions={{
              color: "#2563eb",
              weight: 1,
              fillOpacity: 0.08,
            }}
          />

          <CircleMarker
            center={location.position}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#2563eb",
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Popup>
              Your approximate location. Select a campus starting
              point for routing.
            </Popup>
          </CircleMarker>
        </>
      )}
    </>
  );
}