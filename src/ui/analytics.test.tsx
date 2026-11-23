import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/test/harness';

describe('Analítica de uso (GA4)', () => {
  it('login: mide el inicio de sesión y se identifica con seudónimo, nunca con el correo', async () => {
    const { analytics } = renderApp({ signedIn: false });
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar sesión con Google/ }));
    await screen.findByRole('list', { name: 'Productos' });

    await waitFor(() => expect(analytics.screens()).toEqual(['catalogo']));
    expect(analytics.events('login')).toEqual([{ name: 'login', method: 'google' }]);
    const identify = analytics.records.find((r) => r.kind === 'identify');
    expect(identify).toMatchObject({ kind: 'identify', user: { properties: { canal: 'navegador', vista: 'compact', entorno: 'produccion', version_app: '11.0.0' } } });
    expect(JSON.stringify(analytics.records)).not.toContain('usuario@fertrac.com');
    // La identidad llega antes del primer page_view.
    expect(analytics.records.findIndex((r) => r.kind === 'identify')).toBeLessThan(analytics.records.findIndex((r) => r.kind === 'screen'));
  });

  it('una sesión restaurada no cuenta como login; solo los cambios de pantalla son vistas', async () => {
    const { analytics } = renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await waitFor(() => expect(analytics.screens()).toEqual(['catalogo']));
    expect(analytics.events('login')).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await screen.findByText('Mostrando 101–200 de 250');
    expect(analytics.events('paginar')).toEqual([{ name: 'paginar', pagina: 2 }]);

    await userEvent.click(screen.getByRole('link', { name: /Favoritos/ }));
    await waitFor(() => expect(analytics.screens()).toEqual(['catalogo', 'favoritos']));
  });

  it('filtros: mide cuál se usa y cuántos valores; también "Limpiar filtros"', async () => {
    const { analytics } = renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(screen.getByRole('button', { name: 'Marca: Todas' }));
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Marca' })).getByRole('option', { name: 'ORIGINAL' }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros · 1' }));

    expect(analytics.events('filtro_aplicado')).toEqual([{ name: 'filtro_aplicado', filtro: 'marca', valores: 1 }]);
    expect(analytics.events('filtros_limpiados')).toEqual([{ name: 'filtros_limpiados', incluye_busqueda: false }]);
    expect(analytics.screens()).toEqual(['catalogo']); // filtrar no es una vista nueva
  });

  it('búsqueda: un solo evento con el término final y sus resultados', async () => {
    const { analytics } = renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' }), 'Bomba');
    await waitFor(() => expect(analytics.events('search')).toHaveLength(1), { timeout: 3000 });
    const [search] = analytics.events('search');
    expect(search?.search_term).toBe('bomba');
    expect(search?.resultados).toBeGreaterThan(0);
  });

  it('detalle: view_item con el producto y la pantalla de origen; compartir y ampliar foto', async () => {
    const { analytics } = renderApp({ route: '/?ref=AMK-2210' });
    const detail = await screen.findByRole('complementary', { name: 'Detalle de producto' });
    await within(detail).findByRole('heading', { name: 'AMK-2210' });
    expect(analytics.events('view_item')).toEqual([
      { name: 'view_item', origen: 'catalogo', items: [expect.objectContaining({ item_id: 'AMK-2210', item_name: 'AMORTIGUADOR CABINA T800' })] },
    ]);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await userEvent.click(within(detail).getByRole('button', { name: 'Copiar texto del producto' }));
    await userEvent.click(within(detail).getByRole('button', { name: 'Ampliar foto' }));

    expect(analytics.events('share')).toEqual([{ name: 'share', method: 'copiar_texto', content_type: 'producto', item_id: 'AMK-2210' }]);
    expect(analytics.events('foto_ampliada')).toEqual([{ name: 'foto_ampliada', item_id: 'AMK-2210' }]);
  });

  it('sincronizar se mide desde el botón', async () => {
    const { analytics } = renderApp({ viewport: 'expanded' });
    await screen.findByRole('table');
    await userEvent.click(screen.getAllByRole('button', { name: /Sincronizar/ })[0]!);
    expect(analytics.events('sincronizar')).toHaveLength(1);
  });
});
