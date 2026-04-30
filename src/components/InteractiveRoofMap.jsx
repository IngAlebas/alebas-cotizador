// Mapa Google interactivo con marcador arrastrable + círculo del área analizada.
// El cliente afina la posición sobre el techo y, al soltar el pin, se dispara
// onPinMove(lat, lon) para que el padre re-llame lookupRoof y refresque
// áreas/segmentos/confianza con las nuevas coordenadas.

import React, { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../services/gmapsLoader';

export default function InteractiveRoofMap({
  lat, lon, areaM2, onPinMove, height = 240, busy = false,
  segments = null,        // [{ azimuthDegrees, areaMeters2, center, boundingBox, _idx, ... }]
  showSunPath = true,     // arco azimutal del sol (oriente → cenit → poniente)
  onSegmentToggle = null, // (idx) => void — tap en círculo o label toggle inclusión
  onSegmentMove = null,   // (idx, {lat, lng}) => void — drag de cubiertas custom
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

  // Marcadores por segmento — círculo centrado proporcional al área + label.
  // Antes usábamos polygons del bounding box pero el bbox es eje-alineado y
  // raramente coincide con la forma real del segmento (techos suelen estar
  // rotados). Los círculos son más HONESTOS: solo indican posición + tamaño
  // relativo, sin sugerir una forma incorrecta.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    polygonsRef.current.forEach(p => p.setMap(null));
    polygonsRef.current = [];
    labelsRef.current.forEach(l => l.setMap(null));
    labelsRef.current = [];
    if (!Array.isArray(segments) || segments.length === 0) return;
    const ACTIVE = '#4ade80';     // verde lima — cubierta activa (se usará)
    const AVAILABLE = '#FB923C';  // naranja — cubierta detectada pero no activa
    segments.forEach((s, i) => {
      try {
      // Defensive: validar coords numéricas antes de usar. Aceptar AMBOS
      // formatos: {lat, lng} (workflow n8n actualizado) y {latitude,
      // longitude} (formato Google Solar API original — si n8n no fue
      // re-importado tras la migración).
      const pickCoords = (obj) => {
        if (!obj) return null;
        const lat = obj.lat ?? obj.latitude;
        const lng = obj.lng ?? obj.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        return null;
      };
      let center = pickCoords(s.center);
      if (!center && s.boundingBox) {
        const sw = pickCoords(s.boundingBox.sw);
        const ne = pickCoords(s.boundingBox.ne);
        if (sw && ne) center = { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 };
      }
      // FALLBACK FINAL: si el segmento NO trae coords (n8n viejo, datos
      // truncados, etc), generar un center cerca del pin principal con
      // offset distribuido en círculo según índice. Mejor mostrar algo
      // (aunque sea aproximado) que dejar el mapa vacío.
      if (!center && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
        const baseR = 8;  // metros desde el pin
        const angle = (i / Math.max(1, segments.length)) * 2 * Math.PI;
        const offM = baseR + (i % 3) * 4;
        const dLatF = (Math.cos(angle) * offM) / 111000;
        const dLngF = (Math.sin(angle) * offM) / (111000 * Math.cos(Number(lat) * Math.PI / 180));
        center = { lat: Number(lat) + dLatF, lng: Number(lon) + dLngF };
      }
      if (!center) return;
      const isActive = !!s.selected;
      const col = isActive ? ACTIVE : AVAILABLE;
      const areaM2 = s.areaMeters2 || 0;
      const isClickable = !!onSegmentToggle && s._idx != null;
      // Solo las cubiertas CUSTOM (_custom: true) son arrastrables. Las
      // detectadas por Google Solar tienen posición fija.
      const isDraggable = !!onSegmentMove && s._custom && s._idx != null;
      const azDegSeg = s.azimuthDegrees != null ? Number(s.azimuthDegrees) : 180;
      const azRadSeg = (azDegSeg * Math.PI) / 180;
      const cosA = Math.cos(azRadSeg), sinA = Math.sin(azRadSeg);
      const latM = 1 / 111000;
      const lngM = 1 / (111000 * Math.cos(center.lat * Math.PI / 180));
      // POLÍGONO QUE GOOGLE DETECTÓ
      // Si Google dio boundingBox real → uso esos 4 corners (axis-aligned
      // pero EXACTOS — la extensión real que Google identificó como techo).
      // Si solo hay center + areaMeters2 (custom o sin bbox) → fallback a
      // un rectángulo rotado por azimut con dimensiones desde sqrt(area).
      let corners;
      let widthM, heightM;
      // Bbox: aceptar ambos formatos (lat/lng y latitude/longitude).
      const bbSw = pickCoords(s.boundingBox?.sw);
      const bbNe = pickCoords(s.boundingBox?.ne);
      const bbValid = bbSw && bbNe;
      if (bbValid && !s._custom) {
        corners = [
          { lat: bbSw.lat, lng: bbSw.lng },
          { lat: bbSw.lat, lng: bbNe.lng },
          { lat: bbNe.lat, lng: bbNe.lng },
          { lat: bbNe.lat, lng: bbSw.lng },
        ];
        const baseSide = Math.sqrt(Math.max(4, areaM2));
        widthM = baseSide;
        heightM = baseSide;
      } else {
        // Fallback: rectángulo rotado por azimut.
        const baseSide = Math.sqrt(Math.max(4, areaM2));
        widthM = baseSide * 1.18;
        heightM = baseSide * 0.85;
        corners = [
          [-widthM / 2, -heightM / 2],
          [ widthM / 2, -heightM / 2],
          [ widthM / 2,  heightM / 2],
          [-widthM / 2,  heightM / 2],
        ].map(([lx, ly]) => {
          const dx = lx * cosA - ly * sinA;
          const dy = lx * sinA + ly * cosA;
          return {
            lat: center.lat + dy * latM,
            lng: center.lng + dx * lngM,
          };
        });
      }
      const polygon = new maps.Polygon({
        map: mapRef.current,
        paths: corners,
        // Halo BLANCO para todos (activos e inactivos) — máximo contraste
        // sobre satellite. Antes solo activos tenían halo. Ahora todos
        // los polígonos son claramente distinguibles, pero los activos
        // se diferencian por color verde + outline interno + fill más denso.
        strokeColor: '#ffffff',
        strokeOpacity: isActive ? 1 : 0.85,
        strokeWeight: isActive ? 3 : 2,
        fillColor: col,
        fillOpacity: isActive ? 0.45 : 0.25,
        clickable: isClickable || isDraggable,
        draggable: isDraggable,
        zIndex: isActive ? 6 : 5,
      });
      if (isClickable) polygon.addListener('click', () => onSegmentToggle(s._idx));
      if (isDraggable) {
        // Al terminar el drag, calcular el nuevo centroide del polígono
        // y emitirlo al padre para que actualice f.customSegments.center.
        polygon.addListener('dragend', () => {
          const path = polygon.getPath();
          let sumLat = 0, sumLng = 0;
          path.forEach(pt => { sumLat += pt.lat(); sumLng += pt.lng(); });
          const n = path.getLength();
          if (n > 0) onSegmentMove(s._idx, { lat: sumLat / n, lng: sumLng / n });
        });
      }
      polygonsRef.current.push(polygon);
      // Borde interno en color del segmento (verde para activo, naranja
      // para inactivo) sobre el halo blanco — DOBLE BORDE estilo
      // 'highlighter' que distingue cubiertas en cualquier satellite.
      const innerOutline = new maps.Polygon({
        map: mapRef.current,
        paths: corners,
        strokeColor: col,
        strokeOpacity: isActive ? 0.95 : 0.85,
        strokeWeight: isActive ? 1.5 : 1.2,
        fillOpacity: 0,
        clickable: false,
        zIndex: isActive ? 7 : 6,
      });
      polygonsRef.current.push(innerOutline);
      if (isActive) {
        // FLECHA DE ORIENTACIÓN AL SOL sobre la cubierta — desde el lomo
        // (lado norte del techo) hacia el azimut (down-slope, donde el
        // techo "mira"). Visualiza dónde caen los rayos del sol en este
        // techo específico. Color naranja distinto al del polígono para
        // que destaque sin confundirse con el borde verde.
        // Inicio de la flecha: punto a -heightM/2 en el sistema local
        //   (en sentido contrario al azimut), traducido al mapa.
        // Fin de la flecha: punto a +heightM/2 en el sistema local.
        const arrowStartLocal = [0, -heightM * 0.45];
        const arrowEndLocal = [0, heightM * 0.45];
        const toLatLng = ([lx, ly]) => {
          const dx = lx * cosA - ly * sinA;
          const dy = lx * sinA + ly * cosA;
          return { lat: center.lat + dy * latM, lng: center.lng + dx * lngM };
        };
        const sunArrow = new maps.Polyline({
          map: mapRef.current,
          path: [toLatLng(arrowStartLocal), toLatLng(arrowEndLocal)],
          geodesic: false,
          strokeColor: '#FFD93D',
          strokeOpacity: 0.95,
          strokeWeight: 2.5,
          clickable: false,
          zIndex: 8,
          icons: [{
            icon: {
              path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 3.5,
              fillColor: '#FF8C00',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 1.2,
            },
            offset: '100%',
          }],
        });
        polygonsRef.current.push(sunArrow);
      }
      // Label flotante clickable con número + área.
      const labelEl = document.createElement('div');
      labelEl.style.cssText = `
        background: rgba(7, 9, 15, 0.78); color: ${col}; padding: 2px 8px; border-radius: 12px;
        font-size: 10.5px; font-weight: 800; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        white-space: nowrap; transform: translate(-50%, -50%);
        pointer-events: ${isClickable ? 'auto' : 'none'};
        cursor: ${isClickable ? 'pointer' : 'default'};
        user-select: none;
        opacity: ${isActive ? '0.95' : '0.65'};
        border: 1px solid ${col};
        transition: transform 0.12s, opacity 0.12s;
      `;
      // Prefijo 'M' (manual) en cubiertas custom para distinguirlas + ícono
      // ✥ que sugiere arrastrabilidad.
      const prefix = s._custom ? 'M' : (i + 1);
      const dragIcon = isDraggable ? ' ✥' : '';
      labelEl.textContent = `${isActive ? '✓ ' : '○ '}${prefix} · ${areaM2.toFixed(0)} m²${dragIcon}`;
      if (isClickable) {
        const onTap = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); onSegmentToggle(s._idx); };
        labelEl.addEventListener('click', onTap);
        labelEl.addEventListener('touchend', onTap);
        labelEl.addEventListener('mouseenter', () => { labelEl.style.transform = 'translate(-50%, -50%) scale(1.1)'; });
        labelEl.addEventListener('mouseleave', () => { labelEl.style.transform = 'translate(-50%, -50%) scale(1)'; });
      }
      const label = new maps.OverlayView();
      label.onAdd = function () { this.getPanes().overlayLayer.appendChild(labelEl); };
      // Offset del label hacia AFUERA del techo (en dirección del azimut,
      // o sea down-slope) — es donde típicamente hay espacio libre entre
      // techos contiguos. Sign alterna para que cubiertas adyacentes no
      // queden encima si están alineadas.
      const perpDeg = (azDegSeg + 90) % 360;  // lateral al lomo
      const offsetM = baseSide * 0.85 + 3;    // fuera del polígono
      const useAxis = i % 2 === 0 ? 'down-slope' : 'lateral';
      const azChoice = useAxis === 'down-slope' ? azDegSeg : perpDeg;
      const dirRad = (azChoice * Math.PI) / 180;
      const sign = (i % 4) < 2 ? 1 : -1;
      const dLat = (Math.cos(dirRad) * offsetM * sign) / 111000;
      const dLng = (Math.sin(dirRad) * offsetM * sign) / (111000 * Math.cos(center.lat * Math.PI / 180));
      const labelCenter = { lat: center.lat + dLat, lng: center.lng + dLng };
      // LÍNEA GUÍA: del centro del polígono al label, así el cliente sabe
      // QUÉ label corresponde a QUÉ cubierta sin ambigüedad. Línea delgada
      // del color del segmento, semi-transparente.
      const leader = new maps.Polyline({
        map: mapRef.current,
        path: [center, labelCenter],
        geodesic: false,
        strokeColor: col,
        strokeOpacity: isActive ? 0.7 : 0.35,
        strokeWeight: 1,
        clickable: false,
        zIndex: isActive ? 4 : 3,
      });
      polygonsRef.current.push(leader);
      label.draw = function () {
        const proj = this.getProjection();
        if (!proj) return;
        const pt = proj.fromLatLngToDivPixel(new maps.LatLng(labelCenter.lat, labelCenter.lng));
        if (pt) { labelEl.style.position = 'absolute'; labelEl.style.left = pt.x + 'px'; labelEl.style.top = pt.y + 'px'; }
      };
      label.onRemove = function () { if (labelEl.parentNode) labelEl.parentNode.removeChild(labelEl); };
      label.setMap(mapRef.current);
      labelsRef.current.push(label);
      } catch (e) {
        // Si un segmento malformado tira (coord NaN, bbox null, etc),
        // saltar SOLO ese segmento sin romper el render del resto del
        // mapa ni del step 3 entero.
        console.warn('Segmento ' + i + ' no se pudo renderizar:', e?.message);
      }
    });
    // Auto-fit a los círculos.
    // validCenters acepta ambos formatos (lat/lng y latitude/longitude).
    const validCenters = segments.map(s => {
      const c = s.center || {};
      const lat = c.lat ?? c.latitude;
      const lng = c.lng ?? c.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { center: { lat, lng } };
      return null;
    }).filter(Boolean);
    if (validCenters.length > 0) {
      // Centro = promedio de coords (centroid). Más confiable que fitBounds
      // para fijar zoom alto: fitBounds elige zoom según los bounds y el
      // listener 'idle' a veces no dispara o se descarta antes de fire.
      const avgLat = validCenters.reduce((a, s) => a + s.center.lat, 0) / validCenters.length;
      const avgLng = validCenters.reduce((a, s) => a + s.center.lng, 0) / validCenters.length;
      mapRef.current.setCenter({ lat: avgLat, lng: avgLng });
      // Zoom 22 = MÁXIMO de Google Maps. Antes era 21 'reservando' un nivel
      // para zoom manual, pero el cliente reporta que no puede acercar más.
      // Arrancando en 22 garantizamos el max possible inmediatamente. Si
      // no hay imagery a ese nivel, Google fallback a 21 automáticamente.
      mapRef.current.setZoom(22);
    }
  }, [segments, ready]);

  // Ruta del sol DELGADA sobre el mapa — arco de E (oriente) → cenit → O
  // (poniente). Diseño minimal: línea amarilla 1.5px con sun emoji 🌞 en
  // ambos extremos para que se identifique como ruta solar sin dominar
  // visualmente. El diagrama detallado sigue debajo del mapa.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return;
    const maps = window.google.maps;
    if (sunPathRef.current) {
      try { sunPathRef.current.line && sunPathRef.current.line.setMap(null); } catch (_) {}
      try { sunPathRef.current.east && sunPathRef.current.east.setMap(null); } catch (_) {}
      try { sunPathRef.current.zenith && sunPathRef.current.zenith.setMap(null); } catch (_) {}
      try { sunPathRef.current.west && sunPathRef.current.west.setMap(null); } catch (_) {}
      sunPathRef.current = null;
    }
    if (!showSunPath || lat == null || lon == null) return;
    // RUTA DEL SOL: arco LARGO y bien arriba del techo (al NORTE = lat
    // POSITIVA). En el hemisferio norte (Colombia +4°N), el cliente ve
    // el cielo "arriba" en el mapa = norte = lat creciente. Por eso y
    // debe ser POSITIVO para subir en pantalla.
    const r = areaM2 ? Math.sqrt(Number(areaM2) / Math.PI) * 1.4 : 12;
    const dLat = r / 111000;
    const dLng = r / (111000 * Math.cos(Number(lat) * Math.PI / 180));
    const northOffset = 2.5;       // múltiplo de r — bien al norte (arriba en pantalla)
    const arcWidth = 2.2;          // ancho del arco — LARGO
    const arcHeight = 0.55;        // altura del arco — visible curvatura
    const points = [];
    // Iteramos h de -90 (este, amanecer) → +90 (oeste, atardecer). El
    // sol VIAJA de este a oeste, por eso negamos sin(rad): así el primer
    // punto está a la DERECHA (este = lng creciente) y el último a la
    // IZQUIERDA (oeste). La flecha intermedia apuntará hacia el oeste,
    // alineada con la dirección real del sol durante el día.
    for (let h = -90; h <= 90; h += 10) {
      const rad = h * Math.PI / 180;
      const x = -Math.sin(rad) * arcWidth;  // negativo: este→oeste = derecha→izquierda
      // y POSITIVO = norte (arriba en pantalla). cos(rad) máximo en h=0
      // (cenit, centro del arco) → ahí el arco está más arriba.
      const y = (Math.cos(rad) * arcHeight + northOffset);
      points.push({ lat: Number(lat) + y * dLat, lng: Number(lon) + x * dLng });
    }
    // Línea muy DELGADA con FLECHA prominente en el medio indicando
    // dirección del sol E→O. Sobre el satellite el amarillo destaca bien
    // pero la línea queda discreta para no robar foco a las cubiertas.
    const line = new maps.Polyline({
      map: mapRef.current,
      path: points,
      geodesic: false,
      strokeColor: '#FFD93D',
      strokeOpacity: 0.85,
      strokeWeight: 1,
      clickable: false,
      zIndex: 4,
      icons: [{
        icon: {
          path: maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 3,
          fillColor: '#FF8C00',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 1,
        },
        offset: '50%',
      }],
    });
    // Helper para overlays HTML.
    const makeOverlay = (pos, html, extraCss = '') => {
      const el = document.createElement('div');
      el.innerHTML = html;
      el.style.cssText = `
        line-height: 1; pointer-events: none;
        transform: translate(-50%, -50%); user-select: none;
        ${extraCss}
      `;
      const ov = new maps.OverlayView();
      ov.onAdd = function () { this.getPanes().overlayMouseTarget.appendChild(el); };
      ov.draw = function () {
        const proj = this.getProjection();
        if (!proj) return;
        const pt = proj.fromLatLngToDivPixel(new maps.LatLng(pos.lat, pos.lng));
        if (pt) { el.style.position = 'absolute'; el.style.left = pt.x + 'px'; el.style.top = pt.y + 'px'; }
      };
      ov.onRemove = function () { if (el.parentNode) el.parentNode.removeChild(el); };
      ov.setMap(mapRef.current);
      return ov;
    };
    // Logo SolarHub (sol + 6 rayos + 6 nodos) como icono al INICIO/FIN de la
    // ruta. Inicio = Este (sale el sol) = grande, opaco. Fin = Oeste (cae) =
    // pequeño, semi-transparente. Construido con la misma geometría del logo
    // de la navbar (App.jsx:150) — viewBox 40, sol radio 9, rayos en r=10..18.
    const solarHubLogo = (size, opacity = 1) => {
      const rays = [0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg - 90) * Math.PI / 180;
        const x1 = 20 + 10 * Math.cos(rad), y1 = 20 + 10 * Math.sin(rad);
        const x2 = 20 + 18 * Math.cos(rad), y2 = 20 + 18 * Math.sin(rad);
        const color = i % 2 === 0 ? '#FF8C00' : '#FFB800';
        return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;
      }).join('');
      const nodes = [0, 60, 120, 180, 240, 300].map((deg, i) => {
        const rad = (deg - 90) * Math.PI / 180;
        const x = 20 + 18.5 * Math.cos(rad), y = 20 + 18.5 * Math.sin(rad);
        const color = i % 2 === 0 ? '#FF8C00' : '#FFB800';
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="${color}"/>`;
      }).join('');
      const gradId = `shGrad${size}`;
      return `
        <svg viewBox="0 0 40 40" width="${size}" height="${size}" style="filter: drop-shadow(0 0 5px rgba(255,140,0,0.85)); opacity:${opacity};">
          <defs>
            <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#FFD93D"/>
              <stop offset="100%" stop-color="#FF8C00"/>
            </radialGradient>
          </defs>
          ${rays}
          ${nodes}
          <circle cx="20" cy="20" r="9" fill="url(#${gradId})"/>
          <circle cx="20" cy="20" r="4.5" fill="#08131f"/>
          <circle cx="20" cy="20" r="2.2" fill="#FFD93D"/>
        </svg>`;
    };
    const eastPos = points[0];
    const westPos = points[points.length - 1];
    const sunStart = makeOverlay(eastPos, `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
        ${solarHubLogo(28, 1)}
        <div style="font-size:10px; font-weight:800; color:#FFD93D; background:rgba(7,9,15,0.7); padding:1px 6px; border-radius:9px; letter-spacing:1px; text-shadow: 0 1px 2px rgba(0,0,0,0.6);">E · sale</div>
      </div>
    `);
    const sunEnd = makeOverlay(westPos, `
      <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
        ${solarHubLogo(16, 0.6)}
        <div style="font-size:10px; font-weight:800; color:#FFD93D; background:rgba(7,9,15,0.7); padding:1px 6px; border-radius:9px; letter-spacing:1px; text-shadow: 0 1px 2px rgba(0,0,0,0.6);">O · cae</div>
      </div>
    `);
    sunPathRef.current = { line, east: sunStart, west: sunEnd };
  }, [showSunPath, lat, lon, areaM2, ready]);

  // NOTA: el diagrama detallado de ruta del sol sigue en SunPathDiagram bajo el
  // mapa. Aquí solo va una indicación delgada visible.

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
