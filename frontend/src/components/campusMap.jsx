import { useEffect, useState } from 'react';
import { MapContainer, CircleMarker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import { supabase } from '../services/supabaseClient';
import { BaseLayers, MapTools } from './MapFeatures';
import 'leaflet/dist/leaflet.css';

function FocusPlace({ place }) {
  const map = useMap();
  useEffect(() => { if (place) map.flyTo([place.latitude, place.longitude], 18, { duration: .7 }); }, [place, map]);
  return null;
}

export default function CampusMap({ onNavigate }) {
  const [places, setPlaces] = useState([]);
  const [walkways, setWalkways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pathError, setPathError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [labels, setLabels] = useState(false);
  const [showPaths, setShowPaths] = useState(true);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [buildings, paths] = await Promise.all([
          supabase.from('buildings').select('id, name, description, latitude, longitude').order('name'),
          supabase.from('walkways').select('id, coordinates'),
        ]);
        if (buildings.error) throw buildings.error;
        if (!active) return;
        setPlaces((buildings.data ?? []).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 && !p.name.toLowerCase().startsWith('demo ')));
        if (paths.error) setPathError('Saved paths could not be loaded. Locations are still available.');
        else setWalkways((paths.data ?? []).filter(p => Array.isArray(p.coordinates) && p.coordinates.length > 1 && p.coordinates.every(c => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180)));
      } catch (e) { if (active) setError(e.message); }
      finally { if (active) setLoading(false); }
    }
    load(); return () => { active = false; };
  }, []);
  useEffect(() => {
    const escape = e => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const matches = places.filter(p => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  if (loading) return <div className="empty-state"><span className="eyebrow">CAMPUS EXPLORER</span><h2>Finding your campus…</h2><p>Loading locations and walking paths.</p></div>;
  if (error) return <div className="empty-state" role="alert"><h2>We couldn’t load the map</h2><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div>;
  if (!places.length) return <div className="empty-state"><h2>Your campus starts here</h2><p>No mapped locations yet. An administrator can add them in Navigation.</p></div>;
  return <section className={`explorer ${expanded ? 'explorer-expanded' : ''}`}>
    <div className="section-heading"><div><span className="eyebrow">DISCOVER YOUR CAMPUS</span><h2>A place for every possibility.</h2><p>Explore Career Point University, one destination at a time.</p></div><span className="count-pill">{places.length} places mapped</span></div>
    <div className="explorer-toolbar"><div className="map-toggles"><label><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} /> Place labels</label><label><input type="checkbox" checked={showPaths} onChange={e => setShowPaths(e.target.checked)} /> Walking paths</label></div><button className="secondary" onClick={() => setExpanded(!expanded)}>{expanded ? 'Close expanded view' : 'Expand map ↗'}</button></div>
    {pathError && <p role="alert">{pathError}</p>}
    <div className="explorer-grid">
      <aside className="place-panel"><label htmlFor="building-search">Where would you like to go?</label><input id="building-search" type="search" placeholder="Search buildings, gates, facilities…" value={search} onChange={e => setSearch(e.target.value)} /><p className="result-count" role="status">{matches.length} places to explore</p><div className="place-list">{matches.map((p, i) => <button className={`place-choice ${selected?.id === p.id ? 'selected' : ''}`} key={p.id} aria-pressed={selected?.id === p.id} onClick={() => setSelected({ ...p })}><span className="place-number">{String(i + 1).padStart(2, '0')}</span><span><strong>{p.name}</strong><small>{p.description || 'Campus location'}</small></span><span aria-hidden="true">↗</span></button>)}{!matches.length && <p>No matching places. Try another name.</p>}</div></aside>
      <div className="map-stage"><MapContainer bounds={places.map(p => [p.latitude, p.longitude])} boundsOptions={{ padding: [35, 35], maxZoom: 18 }} scrollWheelZoom={false} className="explorer-map"><BaseLayers /><MapTools positions={places.map(p => [p.latitude, p.longitude])} /><FocusPlace place={selected} />
        {showPaths && walkways.map(p => <Polyline key={p.id} positions={p.coordinates} pathOptions={{ color: '#0d9488', weight: 4, opacity: .65, dashArray: '5 7' }} interactive={false} />)}
        {matches.map(p => <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={selected?.id === p.id ? 12 : 8} pathOptions={{ color: '#fff', weight: 3, fillColor: selected?.id === p.id ? '#f97316' : '#0f766e', fillOpacity: 1 }} eventHandlers={{ click: () => setSelected(p) }}><Tooltip permanent={labels} direction="top" offset={[0, -8]}>{p.name}</Tooltip><Popup><span className="eyebrow">CAMPUS DESTINATION</span><h3>{p.name}</h3><p>{p.description || 'Explore this location on campus.'}</p>{onNavigate && <button onClick={() => onNavigate(p)}>Get walking directions →</button>}</Popup></CircleMarker>)}
      </MapContainer><div className="map-legend"><span><i className="legend-dot" /> Campus place</span><span><i className="legend-path" /> Saved walkway</span><span>Scroll with two fingers to move the page · use + / − to zoom</span></div></div>
    </div>
    {selected && <div className="destination-card"><div><span className="eyebrow">YOUR SELECTED DESTINATION</span><h3>{selected.name}</h3><p>{selected.description || 'Find a walking route to this campus location.'}</p></div>{onNavigate && <button onClick={() => onNavigate(selected)}>Get directions →</button>}</div>}
  </section>;
}
