# Lista de Precios Fertrac v2

App móvil y web de Fertrac para consultar la lista de precios: catálogo, inventario, promociones y fotos de producto, con favoritos y acceso controlado por cuenta y dispositivo.

Está hecha con React, TypeScript y Vite y se instala como PWA. Corre en navegador, dentro del APK Android (Capacitor) y en `https://app.fertrac.com` (GitHub Pages).

---

## 1. Alcance

**Incluye (v2)**

| Área | Qué hace |
|---|---|
| Catálogo | Catálogo completo en orden alfabético por producto (desempate por referencia). 100 unidades por página. Búsqueda y filtros siempre visibles, con botón para limpiar filtros. |
| Detalle | Precio bruto, neto −5 %, neto −8 % y precio promo. Inventario, tarjeta de CONDICIÓN (si es distinta de "NO TIENE") y color de promoción. Foto ampliable en zoom. |
| Favoritos | Listas propias con alias y categorías. Se guardan en el dispositivo. |
| Perfil | Foto y datos de la cuenta Google, cambio de tema claro u oscuro. |
| Seguridad | Login Google @fertrac.com, lista blanca de usuarios, restricción por dispositivo, token de sesión firmado y copia local que vence a las 24 h. |
| Responsive | Teléfono (< 600 px), fold abierto (600–1023 px) y escritorio (≥ 1024 px). Marca de agua con logo en escritorio. |
| Sin conexión | Abre con la copia local del catálogo (máximo 24 h sin sincronizar). |

**Fuera de alcance en esta fase**

- Sincronizar favoritos entre dispositivos (solo se guardan en el equipo).
- API en la nube: el backend sigue siendo Google Apps Script. La arquitectura ya está lista para cambiarlo (ver §5).
- Analítica GA4/GTM y registro de actividad de la v10.
- Play Integrity: está preparado pero apagado, porque el APK se instala a mano.

---

## 2. Cómo funciona

```
LISTA DE PRECIOS (Google Sheets, la edita Comercial)
   │  Sync.gs: cada 5 min + al editar
   ▼
BASE MOTOR / Hoja2 ──► API.gs (Web App, solo POST, caché 90 s) ──► App v2
   ▲                        ▲                                       │
   │  Photos.gs: cada 10 min│ mapa ref → URL foto (caché 1 h)       ├─ CatalogIndex: ordena 1 vez, pagina local
   └─ WebP → carpeta Drive ─┘                                       └─ IndexedDB: copia ≤ 24 h + favoritos
```

1. **Datos.** Comercial actualiza **LISTA DE PRECIOS**. `gs/Sync.gs` la copia a **BASE MOTOR/Hoja2** cada 5 minutos y en cada edición.
2. **Fotos.** `gs/Photos.gs` convierte la imagen de cada referencia a WebP y la guarda en una carpeta de Drive. La hoja `CACHE_` guarda la relación referencia → URL.
3. **API.** `gs/API.gs` recibe peticiones POST, valida la sesión y entrega el catálogo y el mapa de fotos con caché.
4. **App.** Descarga el catálogo completo, lo ordena **una sola vez** en `CatalogIndex` y lo guarda en IndexedDB. Buscar, filtrar y paginar se hace en el dispositivo (~0,1 s por página).
5. **Acceso en 3 capas** en cada sesión:
   1. **Google:** el backend verifica el ID token (firma RS256, `iss`, `aud`, `exp`, `email_verified`, `hd = fertrac.com`).
   2. **Usuario:** la hoja **USUARIOS AUTORIZADOS** define ESTADO (ACTIVO / PENDIENTE / SUSPENDIDO) y CANAL (APP / WEB / AMBOS). Una cuenta nueva entra como PENDIENTE y se envía un correo al aprobador.
   3. **Dispositivo:** la hoja **DISPOSITIVOS** registra cada equipo con `device_id` y huella (PENDIENTE / APROBADO / BLOQUEADO). Hoy está en modo observación (`ENFORCE_DISPOSITIVOS = false`).

   Si el acceso es válido, el backend emite un token **`st1`** firmado con HMAC y ligado a correo y dispositivo (TTL 12 h, rotación cada 6 h, máximo 7 días). Si el acceso se revoca, la app borra la copia local.

Detalle de seguridad y operación: [`docs/SEGURIDAD_DISPOSITIVOS.md`](docs/SEGURIDAD_DISPOSITIVOS.md).

