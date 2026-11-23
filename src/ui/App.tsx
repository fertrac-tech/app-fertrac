import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './layout/Shell';
import { CatalogScreen } from './screens/CatalogScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { ConsentScreen, DeviceScreen, LoginScreen, Splash } from './screens/GateScreens';
import { ProfileScreen } from './screens/ProfileScreen';
import { useAnalyticsTracking } from './analytics/useAnalyticsTracking';
import { analyticsGranted } from '@/domain/consent';
import { ThemeProvider, useAppState, useConsentState, useContainer } from './context';

function Gate() {
  const { session, favorites, config } = useContainer();
  const state = useAppState();
  const consentState = useConsentState();
  const userEmail = state.status === 'ready' ? state.session.user.email : null;
  useAnalyticsTracking();

  useEffect(() => {
    void session.start();
  }, [session]);

  // Los favoritos pertenecen al usuario con sesión activa.
  useEffect(() => {
    void favorites.load(userEmail);
  }, [favorites, userEmail]);

  let screen;
  if (state.status === 'loading') screen = <Splash />;
  else if (state.status === 'signedOut') screen = <LoginScreen state={state} />;
  else if (state.status === 'blocked') screen = <DeviceScreen state={state} />;
  // Sin aceptar el aviso de privacidad no hay acceso al catálogo.
  else if (!analyticsGranted(consentState)) screen = <ConsentScreen email={state.session.user.email} />;
  else
    screen = (
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<CatalogScreen />} />
          <Route path="favoritos" element={<FavoritesScreen />} />
          <Route path="perfil" element={<ProfileScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );

  return (
    <>
      {screen}
      {config.environmentLabel && <span className="env-badge">{config.environmentLabel}</span>}
    </>
  );
}

export function App({ basename = '/' }: { basename?: string }) {
  return (
    <ThemeProvider>
      <BrowserRouter basename={basename}>
        <Gate />
      </BrowserRouter>
    </ThemeProvider>
  );
}
