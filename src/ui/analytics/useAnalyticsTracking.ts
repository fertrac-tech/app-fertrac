import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { pseudonymousUserId, screenFromPath } from '@/domain/analytics';
import { useAppState, useBreakpoint, useContainer } from '../context';

/** SHA-256 en hexadecimal con Web Crypto (solo existe en HTTPS, que es como corre la app). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Medición de sesión: inicio de sesión, identidad (seudónimo + segmentos) y vistas de pantalla.
 * Va en la compuerta de la app (dentro del router). Las vistas esperan a la identidad para que
 * el primer page_view ya lleve el user_id.
 */
export function useAnalyticsTracking(): void {
  const { analytics, config } = useContainer();
  const state = useAppState();
  const breakpoint = useBreakpoint();
  const { pathname } = useLocation();

  const ready = state.status === 'ready';
  const email = ready ? state.session.user.email : null;
  const channel = ready ? state.channel : null;
  const screen = screenFromPath(pathname);
  const [identified, setIdentified] = useState<string | null>(null);

  // Inicio de sesión = llegar al catálogo desde el login o desde "dispositivo pendiente".
  // Restaurar una sesión guardada al abrir la app no cuenta como login.
  const previous = useRef(state.status);
  useEffect(() => {
    if (state.status === 'ready' && (previous.current === 'signedOut' || previous.current === 'blocked')) {
      analytics.track({ name: 'login', method: 'google' });
    }
    previous.current = state.status;
  }, [analytics, state.status]);

  useEffect(() => {
    if (!email) {
      setIdentified((current) => {
        if (current) analytics.identify({ userId: null, properties: {} }); // cierre de sesión
        return null;
      });
      return;
    }
    let active = true;
    const properties = {
      canal: channel ?? 'desconocido',
      vista: breakpoint,
      entorno: config.environmentLabel ? config.environmentLabel.toLowerCase() : 'produccion',
      version_app: config.version,
    };
    pseudonymousUserId(email, sha256Hex)
      .catch(() => null)
      .then((userId) => {
        if (!active) return;
        analytics.identify({ userId, properties });
        setIdentified(email);
      });
    return () => {
      active = false;
    };
  }, [analytics, config.environmentLabel, config.version, email, channel, breakpoint]);

  // Una vista por pantalla: cambiar filtros, página o producto (?…) no cuenta como vista nueva.
  useEffect(() => {
    if (ready && identified === email) analytics.screen(screen);
  }, [analytics, ready, identified, email, screen]);
}
