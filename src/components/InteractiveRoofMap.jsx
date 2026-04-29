// Mapa Google interactivo con marcador arrastrable + círculo del área analizada.
// El cliente afina la posición sobre el techo y, al soltar el pin, se dispara
// onPinMove(lat, lon) para que el padre re-llame lookupRoof y refresque
// áreas/segmentos/confianza con las nuevas coordenadas.

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../services/gmapsLoader';

export default function InteractiveRoofMap({
  lat, lon, areaM2, onPinMove, height = 240, busy = false,
  segments = null,        // [{ azimuthDegrees, areaMeters2, center, boundingBox, ... }]
  showSunPath = true,     // arco azimutal del sol (oriente → cenit → poniente)
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const polygonsRef = useRef([]);  // Polígonos de cada segmento
  const labelsRef = useRef([]);    // Labels con área de cada segmento
  const sunPathRef = useRef(null); // Polyline del arco solar
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
  }, []); // eslint-disable-line

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

  // Polígonos por segmento — bounding box (rectángulo geográfico) coloreado +
  // label central con el área. Permite al cliente ver dónde está cada zona.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    // Limpiar overlays previos
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];
    labelsRef.current.forEach(l => l.setMap(null));
    labelsRef.current = [];
    if (!Array.isArray(segments) || segments.length === 0) return;
    // Verde brand para activos (los que el sistema usa) y gris muted para los
    // disponibles pero no usados. Border style varía: solid vs dashed.
    const ACTIVE = '#4ade80';
    const AVAILABLE = '#7A9EAA';
    segments.forEach((s, i) => {
      const bb = s.boundingBox;
      if (!bb || !bb.sw || !bb.ne) return;
      const isActive = !!s.selected;
      const col = isActive ? ACTIVE : AVAILABLE;
      const path = [
        { lat: bb.sw.lat, lng: bb.sw.lng },
        { lat: bb.ne.lat, lng: bb.sw.lng },
        { lat: bb.ne.lat, lng: bb.ne.lng },
        { lat: bb.sw.lat, lng: bb.ne.lng },
      ];
      const poly = new maps.Polygon({
        map: mapRef.current,
        paths: path,
        strokeColor: col,
        strokeOpacity: isActive ? 0.98 : 0.55,
        strokeWeight: isActive ? 2.5 : 1.5,
        fillColor: col,
        fillOpacity: isActive ? 0.22 : 0.06,
        clickable: false,
        zIndex: isActive ? 6 : 5,
      });
      polygonsRef.current.push(poly);
      // Label con el área (y prefijo ✓ si está activo).
      const labelPos = s.center && s.center.lat && s.center.lng
        ? { lat: s.center.lat, lng: s.center.lng }
        : { lat: (bb.sw.lat + bb.ne.lat) / 2, lng: (bb.sw.lng + bb.ne.lng) / 2 };
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        background: ${col}; color: #fff; padding: 2px 7px; border-radius: 11px;
        font-size: 10px; font-weight: 800; box-shadow: 0 2px 6px rgba(0,0,0,0.5);
        white-space: nowrap; transform: translate(-50%, -50%); pointer-events: none;
        opacity: ${isActive ? '1' : '0.7'};
      `;
      labelEl.textContent = `${isActive ? '✓ ' : ''}${i + 1} · ${(s.areaMeters2 || 0).toFixed(0)} m²`;
      const label = new maps.OverlayView();
      label.onAdd = function () { this.getPanes().overlayLayer.appendChild(labelEl); };
      label.draw = function () {
        const proj = this.getProjection();
        if (!proj) return;
        const pt = proj.fromLatLngToDivPixel(new maps.LatLng(labelPos.lat, labelPos.lng));
        if (pt) { labelEl.style.position = 'absolute'; labelEl.style.left = pt.x + 'px'; labelEl.style.top = pt.y + 'px'; }
      };
      label.onRemove = function () { if (labelEl.parentNode) labelEl.parentNode.removeChild(labelEl); };
      label.setMap(mapRef.current);
      labelsRef.current.push(label);
    });
  }, [segments, ready]);

  // Trayectoria del sol — arco azimutal de oriente (E) a poniente (O) pasando
  // por el cenit/sur al mediodía. Para Colombia (lat ~4°), el sol está casi
  // sobre la cabeza al mediodía, así que dibujamos una proyección simple sobre
  // el plano del techo: 7 puntos (6am, 8am, 10am, 12m, 14h, 16h, 18h).
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    if (sunPathRef.current) { sunPathRef.current.setMap(null); sunPathRef.current = null; }
    if (!showSunPath || lat == null || lon == null) return;
    // Distancia del arco proporcional al área para mantener coherencia visual.
    const r = areaM2 ? Math.sqrt(Number(areaM2) / Math.PI) * 1.3 : 12;
    // ~111km/grado lat; lng se contrae con cos(lat)
    const dLat = r / 111000;
    const dLng = r / (111000 * Math.cos(Number(lat) * Math.PI / 180));
    // Azimuts del sol (Colombia): aproximación. 6am ~90° (E), 12m ~180° (S),
    // 6pm ~270° (W). Usamos arco semi-circular E → S → W proyectado en el plano.
    // En Colombia (lat ~4°N) la cúspide está casi al cenit; mostramos arco E-O
    // pasando por el centro con leve desplazamiento hacia el norte para evidenciar
    // el paso "ligeramente al sur" del sol durante junio (en abril es indistinto).
    const points = [];
    for (let h = -90; h <= 90; h += 15) {  // ángulo del arco
      const rad = h * Math.PI / 180;
      // x ∝ sin(rad) (E→W), y ∝ -cos(rad) × pequeño desplazamiento (centro)
      const x = Math.sin(rad);
      const y = -Math.cos(rad) * 0.15; // arco bajo, casi recto E-W
      points.push({
        lat: Number(lat) + y * dLat,
        lng: Number(lon) + x * dLng,
      });
    }
    sunPathRef.current = new maps.Polyline({
      map: mapRef.current,
      path: points,
      geodesic: false,
      strokeColor: '#FFD93D', strokeOpacity: 0.85, strokeWeight: 2.5,
      icons: [
        { icon: { path: 'M 0,-2 L 2,0 L 0,2 L -2,0 z', scale: 2.5, fillColor: '#FFD93D', fillOpacity: 1, strokeColor: '#FFD93D' }, offset: '0%' },
        { icon: { path: 'M 0,-2 L 2,0 L 0,2 L -2,0 z', scale: 2.5, fillColor: '#FF8C00', fillOpacity: 1, strokeColor: '#FF8C00' }, offset: '50%' },
        { icon: { path: 'M 0,-2 L 2,0 L 0,2 L -2,0 z', scale: 2.5, fillColor: '#FFD93D', fillOpacity: 1, strokeColor: '#FFD93D' }, offset: '100%' },
      ],
      clickable: false,
      zIndex: 4,
    });
  }, [showSunPath, lat, lon, areaM2, ready]);

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
