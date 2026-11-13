# Lista de Precios Fertrac — v2

Rediseño de la app según el Figma "Lista de Precios Fertrac — Rediseño v2".
React + TypeScript + Vite (PWA). Funciona en GitHub Pages, dentro del APK Capacitor y en cualquier nube.

## Probar antes de producción

| Entorno | Comando | Datos | Login |
|---|---|---|---|
| Demo local | `npm install` y `npm run dev` | 4.732 productos de ejemplo | Simulado (un clic) |
| Demo compilada | `npm run preview:mock` | Igual, con el bundle real | Simulado |
| Staging | `npm run dev:staging` / `npm run build:staging` | Apps Script de pruebas (`.env.staging`) | Google real |
| Producción | `npm run build` | Apps Script productivo (`.env.production`) | Google real |

En demo, los estados de seguridad se simulan con la URL:
`/?acceso=dispositivo_pendiente`, `dispositivo_bloqueado`, `dispositivo_limite`, `no_autorizado`, `usuario_suspendido`… y `/?acceso=ok` para volver.

Cada entorno muestra una etiqueta (DEMO / STAGING) y guarda sus datos locales en una base distinta.

## Calidad

```
npm test          # 171 pruebas (dominio, adaptadores, sesión/seguridad, UI)
npm run typecheck
npm run verify    # typecheck + pruebas + build
```

Regla del proyecto: **ningún módulo entra sin su prueba**. Cada archivo de `domain/`, `adapters/` y `app/`
tiene su `*.test.ts` al lado; las pantallas se prueban en `src/ui/App.test.tsx`. El CI (`.github/workflows/ci.yml`)
ejecuta todo en cada push y pull request.

## Reglas de negocio (dónde viven)

| Regla | Módulo | Prueba |
|---|---|---|
| Orden: NUEVO con inventario → PROMO con inventario → normales → sin inventario; A–Z dentro de cada nivel | `domain/product.ts`, `domain/catalogQuery.ts` | `catalogQuery.test.ts` |
| 100 unidades por página, total y rango visibles, página en la URL (`?p=2`) | `domain/pagination.ts` | `pagination.test.ts` |
| Favoritos con alias y listas propias | `domain/favorites.ts` | `favorites.test.ts` |
| Seguridad: Google → lista blanca → dispositivo | `domain/access.ts`, `app/sessionController.ts` | `access.test.ts`, `sessionController.test.ts` |
| Perfil con foto de Google | `adapters/google/`, `ui/screens/ProfileScreen.tsx` | `googleAuthProvider.test.ts`, `App.test.tsx` |
| Compacto < 600 · fold abierto 600–1023 · escritorio ≥ 1024 | `ui/context.tsx`, `ui/styles/app.css` | `App.test.tsx` |

Ver `docs/ARQUITECTURA.md` para la arquitectura y la ruta de migración a la nube.
