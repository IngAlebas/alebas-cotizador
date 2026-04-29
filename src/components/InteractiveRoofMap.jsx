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
          center,
          zoom: 19,  // 19 da más contexto que 20 — todavía se ve el techo claro
          minZoom: 16,
          maxZoom: 22,
          mapTypeId: 'satellite',
          tilt: 0,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',  // un dedo arrastra (no requiere 2 dedos)
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
    // Auto-fit a los polígonos para que se vean TODOS los segmentos detectados
    // con padding cómodo. Solo si hay >=1 polígono con bounding box válido.
    const validBboxes = segments.filter(s => s.boundingBox && s.boundingBox.sw && s.boundingBox.ne);
    if (validBboxes.length > 0) {
      const bounds = new maps.LatLngBounds();
      validBboxes.forEach(s => {
        bounds.extend({ lat: s.boundingBox.sw.lat, lng: s.boundingBox.sw.lng });
        bounds.extend({ lat: s.boundingBox.ne.lat, lng: s.boundingBox.ne.lng });
      });
      // Padding 50px da espacio para los labels flotantes en bordes.
      mapRef.current.fitBounds(bounds, 50);
      // Limitar zoom max después del fitBounds — no acercarse demasiado si el
      // techo es muy pequeño (sin esto Google va a zoom 22 y se ve borroso).
      const listener = maps.event.addListenerOnce(mapRef.current, 'idle', () => {
        if (mapRef.current.getZoom() > 20) mapRef.current.setZoom(20);
      });
      // Cleanup si re-renderiza antes del idle
      return () => maps.event.removeListener(listener);
    }
  }, [segments, ready]);

  // NOTA: la ruta del sol fue movida a un diagrama dedicado bajo el mapa
  // (componente SunPathDiagram) — antes se dibujaba como Polyline sobre el techo
  // pero se solapaba con los polígonos y era ilegible. Mejor en su propio espacio.

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
