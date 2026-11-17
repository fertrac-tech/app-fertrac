# Arquitectura

> Diagramas navegables: [`docs/architecture/main.html`](architecture/main.html). Hay dos vistas: el flujo de datos de Drive a la app y el modelo de seguridad.

## Capas (puertos y adaptadores)

```
src/
  domain/     Reglas de negocio puras. Sin React, sin navegador, sin backend.
  ports/      Contratos: CatalogRepository, CatalogSource, SnapshotStore, FavoritesRepository, AuthProvider, DeviceIdentity.
  adapters/   Implementaciones: appsScript/, catalog/, storage/ (IndexedDB), google/, device/, mock/.
  app/        Casos de uso y composición: config, container, sessionController, favoritesController.
  ui/         React: layout, pantallas, componentes y tokens (1:1 con las variables de Figma).
gs/           Backend Google Apps Script: API, Seguridad, Autorizacion, Sync, Photos, Log, Activity, Triggers.
```

Las dependencias apuntan siempre hacia adentro: `ui → app → ports ← adapters`, y todas las capas conocen `domain`.
`app/container.ts` es el único archivo que decide qué adaptador concreto se usa (según `VITE_DATA_SOURCE`: `mock` o `appsscript`).

## Flujo de datos

1. `gs/Sync.gs` copia **LISTA DE PRECIOS** a **BASE MOTOR/Hoja2** cada 5 minutos y al editar la hoja fuente (`gs/Triggers.gs`).
2. `gs/Photos.gs` corre cada 10 minutos. Convierte las imágenes a WebP (wsrv.nl), las guarda en la carpeta de Drive y registra la relación referencia → URL en `CACHE_`.
3. `gs/API.gs` lee Hoja2 con `LockService` y la guarda 90 s en `CacheService`. El mapa de fotos se cachea 1 h. Si una sincronización tiene el lock, responde `temporalmente_ocupado` y la app reintenta.
4. `AppsScriptCatalogSource` descarga el catálogo y el mapa de fotos. `mapper.ts` convierte cada fila en un `Product`.
5. `SnapshotCatalogRepository` construye el `CatalogIndex` y guarda la copia en IndexedDB.

## Por qué es más rápida

- El catálogo se ordena **una vez por sincronización** (`CatalogIndex`): alfabético por producto, con desempate por referencia. Buscar, filtrar y paginar es un recorrido lineal y un `slice`. En la demo de 4.732 productos, cambiar de página toma ~0,1 s de punta a punta.
- Solo hay 100 filas en el DOM, y el navegador omite el render de las que no se ven (`content-visibility`).
- La app arranca desde la copia local en IndexedDB. El catálogo y los favoritos funcionan sin conexión, con un máximo de 24 h.
- Las miniaturas tienen tamaño fijo y carga diferida, y se muestran esqueletos en lugar de pantalla en blanco.
- La PWA (`vite-plugin-pwa`, Workbox) cachea el shell y se actualiza sola (`autoUpdate`).

## Seguridad

Detalle completo en [`SEGURIDAD_DISPOSITIVOS.md`](SEGURIDAD_DISPOSITIVOS.md).

- **Login.** El ID token de Google (web con GIS, APK con plugin nativo) se canjea **una vez** en `op=sesion`. `gs/Seguridad.gs` verifica la firma RS256 y los campos `iss`, `aud`, `exp`, `email_verified` y `hd`, y emite el token de dispositivo `st1.` (HMAC, ligado a correo y `device_id`).
- **Peticiones.** Todas son POST `text/plain` con `st` + `device`, `canal`, `plat`, `modelo`, `ver` (y `so=android`). Las credenciales nunca van en la URL.
- **Autorización por petición.** `gs/Autorizacion.gs` evalúa dos capas: USUARIOS AUTORIZADOS (ESTADO y CANAL) y DISPOSITIVOS (ESTADO y HUELLA).
- **Identidad del equipo.** El `device_id` usa **las mismas claves que la v10** (`fertrac_device_id`), así que los dispositivos ya aprobados siguen aprobados en `app.fertrac.com`.
- **Llave pública retirada.** La v2 no envía la llave de transición (`ACCESS_KEY`), y `?key=fertrac2024` está retirada.
- **Acceso revocado.** Si el acceso se revoca (bloqueo, suspensión o fuera de la lista blanca), la app borra la copia local del catálogo.
- **CSP.** La política va en un `<meta>` del build (`vite.config.ts`).

## Sesión y renovación

- **Duración del token `st1`.** Dura 12 h y el backend lo rota a las 6 h (la respuesta trae `sesion`). La sesión dura como máximo 7 días desde el login con Google.
- **Al vencer.** La app intenta renovar en silencio: One Tap con `auto_select` en web, `refresh` del plugin nativo en el APK. Si no lo logra, sigue con la copia local y muestra "Tu sesión venció. Pulsa Sincronizar para renovarla".

## Migración a la nube

1. Publicar una API con el contrato de `CatalogRepository` (`query` paginado y ordenado en servidor, `get`, `getMany`, `facets`) y de `FavoritesRepository`.
2. Escribir `adapters/cloud/CloudCatalogRepository.ts` y `CloudFavoritesRepository.ts` con sus pruebas.
3. Registrarlos en `app/container.ts` según `VITE_DATA_SOURCE`. Dominio y UI no cambian.

El estado de favoritos ya lleva `version` y `updatedAt` para migrar y sincronizar los datos locales.

## Tema

Claro por defecto (no sigue al sistema). El usuario lo cambia con el botón de tema (barra superior, riel, barra lateral, login y Perfil), y la elección se recuerda en el dispositivo.

## Pendientes y supuestos

- **Favoritos.** Se guardan en el dispositivo (decisión de esta fase) y no se sincronizan entre dispositivos.
- **Inventario bajo.** La etiqueta amarilla aplica con menos de 10 unidades (`LOW_STOCK_THRESHOLD`). Falta validarlo con negocio.
- **Promoción.** Se determina por la columna CONDICIÓN, no por tener precio promo: contiene "PROMO" o nombra un color ("Magenta", "Azul"…). Si nombra un color, se muestra la inicial dentro de un círculo de ese color (`PROMO_COLORS`). "NO TIENE" no se muestra.
- **Política de datos.** Falta la URL oficial (`VITE_PRIVACY_POLICY_URL`, variable `PRIVACY_POLICY_URL` del repositorio) y la validación jurídica del texto.
- **Analítica.** GA4/GTM y el registro de actividad (`?activity=`) de la v10 aún no se portaron al frontend. El backend sí los soporta.
- **Íconos.** 12 vienen del Figma. Los demás (cerrar, lápiz, papelera, carpeta, etc.) se dibujaron en el mismo estilo porque el plan Starter de Figma agotó su cupo de exportación.
