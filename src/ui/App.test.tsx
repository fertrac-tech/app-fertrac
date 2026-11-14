import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/harness';

const cards = () => within(screen.getByRole('list', { name: 'Productos' })).getAllByRole('article');
const nameOf = (el: HTMLElement) => el.querySelector('.card__name')?.textContent ?? '';
const sortedEs = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true }));

describe('Acceso (pantallas 01 y 02)', () => {
  it('login: Google, tres capas y aviso de protección de datos; al entrar muestra el catálogo', async () => {
    renderApp({ signedIn: false, privacyPolicyUrl: 'https://fertrac.com/politica' });
    expect(await screen.findByRole('heading', { name: 'Lista de Precios' })).toBeInTheDocument();
    expect(screen.getByText('Usuario en lista blanca')).toBeInTheDocument();
    expect(screen.getByText('Dispositivo autorizado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver Política de Protección de Datos' })).toHaveAttribute('href', 'https://fertrac.com/politica');

    await userEvent.click(screen.getByRole('button', { name: /Iniciar sesión con Google/ }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('dispositivo pendiente: código corto, Reintentar y aviso de datos; al aprobarse entra', async () => {
    renderApp({ access: ['dispositivo_pendiente', 'ok'] });
    expect(await screen.findByRole('heading', { name: 'Dispositivo pendiente de aprobación' })).toBeInTheDocument();
    expect(screen.getByText('A3F9K2')).toBeInTheDocument();
    expect(screen.queryByText(/web-demo/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Protección de datos personales' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('cuenta nueva: "Solicitud de acceso enviada" con código y Reintentar; al aprobar las dos capas entra', async () => {
    renderApp({ access: ['usuario_pendiente', 'ok'] });
    expect(await screen.findByRole('heading', { name: 'Solicitud de acceso enviada' })).toBeInTheDocument();
    expect(screen.getByText('A3F9K2')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('dispositivo bloqueado y usuario fuera de lista blanca no ven el catálogo', async () => {
    const blocked = renderApp({ access: ['dispositivo_bloqueado'] });
    expect(await screen.findByRole('heading', { name: 'Dispositivo bloqueado' })).toBeInTheDocument();
    blocked.unmount();

    renderApp({ access: ['no_autorizado'] });
    expect(await screen.findByRole('alert')).toHaveTextContent('Cuenta sin acceso');
    expect(screen.queryByRole('list', { name: 'Productos' })).not.toBeInTheDocument();
  });
});

describe('Catálogo (pantalla 03)', () => {
  it('muestra 100 por página, en orden alfabético por Producto, con total y página visibles', async () => {
    renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    expect(cards()).toHaveLength(100);
    expect(screen.getByText('250 productos · pág. 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1–100 de 250')).toBeInTheDocument();
    expect(screen.getByText('A–Z')).toBeInTheDocument();

    const names = cards().map(nameOf);
    expect(names).toEqual(sortedEs(names));
  });

  it('la paginación navega, actualiza el rango y deja la página en la URL', async () => {
    renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('Mostrando 101–200 de 250')).toBeInTheDocument();
    expect(window.location.search).toBe('?p=2');
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');

    await userEvent.click(screen.getByRole('button', { name: 'Página 3' }));
    expect(await screen.findByText('Mostrando 201–250 de 250')).toBeInTheDocument();
    expect(cards()).toHaveLength(50);
    expect(cards().map(nameOf)).toEqual(sortedEs(cards().map(nameOf)));
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('abre directamente la página indicada en la URL', async () => {
    renderApp({ route: '/?p=2' });
    expect(await screen.findByText('Mostrando 101–200 de 250')).toBeInTheDocument();
  });

  it('la búsqueda filtra, vuelve a la página 1 y conserva el orden alfabético', async () => {
    renderApp({ route: '/?p=2' });
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' }), 'bomba');
    await waitFor(() => expect(window.location.search).toBe('?q=bomba'));
    await waitFor(() => expect(cards().every((c) => /bomba/i.test(c.textContent ?? ''))).toBe(true));
    const names = cards().map(nameOf);
    expect(names).toEqual(sortedEs(names));
  });

  it('los filtros permanecen siempre a la vista y no existe control para ocultarlos', async () => {
    for (const viewport of ['compact', 'medium', 'expanded'] as const) {
      const view = renderApp({ viewport });
      const group = await screen.findByRole('group', { name: 'Filtros' });
      expect(within(group).getAllByRole('combobox')).toHaveLength(6);
      expect(screen.queryByRole('button', { name: /ocultar filtros/i })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('"Limpiar filtros" quita todos los filtros, conserva la búsqueda y se desactiva sin filtros', async () => {
    renderApp({ route: '/?q=bomba&condicion=NUEVO&marca=FERTRAC&p=1' });
    const clear = await screen.findByRole('button', { name: 'Limpiar filtros · 2' });
    await userEvent.click(clear);
    await waitFor(() => expect(window.location.search).toBe('?q=bomba'));
    expect(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' })).toHaveValue('bomba');
    expect(screen.getByRole('combobox', { name: 'Condición' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
  });

  it('los filtros se combinan con la búsqueda y se pueden limpiar', async () => {
    renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Condición' }), 'NUEVO');
    await waitFor(() => expect(cards().every((c) => within(c).queryByText('NUEVO'))).toBe(true));
    expect(window.location.search).toBe('?condicion=NUEVO');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' }), 'zzzz-no-existe');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda y filtros' }));
    await waitFor(() => expect(cards()).toHaveLength(100));
  });
});

describe('Detalle (pantalla 04) y trazabilidad de marca', () => {
  it('muestra precios y mantiene el logo en la barra y junto a "Precios"', async () => {
    renderApp({ route: '/?ref=AMK-2210' });
    const detail = await screen.findByRole('complementary', { name: 'Detalle de producto' });
    expect(await within(detail).findByRole('heading', { name: 'AMK-2210' })).toBeInTheDocument();
    expect(within(detail).getByText('$ 412.000')).toBeInTheDocument();
    expect(within(detail).getByText('$ 391.400')).toBeInTheDocument();
    expect(within(detail).getByText('18 und disponibles')).toBeInTheDocument();
    const logos = within(detail).getAllByRole('img', { name: 'Fertrac' }).map((l) => l.getAttribute('data-logo'));
    expect(logos).toEqual(['principal', 'mono']);
  });

  it('la foto se amplía en un diálogo centrado y se cierra', async () => {
    const { container } = renderApp({ route: '/?ref=AMK-2210' });
    const detail = await screen.findByRole('complementary', { name: 'Detalle de producto' });
    await within(detail).findByRole('heading', { name: 'AMK-2210' });
    expect((await container.catalog.get('AMK-2210'))?.photoUrl).toContain('sz=w200');
    await userEvent.click(within(detail).getByRole('button', { name: 'Ampliar foto' }));
    const dialog = screen.getByRole('dialog', { name: 'Foto de AMORTIGUADOR CABINA T800' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', expect.stringContaining('sz=w1600'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar foto' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('en móvil el detalle vuelve a la lista conservando la página', async () => {
    renderApp({ route: '/?p=2' });
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(within(cards()[0] as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    expect(await screen.findByRole('complementary', { name: 'Detalle de producto' })).toBeInTheDocument();
    expect(window.location.search).toMatch(/^\?p=2&ref=/);
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(window.location.search).toBe('?p=2');
    expect(screen.getByText('Mostrando 101–200 de 250')).toBeInTheDocument();
  });
});

describe('Responsive (compacto · fold abierto · escritorio)', () => {
  it('compacto: navegación inferior y tarjetas', async () => {
    renderApp({ viewport: 'compact' });
    await screen.findByRole('list', { name: 'Productos' });
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(nav).toHaveClass('bottomnav');
    expect(within(nav).getByRole('link', { name: 'Catálogo' })).toHaveAttribute('aria-current', 'page');
  });

  it('fold abierto: riel + lista + panel de detalle siempre visible', async () => {
    renderApp({ viewport: 'medium' });
    await screen.findByRole('list', { name: 'Productos' });
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toHaveClass('rail');
    expect(screen.getByRole('complementary', { name: 'Detalle de producto' })).toHaveTextContent('Selecciona un producto');
    await userEvent.click(within(cards()[0] as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    expect(await screen.findByRole('button', { name: 'Cerrar detalle' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('teléfono en horizontal (932×430): sin panel de detalle vacío; al elegir un producto se abre a un lado', async () => {
    renderApp({ viewport: 'landscape' });
    await screen.findByRole('list', { name: 'Productos' });
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toHaveClass('rail');
    expect(screen.queryByRole('complementary', { name: 'Detalle de producto' })).not.toBeInTheDocument();
    await userEvent.click(within(cards()[0] as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    expect(await screen.findByRole('button', { name: 'Cerrar detalle' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Productos' })).toBeInTheDocument();
  });

  it('escritorio: riel y tabla con el logo en el encabezado después de "Producto"', async () => {
    renderApp({ viewport: 'expanded' });
    const table = await screen.findByRole('table', { name: 'Productos' });
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toHaveClass('rail');
    const header = within(table).getByRole('columnheader', { name: /Producto/ });
    expect(within(header).getByRole('img', { name: 'Fertrac' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(101);
    expect(screen.getByText('100 por página · pág. 1 de 3')).toBeInTheDocument();
  });

  it('escritorio con detalle abierto: la tabla compacta conserva Marca después de Referencia', async () => {
    renderApp({ viewport: 'expanded' });
    const table = await screen.findByRole('table', { name: 'Productos' });
    expect(within(table).getAllByRole('columnheader')[1]).toHaveTextContent('Referencia');
    expect(within(table).getAllByRole('columnheader')[2]).toHaveTextContent('Marca');

    await userEvent.click(within(within(table).getAllByRole('row')[1] as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    expect(table).toHaveAttribute('data-compact', 'true');
    expect(within(table).getAllByRole('columnheader')[2]).toHaveTextContent('Marca');
  });

  it('al cambiar de tamaño se conserva página, búsqueda y producto abierto (viven en la URL)', async () => {
    const first = renderApp({ viewport: 'compact', route: '/?q=filtro&p=1&ref=FAP-3321' });
    expect(await screen.findByRole('heading', { name: 'FAP-3321' })).toBeInTheDocument();
    first.unmount();
    renderApp({ viewport: 'medium', route: window.location.pathname + window.location.search });
    expect(await screen.findByRole('heading', { name: 'FAP-3321' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Buscar en el catálogo' })).toHaveValue('filtro');
  });
});

describe('Favoritos (pantallas 05 y 06)', () => {
  it('guardar, renombrar y catalogar en una lista propia sin alterar el catálogo', async () => {
    const { saved } = renderApp({ route: '/?q=AMK-2210' });
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar AMORTIGUADOR CABINA T800 a favoritos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Editar favorito AMORTIGUADOR CABINA T800' }));

    const sheet = screen.getByRole('dialog', { name: 'Editar favorito' });
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Nombre personalizado' }), 'Amortiguador Kenworth (cliente Transandina)');
    await userEvent.click(within(sheet).getByRole('button', { name: '+ Crear lista' }));
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Nombre de la nueva lista' }), 'Clientes Bogotá');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Crear' }));
    expect(within(sheet).getByRole('button', { name: 'Clientes Bogotá' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Guardar' }));

    await userEvent.click(screen.getByRole('link', { name: 'Favoritos' }));
    expect(await screen.findByText('1 producto en 1 lista')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clientes Bogotá · 1' })).toBeInTheDocument();
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent('Amortiguador Kenworth (cliente Transandina)');
    expect(card).toHaveTextContent('AMK-2210 · AMORTIGUADOR CABINA T800');
    expect(card).toHaveTextContent('$ 412.000');
    expect(saved.get('usuario@fertrac.com')?.favorites['AMK-2210']?.listIds).toEqual(['lista-1']);

    await userEvent.click(screen.getByRole('link', { name: 'Catálogo' }));
    expect(await screen.findByText('AMORTIGUADOR CABINA T800')).toBeInTheDocument();
  });

  it('renombrar y eliminar una lista; quitar un favorito', async () => {
    const { container } = renderApp({ route: '/favoritos' });
    await screen.findByRole('heading', { name: 'Favoritos' });
    container.favorites.saveFavorite('FAP-3321', 'Filtro aire — pedido mensual', [container.favorites.createList('Alta rotación')]);

    await userEvent.click(await screen.findByRole('link', { name: 'Alta rotación · 1' }));
    await userEvent.click(screen.getByRole('button', { name: /Renombrar lista/ }));
    const input = screen.getByRole('textbox', { name: 'Nombre de la lista' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Rotación alta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Lista: Rotación alta')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar lista' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Eliminar/ }));
    expect(await screen.findByText('1 producto en 0 listas')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Filtro aire — pedido mensual');

    await userEvent.click(screen.getByRole('button', { name: /Editar favorito/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(await screen.findByText('Aún no tienes favoritos')).toBeInTheDocument();
  });

  it('rechaza nombres de lista duplicados', async () => {
    const { container } = renderApp({ route: '/favoritos' });
    await screen.findByRole('heading', { name: 'Favoritos' });
    container.favorites.createList('Frenos');
    await userEvent.click(screen.getByRole('button', { name: /Nueva lista/ }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre de la lista' }), 'frenos');
    await userEvent.click(screen.getByRole('button', { name: 'Crear lista' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ya tienes una lista con ese nombre.');
  });

  it('escritorio: tarjetas de "Mis listas" con vista previa y acceso desde la barra lateral', async () => {
    const { container } = renderApp({ route: '/favoritos', viewport: 'expanded' });
    await screen.findByRole('heading', { name: 'Favoritos' });
    await userEvent.click(screen.getByRole('button', { name: /Expandir barra de navegación/ }));
    container.favorites.saveFavorite('AMK-2210', 'Amortiguador Kenworth', [container.favorites.createList('Clientes Bogotá')]);
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    expect(await within(nav).findByRole('link', { name: /Clientes Bogotá\s*1/ })).toBeInTheDocument();
    expect(await screen.findByText('★ Amortiguador Kenworth')).toBeInTheDocument();
    expect(screen.getByText('1 nuevo')).toBeInTheDocument();
  });
});

describe('Perfil (pantalla 07)', () => {
  it('muestra la foto designada en Google, nombre, correo y las tres capas', async () => {
    renderApp({ route: '/perfil', user: { picture: 'https://lh3.googleusercontent.com/a/foto' } });
    expect(await screen.findByRole('heading', { name: 'David Torres' })).toBeInTheDocument();
    expect(screen.getByText('usuario@fertrac.com')).toBeInTheDocument();
    expect(screen.getByText('Foto de la cuenta de Google')).toBeInTheDocument();
    expect(document.querySelector('.profile .avatar img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/foto');
    expect(screen.getByText('Verificada')).toBeInTheDocument();
    expect(screen.getByText('Autorizado')).toBeInTheDocument();
    expect(screen.getByText('Aprobado · A3F9K2')).toBeInTheDocument();
    expect(screen.getByText('Navegador')).toBeInTheDocument();
    expect(screen.getByText('11.0.0')).toBeInTheDocument();
  });

  it('sin foto usa las iniciales; cerrar sesión vuelve al login', async () => {
    renderApp({ route: '/perfil' });
    await screen.findByRole('heading', { name: 'David Torres' });
    expect(document.querySelector('.profile .avatar')).toHaveTextContent('DT');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('button', { name: /Iniciar sesión con Google/ })).toBeInTheDocument();
  });

  it('el tema es claro por defecto, aunque el sistema esté en oscuro', async () => {
    renderApp({ route: '/perfil', systemDark: true });
    await screen.findByRole('heading', { name: 'David Torres' });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('el botón de tema cambia a oscuro y de vuelta a voluntad, y usa el logo blanco negativo', async () => {
    renderApp();
    await screen.findByRole('list', { name: 'Productos' });
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a modo oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('fertrac_v2_theme')).toBe('dark');
    expect(screen.getAllByRole('img', { name: 'Fertrac' })[0]).toHaveAttribute('src', expect.stringContaining('logo2'));
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a modo claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('el botón de tema está disponible en login, fold y escritorio', async () => {
    const login = renderApp({ signedIn: false });
    expect(await screen.findByRole('button', { name: 'Cambiar a modo oscuro' })).toBeInTheDocument();
    login.unmount();
    for (const viewport of ['medium', 'expanded'] as const) {
      const view = renderApp({ viewport });
      expect(await screen.findByRole('button', { name: 'Cambiar a modo oscuro' })).toBeInTheDocument();
      view.unmount();
    }
  });
});
