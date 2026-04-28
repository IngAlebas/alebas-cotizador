// Mapa Google interactivo con marcador arrastrable + círculo del área analizada.
// El cliente afina la posición sobre el techo y, al soltar el pin, se dispara
// onPinMove(lat, lon) para que el padre re-llame lookupRoof y refresque
// áreas/segmentos/confianza con las nuevas coordenadas.

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../services/gmapsLoader';

export default function InteractiveRoofMap({
  lat, lon, areaM2, onPinMove, height = 240, busy = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const lastEmittedRef = useRef({ lat, lon });
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);
  const [moved, setMoved] = useState(false);

  // Init mapa una sola vez. lat/lon iniciales se capturan en este efecto;
  // las actualizaciones posteriores se aplican en el efecto de sync de abajo.
  useEffect(() => {
    let cancelled = false;
    if (lat == null || lon == null) return;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const center = { lat: Number(lat), lng: Number(lon) };
        const map = new maps.Map(containerRef.current, {
          center, zoom: 20, mapTypeId: 'satellite', tilt: 0,
          disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy',
          clickableIcons: false,
        });
        const marker = new maps.Marker({
          map, position: center, draggable: true,
          title: 'Arrastra para ajustar la ubicación exacta del techo',
          animation: maps.Animation.DROP,
        });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          if (!p) return;
          const newLat = p.lat(), newLon = p.lng();
          map.panTo({ lat: newLat, lng: newLon });
          setMoved(true);
          lastEmittedRef.current = { lat: newLat, lon: newLon };
          onPinMove && onPinMove(newLat, newLon);
        });
        // Click en el mapa también recoloca el pin (más rápido que arrastrar).
        map.addListener('click', (e) => {
          if (!e?.latLng) return;
          const newLat = e.latLng.lat(), newLon = e.latLng.lng();
          marker.setPosition({ lat: newLat, lng: newLon });
          map.panTo({ lat: newLat, lng: newLon });
          setMoved(true);
          lastEmittedRef.current = { lat: newLat, lon: newLon };
          onPinMove && onPinMove(newLat, newLon);
        });
        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      })
      .catch((e) => setError(e?.message || 'No se pudo cargar el mapa'));
    return () => {
      cancelled = true;
      try { circleRef.current && circleRef.current.setMap(null); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync externo: si el padre cambia lat/lon (ej. tras re-lookup, GPS, autocomplete),
  // mover marcador y recentrar. Evita reposicionar si la coord es la que acabamos
  // de emitir nosotros mismos (loop de feedback).
  useEffect(() => {
    if (!ready || !mapRef.current || !markerRef.current) return;
    if (lat == null || lon == null) return;
    const last = lastEmittedRef.current;
    const epsilon = 1e-7;
    if (last && Math.abs(last.lat - lat) < epsilon && Math.abs(last.lon - lon) < epsilon) return;
    const pos = { lat: Number(lat), lng: Number(lon) };
    markerRef.current.setPosition(pos);
    mapRef.current.panTo(pos);
    setMoved(false);
  }, [lat, lon, ready]);

  // Círculo proporcional al área (sqrt(area/π)) — feedback visual de cobertura.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (!areaM2 || !lat || !lon) return;
    const r = Math.sqrt(Number(areaM2) / Math.PI);
    if (!Number.isFinite(r) || r <= 0) return;
    circleRef.current = new maps.Circle({
      map: mapRef.current,
      center: { lat: Number(lat), lng: Number(lon) },
      radius: r,
      strokeColor: '#FF8C00', strokeOpacity: 0.95, strokeWeight: 2,
      fillColor: '#FF8C00', fillOpacity: 0.18,
      clickable: false,
    });
  }, [areaM2, lat, lon, ready]);

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: '#ff8a80', background: '#2a0d0d', borderRadius: 6 }}>
        ⚠ {error}. Verifica que <code>REACT_APP_GOOGLE_API_KEY</code> esté disponible en el frontend con "Maps JavaScript API" habilitada.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height, background: '#000' }} />
      {!ready && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(7,9,15,0.6)', color: '#7A9EAA', fontSize: 11 }}>
          Cargando mapa…
        </div>
      )}
      {ready && busy && (
        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(7,9,15,0.85)', color: '#FFB800', fontSize: 10, padding: '4px 10px', borderRadius: 14, fontWeight: 600 }}>
          ⟳ Recalculando…
        </div>
      )}
      {ready && (
        <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, background: 'rgba(7,9,15,0.85)', color: moved ? '#4ade80' : '#E8F0F7', fontSize: 10, padding: '5px 10px', borderRadius: 6, lineHeight: 1.35 }}>
          {moved ? '✓ Ubicación ajustada — el cálculo se actualizó' : '✋ Arrastra el pin (o haz click) para afinar la ubicación exacta sobre el techo'}
        </div>
      )}
    </div>
  );
}
