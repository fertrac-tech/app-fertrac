# Despliegue

## Entornos

| Entorno | URL | Origen | Backend | Cómo se publica |
|---|---|---|---|---|
| Demo local | http://localhost:5173 | `npm run dev` | Ninguno (datos de ejemplo, `.env.mock`) | Local |
| Staging local | http://localhost:5173 | `npm run dev:staging` | Apps Script de **pruebas** (`.env.staging`) | Local |
| **Producción** | https://app.fertrac.com | rama `main` de `fertrac-tech/app-fertrac` | Apps Script productivo (`.env.production`) | **Automático** con `.github/workflows/deploy.yml` |

> ⚠️ **Un push a `main` publica en producción.** Antes de hacer push, valida en local con `npm run verify` y prueba la demo o el staging local.

El staging publicado en `https://fertrac-tech.github.io/app-fertrac/` está **retirado**. Un repositorio tiene un solo sitio de Pages, y ese sitio ahora es `app.fertrac.com`. Los workflows `deploy-staging.yml` y `deploy-production.yml` quedan solo como manuales, con un `echo` que lo indica.

## Workflows (GitHub Actions)

| Workflow | Disparo | Qué hace |
|---|---|---|
| `ci.yml` | push a `main` / `develop`, pull requests | typecheck, pruebas y build |
| `deploy.yml` | push a `main`, manual | `npm ci` → typecheck → pruebas → `npm run build` (`.env.production`) → `dist/CNAME = app.fertrac.com` → GitHub Pages |
| `deploy-staging.yml`, `deploy-production.yml` | Solo manual | Retirados (no hacen nada) |

## Configuración del repositorio (una sola vez)

1. **Pages:** Settings → Pages → Source: *GitHub Actions*. El dominio personalizado es `app.fertrac.com`.
2. **Variables:** Settings → Secrets and variables → Actions → *Variables*:
   - `PRIVACY_POLICY_URL`: URL de la política de datos, cuando exista.
3. **Google Cloud Console:** en el cliente OAuth web, `https://app.fertrac.com` debe estar en *Orígenes de JavaScript autorizados*. Para el staging local, agrega también `http://localhost:5173`.

## Staging local con datos reales

1. Crea una **copia** de BASE MOTOR y publica un despliegue de Apps Script que la lea. No uses el productivo: registraría dispositivos PENDIENTE reales y le llegarían correos al aprobador.
2. Pon su URL `/exec` en `VITE_APPS_SCRIPT_URL` de `.env.staging` (no la subas al repositorio si es sensible).
3. En la copia de la hoja, deja ACTIVOS a los usuarios de prueba.
4. Ejecuta `npm run dev:staging`. La app muestra la etiqueta STAGING.

Si falta la URL del backend o el cliente de Google, `readConfig` hace fallar el build a propósito.

## Backend (Apps Script)

El código de `gs/` **no** se publica con GitHub. Se copia al proyecto de Apps Script, y el orden de la publicación está en [`SEGURIDAD_DISPOSITIVOS.md` §5 y §9](SEGURIDAD_DISPOSITIVOS.md). En resumen:

1. Copia o reemplaza los archivos `.gs` cambiados.
2. Ejecuta las funciones de instalación que correspondan: `instalarTriggers()`, `instalarTriggerAutorizacion()`, `instalarTriggerRotacionSecreto()` y `prepararHojasAutorizacion()`.
3. Ve a **Implementar → Gestionar implementaciones → editar la implementación actual → Versión: nueva**. Así se conserva la URL `/exec`.

Si un cambio afecta a los dos lados, el orden importa y lo indica cada cambio. Por ejemplo, la solicitud de acceso automática exigía publicar **primero el frontend**.

## Checklist de cada publicación

- [ ] `npm run verify` en verde, en local.
- [ ] Push a `main` y workflow `deploy.yml` en verde.
- [ ] Abrir https://app.fertrac.com en una ventana privada: sin etiqueta de entorno, login con Google, catálogo, foto en el detalle.
- [ ] En un teléfono con la APK: cerrar y abrir la app. Debe mostrar la versión nueva sin reinstalar (el service worker se actualiza solo).
- [ ] Si cambió el backend: nueva versión publicada en la implementación actual de Apps Script.

## APK Android

- El APK (`com.fertrac.listaprecios`) carga `https://app.fertrac.com/`, así que cada publicación web le llega sin reinstalar.
- Se instala a mano (no está en Play Console). Un APK nuevo solo hace falta si cambia la parte nativa (plugins, Play Integrity). Mantén el mismo paquete y el mismo keystore de firma.

## Compatibilidad con la v10

- **Sesión:** la v2 no lee `fertrac_user` ni `fertrac_token` de la v10. Cada usuario inicia sesión con Google una vez.
- **Dispositivos:** la v2 reutiliza `fertrac_device_id`, así que los dispositivos ya aprobados siguen aprobados.
- **Llave de transición:** la v2 no envía `ACCESS_KEY`, y la llave pública está retirada en el backend.
- **Service worker:** el de la v2 reemplaza al de la v10 y limpia sus cachés.

## Vuelta atrás

- **A una versión anterior de la v2:** revierte el commit en `main` (`git revert <commit> && git push`). `deploy.yml` vuelve a publicar en 1–3 minutos.
- **Backend:** en Apps Script, ve a Gestionar implementaciones y selecciona la versión anterior en la implementación actual.
- **A la v10 (solo emergencia):** reasigna el dominio `app.fertrac.com` en Pages al repositorio `lista-precios-fertrac` (respaldo `v10-legacy`, si se creó) y quítalo de `app-fertrac`. Confirma antes que ese respaldo exista.
