import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/harness';

const banner = () => screen.queryByRole('region', { name: 'Aviso de privacidad' });

describe('Aviso de privacidad y analítica (Consent Mode)', () => {
  it('sin decisión aparece desde el login, con la política, y no bloquea la app', async () => {
    renderApp({ signedIn: false, consent: 'pending', privacyPolicyUrl: 'https://fertrac.com/politica' });
    await screen.findByRole('heading', { name: 'Lista de Precios' });
    const notice = banner()!;
    expect(notice).toBeInTheDocument();
    expect(within(notice).getByText(/No enviamos tu correo/)).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Ver Política de Protección de Datos' })).toHaveAttribute('href', 'https://fertrac.com/politica');

    // La app sigue usable con el aviso abierto.
    await userEvent.click(screen.getByRole('button', { name: /Iniciar sesión con Google/ }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
    expect(banner()).toBeInTheDocument();
  });

  it('"Rechazar" cierra el aviso y deja la analítica denegada', async () => {
    const { analytics } = renderApp({ consent: 'pending' });
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(within(banner()!).getByRole('button', { name: 'Rechazar' }));
    expect(banner()).not.toBeInTheDocument();
    expect(analytics.records.filter((r) => r.kind === 'consent')).toEqual([{ kind: 'consent', granted: false }]);
  });

  it('"Aceptar" cierra el aviso y concede la analítica', async () => {
    const { analytics } = renderApp({ consent: 'pending' });
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(within(banner()!).getByRole('button', { name: 'Aceptar' }));
    expect(banner()).not.toBeInTheDocument();
    expect(analytics.records.filter((r) => r.kind === 'consent')).toEqual([{ kind: 'consent', granted: true }]);
  });

  it('con decisión guardada no vuelve a aparecer', async () => {
    renderApp({ consent: 'denied' });
    await screen.findByRole('list', { name: 'Productos' });
    expect(banner()).not.toBeInTheDocument();
  });

  it('Perfil muestra la decisión con su fecha y permite cambiarla', async () => {
    const { analytics } = renderApp({ route: '/perfil', consent: 'denied' });
    const privacy = await screen.findByRole('region', { name: 'Privacidad' });
    const group = within(privacy).getByRole('group', { name: 'Analítica de uso' });
    expect(within(group).getByRole('button', { name: 'No permitir' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(within(group).getByRole('button', { name: 'Permitir' }));
    expect(within(group).getByRole('button', { name: 'Permitir' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(privacy).getByText(/Decisión del/)).toBeInTheDocument();
    expect(analytics.records.filter((r) => r.kind === 'consent')).toEqual([{ kind: 'consent', granted: true }]);
  });

  it('desde Perfil se puede decidir aunque el aviso siga abierto', async () => {
    renderApp({ route: '/perfil', consent: 'pending' });
    const privacy = await screen.findByRole('region', { name: 'Privacidad' });
    const group = within(privacy).getByRole('group', { name: 'Analítica de uso' });
    expect(within(group).getByRole('button', { name: 'Permitir' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(group).getByRole('button', { name: 'No permitir' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(within(group).getByRole('button', { name: 'No permitir' }));
    expect(banner()).not.toBeInTheDocument();
  });
});