---

## 3. Probar en local

**Requisitos:** Node.js ≥ 20 (el CI usa 22) y npm.

```bash
npm install
npm run dev          # Demo: http://localhost:5173
```

| Entorno | Comando | Datos | Login |
|---|---|---|---|
| **Demo** (recomendado) | `npm run dev` | 4.732 productos de ejemplo, sin backend | Simulado (un clic) |
| Demo compilada | `npm run preview:mock` | Igual, con el bundle real | Simulado |
| Staging | `npm run dev:staging` | Apps Script de **pruebas** (`.env.staging`) | Google real |
| Producción | `npm run build` | Apps Script productivo (`.env.production`) | Google real |

**Simular estados de seguridad en la demo** (parámetro en la URL):

```
/?acceso=dispositivo_pendiente
/?acceso=dispositivo_bloqueado
/?acceso=dispositivo_limite
/?acceso=no_autorizado
/?acceso=usuario_suspendido
/?acceso=ok              ← volver al estado normal
```

**Staging con datos reales:** completa `VITE_APPS_SCRIPT_URL` en `.env.staging` con un despliegue de Apps Script que lea una **copia** de la hoja. Con el productivo se registrarían dispositivos PENDIENTE reales y llegarían correos al aprobador. El origen local (`http://localhost:5173`) debe estar en los *Orígenes de JavaScript autorizados* del cliente OAuth.

Cada entorno muestra su etiqueta (DEMO o STAGING) y guarda sus datos locales en una base separada.

### Variables de entorno

| Variable | Uso |
|---|---|
| `VITE_DATA_SOURCE` | `mock` (demo) o `appsscript` (backend real) |
| `VITE_APPS_SCRIPT_URL` | URL `/exec` del Apps Script (obligatoria fuera de la demo) |
| `VITE_GOOGLE_CLIENT_ID` | Cliente OAuth web (obligatorio fuera de la demo) |
| `VITE_ALLOWED_DOMAIN` | Dominio permitido (por defecto `fertrac.com`) |
| `VITE_OFFLINE_MAX_HOURS` | Vida de la copia local (por defecto 24) |
| `VITE_PRIVACY_POLICY_URL` | Enlace a la política de datos |
| `VITE_ENV_LABEL` | Etiqueta visible del entorno |

### Calidad

```bash
npm test             # pruebas unitarias e integración (Vitest + Testing Library)
npm run typecheck
npm run verify       # typecheck + pruebas + build demo
```

Regla del proyecto: **ningún módulo entra sin su prueba**. Cada archivo de `domain/`, `adapters/` y `app/` tiene su `*.test.ts` al lado. Las pantallas se prueban en `src/ui/App.test.tsx`. El CI (`.github/workflows/ci.yml`) corre todo en cada push y pull request.

> ⚠️ **Despliegue:** un push a `main` publica en producción (`app.fertrac.com`) mediante `.github/workflows/deploy.yml`, después de pasar typecheck y pruebas. Prueba en local antes de hacer push.

---

## 4. Arquitectura

**Diagramas** (abre [`docs/architecture/main.html`](docs/architecture/main.html)):

- [`02_datos.dataflow.html`](docs/architecture/02_datos.dataflow.html): flujo de datos de Drive a la app.
- [`01_seguridad.architecture.html`](docs/architecture/01_seguridad.architecture.html): modelo de seguridad, con sus tecnologías y módulos.

