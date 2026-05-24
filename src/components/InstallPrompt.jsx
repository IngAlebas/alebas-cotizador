import React, { useState, useEffect } from 'react';
import { C } from '../constants';

// Banner sugerencia de instalar la PWA. Aparece SOLO si:
//  - No está ya instalada (display-mode != standalone)
//  - Usuario en mobile (pointer: coarse)
//  - Usuario no la descartó previamente (localStorage 'sh:install-dismissed')
//  - Pasaron al menos 30s desde que entró (no inmediato, no agresivo)
//
// En Chrome/Android usa el evento nativo `beforeinstallprompt`.
// En iOS Safari muestra instrucciones manuales (Compartir → Agregar a inicio).
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    // Suprimir si ya está instalada o el usuario la descartó.
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (isStandalone) return;
    if (localStorage.getItem('sh:install-dismissed')) return;

    // Detectar mobile real (touch + pantalla pequeña).
    const isMobile = window.matchMedia('(pointer: coarse)').matches
      && window.matchMedia('(max-width: 900px)').matches;
    if (!isMobile) return;

    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;

    let installEvent = null;
    const onBeforeInstall = (e) => {
      e.preventDefault();
      installEvent = e;
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // En iOS no hay beforeinstallprompt — mostramos el prompt manual a los 30s.
    let iosTimer = null;
    if (isIOS) {
      iosTimer = setTimeout(() => {
        setIosInstructions(true);
        setShow(true);
      }, 30000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem('sh:install-dismissed', '1');
    setShow(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      localStorage.setItem('sh:install-dismissed', '1');
    }
    setDeferredPrompt(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="al-install-prompt al-only-browser" role="dialog" aria-label="Instalar app">
      <div className="al-install-card">
        <button className="al-install-close" onClick={dismiss} aria-label="Cerrar">×</button>
        <div className="al-install-icon">
          {/* Ícono SolarHub mini */}
          <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
            <circle cx="32" cy="32" r="11" fill={C.yellow} />
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * Math.PI) / 4;
              const x1 = 32 + Math.cos(a) * 18, y1 = 32 + Math.sin(a) * 18;
              const x2 = 32 + Math.cos(a) * 26, y2 = 32 + Math.sin(a) * 26;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.yellow} strokeWidth="3" strokeLinecap="round" />;
            })}
          </svg>
        </div>
        <div className="al-install-body">
          <div className="al-install-title">Instala SolarHub en tu móvil</div>
          {iosInstructions ? (
            <div className="al-install-text">
              Toca <strong style={{ color: C.yellow }}>Compartir</strong> en Safari y luego
              <strong style={{ color: C.yellow }}> "Añadir a pantalla de inicio"</strong>.
              Acceso instantáneo, modo offline, notificaciones.
            </div>
          ) : (
            <div className="al-install-text">
              Acceso directo desde tu pantalla de inicio · Modo offline · Sin barra del navegador.
            </div>
          )}
          {!iosInstructions && (
            <div className="al-install-actions">
              <button className="al-install-btn" onClick={install}>Instalar app</button>
              <button className="al-install-btn-ghost" onClick={dismiss}>Después</button>
            </div>
          )}
          {iosInstructions && (
            <button className="al-install-btn-ghost" onClick={dismiss} style={{ alignSelf: 'flex-start' }}>Entendido</button>
          )}
        </div>
      </div>
    </div>
  );
}
