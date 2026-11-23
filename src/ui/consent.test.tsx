import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/harness';

const gate = () => screen.queryByRole('region', { name: 'Aviso de privacidad' });
const consents = (records: { kind: string }[]) => records.filter((r) => r.kind === 'consent');

describe('Aviso de privacidad: requisito de acceso', () => {
  it('el login no pide el aviso; después de entrar, sin aceptar no hay catálogo', async () => {
    const { analytics } = renderApp({ signedIn: false, consent: 'pending', privacyPolicyUrl: 'https://fertrac.com/politica' });
    await screen.findByRole('heading', { name: 'Lista de Precios' });
    expect(gate()).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Iniciar sesión con Google/ }));
    const notice = await screen.findByRole('region', { name: 'Aviso de privacidad' });
    expect(within(notice).getByRole('heading', { name: 'Aviso de privacidad y analítica de uso' })).toBeInTheDocument();
    expect(within(notice).getByRole('link', { name: 'Ver Política de Protección de Datos' })).toHaveAttribute('href', 'https://fertrac.com/politica');
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();
    expect(analytics.screens()).toEqual([]); // sin vistas mientras no hay acceso

    await userEvent.click(within(notice).getByRole('button', { name: 'Aceptar y continuar' }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
    expect(consents(analytics.records)).toEqual([{ kind: 'consent', granted: true }]);
  });

  it('"Rechazar" bloquea el acceso; puede aceptar después o cerrar sesión', async () => {
    const { analytics } = renderApp({ consent: 'pending' });
    await userEvent.click(within(await screen.findByRole('region', { name: 'Aviso de privacidad' })).getByRole('button', { name: 'Rechazar' }));

    const blocked = gate()!;
    expect(within(blocked).getByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(within(blocked).getByRole('alert')).toHaveTextContent('no puedes ingresar');
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();
    expect(within(blocked).queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
    expect(consents(analytics.records)).toEqual([{ kind: 'consent', granted: false }]);

    await userEvent.click(within(blocked).getByRole('button', { name: 'Aceptar y continuar' }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('con el rechazo guardado, al abrir la app sigue bloqueada y puede cerrar sesión', async () => {
    renderApp({ consent: 'denied' });
    const blocked = await screen.findByRole('region', { name: 'Aviso de privacidad' });
    expect(within(blocked).getByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    await userEvent.click(within(blocked).getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: /Iniciar sesión con Google/ })).toBeInTheDocument();
  });

  it('un enlace directo (?ref=, /favoritos) tampoco salta el aviso', async () => {
    renderApp({ route: '/favoritos', consent: 'pending' });
    expect(await screen.findByRole('region', { name: 'Aviso de privacidad' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Favoritos/ })).not.toBeInTheDocument();
  });

  it('Perfil: muestra la fecha; retirar la autorización pide confirmación y bloquea el acceso', async () => {
    const { analytics } = renderApp({ route: '/perfil', consent: 'granted' });
    const privacy = await screen.findByRole('region', { name: 'Privacidad' });
    expect(within(privacy).getByText(/Autorizada ·/)).toBeInTheDocument();

    await userEvent.click(within(privacy).getByRole('button', { name: 'Retirar autorización' }));
    const confirm = screen.getByRole('dialog', { name: 'Retirar autorización' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('region', { name: 'Privacidad' })).toBeInTheDocument();

    await userEvent.click(within(screen.getByRole('region', { name: 'Privacidad' })).getByRole('button', { name: 'Retirar autorización' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Retirar autorización' })).getByRole('button', { name: 'Retirar' }));
    expect(await screen.findByRole('heading', { name: 'Acceso no disponible' })).toBeInTheDocument();
    expect(consents(analytics.records)).toEqual([{ kind: 'consent', granted: false }]);
  });
});