Los diagramas se generan con [Archify](https://github.com/tt-a1i/archify) a partir de los `.json` de la misma carpeta. Si cambia un flujo, edita el JSON y vuelve a ejecutar `finalize`.

### Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, PWA (`vite-plugin-pwa`, Workbox) |
| Móvil | APK Android con Capacitor (Google Auth nativo, Device) |
| Almacenamiento local | IndexedDB (`idb-keyval`), localStorage |
| Backend | Google Apps Script (Web App): `API.gs`, `Seguridad.gs`, `Autorizacion.gs`, `Sync.gs`, `Photos.gs` |
| Datos | Google Sheets (LISTA DE PRECIOS, BASE MOTOR), Google Drive (fotos) |
| Identidad | Google Identity Services y OAuth 2.0 (ID token JWT) |
| CI/CD | GitHub Actions y GitHub Pages |
| Pruebas | Vitest, Testing Library, fake-indexeddb |

### Estructura

```
src/
  domain/     Reglas de negocio puras (catálogo, paginación, favoritos, acceso). Sin React ni backend.
  ports/      Contratos: CatalogRepository, CatalogSource, FavoritesRepository, AuthProvider, DeviceIdentity.
  adapters/   Implementaciones: appsScript/, catalog/, storage/ (IndexedDB), google/, device/, mock/.
  app/        Casos de uso y composición: config, container, sessionController, favoritesController.
  ui/         React: layout, pantallas, componentes y tokens (1:1 con las variables del Figma).
gs/           Backend Apps Script (se publica aparte en script.google.com).
docs/         Arquitectura, despliegue, seguridad y diagramas.
```

---

## 5. Patrón de diseño

**Arquitectura hexagonal (puertos y adaptadores).** Las dependencias apuntan siempre hacia adentro:

```
ui ──► app ──► ports ◄── adapters
          └──► domain ◄──┘
```

| Patrón | Dónde | Para qué |
|---|---|---|
| **Puertos y adaptadores** | `ports/` ↔ `adapters/` | Cambiar el backend (Apps Script → nube) o el almacenamiento sin tocar dominio ni UI. |
| **Composition Root / inyección de dependencias** | `app/container.ts` | Es el **único** archivo que decide qué adaptador concreto se usa, según `VITE_DATA_SOURCE` (mock o appsscript). |
| **Repository** | `CatalogRepository`, `FavoritesRepository` | La UI pide páginas, detalles y facetas sin saber de dónde vienen los datos. |
| **Snapshot + índice en memoria** | `SnapshotCatalogRepository`, `CatalogIndex` | Ordena una vez por sincronización, trabaja sin conexión y aplica el vencimiento de 24 h. |
| **Strategy** | `mock/` vs `appsScript/`, login web vs nativo | Mismo contrato con implementaciones intercambiables por entorno o plataforma. |
| **Controlador + Observer** | `SessionController` (estados de la app), `FavoritesController` (`subscribe`) | Concentra la lógica de sesión y avisa a la UI de los cambios. |
| **Dominio puro** | `domain/` | Reglas de negocio deterministas y fáciles de probar (orden, paginación, acceso, promociones). |

**Migrar a la nube:** publica una API con el contrato de `CatalogRepository` (consulta paginada y ordenada en servidor, `get`, `getMany`, `facets`) y de `FavoritesRepository`. Escribe `adapters/cloud/` con sus pruebas y regístralo en `app/container.ts`. Dominio y UI no cambian.

---

## 6. Reglas de negocio (dónde viven)

| Regla | Módulo | Prueba |
|---|---|---|
| Orden alfabético (A–Z) por producto, desempate por referencia | `domain/catalogQuery.ts` | `catalogQuery.test.ts` |
| 100 unidades por página, total y rango visibles, página en la URL (`?p=2`) | `domain/pagination.ts` | `pagination.test.ts` |
| Favoritos con alias y listas propias | `domain/favorites.ts` | `favorites.test.ts` |
| Promoción por la columna CONDICIÓN (PROMO o nombre de color) | `adapters/appsScript/mapper.ts` | `mapper.test.ts` |
| Seguridad: Google → lista blanca → dispositivo | `domain/access.ts`, `app/sessionController.ts` | `access.test.ts`, `sessionController.test.ts` |
| Copia local con vencimiento de 24 h (SEC-05) | `adapters/catalog/snapshotCatalogRepository.ts` | `snapshotCatalogRepository.test.ts` |
| Perfil con foto de Google | `adapters/google/`, `ui/screens/ProfileScreen.tsx` | `googleAuthProvider.test.ts`, `App.test.tsx` |
| Compacto < 600 · fold 600–1023 · escritorio ≥ 1024 | `ui/context.tsx`, `ui/styles/app.css` | `App.test.tsx` |

---

## 7. Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): capas, rendimiento y migración a la nube.
- [`docs/SEGURIDAD_DISPOSITIVOS.md`](docs/SEGURIDAD_DISPOSITIVOS.md): modelo de seguridad, operación y despliegue del backend.
- [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md): entornos, publicación y vuelta atrás.
- [`docs/architecture/main.html`](docs/architecture/main.html): diagramas de arquitectura.
