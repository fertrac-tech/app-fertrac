import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './layout/Shell';
import { CatalogScreen } from './screens/CatalogScreen';
import { FavoritesScreen } from './screens/FavoritesScreen';
import { DeviceScreen, LoginScreen, Splash } from './screens/GateScreens';
import { ProfileScreen } from './screens/ProfileScreen';
import { ThemeProvider, useAppState, useContainer } from './context';

function Gate() {
  const { session, favorites, config } = useContainer();
  const state = useAppState();
  const userEmail = state.status === 'ready' ? state.session.user.email : null;

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
