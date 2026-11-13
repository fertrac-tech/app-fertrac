# Despliegue

## Entornos

| Entorno | URL | Rama | Backend | Cómo se publica |
|---|---|---|---|---|
| Staging | https://fertrac-tech.github.io/app-fertrac/ | `main` | Apps Script de pruebas (copia de la hoja) | Automático con `.github/workflows/deploy-staging.yml` |
| Producción | https://app.fertrac.com | `release` del repo `lista-precios-fertrac` | Apps Script productivo | Manual, tras el piloto |

## Primera vez (staging)

1. **Repo** `fertrac-tech/app-fertrac`: subir esta carpeta a `main`.
2. **GitHub Pages**: Settings → Pages → Source: *GitHub Actions*.
3. **Variables** (Settings → Secrets and variables → Actions → *Variables*):
   - `STAGING_APPS_SCRIPT_URL`: URL `/exec` de un despliegue de Apps Script que lea una **copia** de la hoja.
     No usar el productivo: registraría dispositivos PENDIENTE reales y avisaría al aprobador.
   - `STAGING_GOOGLE_CLIENT_ID`: el cliente OAuth web actual (`13363096447-…`).
   - `PRIVACY_POLICY_URL`: cuando exista.
4. **Google Cloud Console** → cliente OAuth web → *Orígenes de JavaScript autorizados*: agregar
   `https://fertrac-tech.github.io`. Sin esto el login de Google falla en staging.
5. **Lista blanca de pruebas**: en la copia de la hoja, dejar a los usuarios del piloto como ACTIVOS.

El primer push a `main` ejecuta pruebas, build y publica. Mientras falten las variables, el build falla
a propósito (`readConfig` exige la URL del backend y el cliente de Google).

## Checklist antes de producción

- [ ] Login Google en navegador, PWA instalada y APK (el APK carga la web del mismo origen).
- [ ] Usuario fuera de la lista blanca → pantalla "Cuenta sin acceso".
- [ ] Dispositivo nuevo → PENDIENTE → aprobación en la hoja → "Reintentar" entra sin cerrar sesión.
- [ ] Dispositivo bloqueado → bloqueo y borrado de la copia local.
- [ ] Catálogo completo sincroniza en < 5 s con datos reales; orden y paginación correctos.
- [ ] Favoritos sobreviven a cerrar y abrir la app.
- [ ] Sin conexión: abre con la copia local y muestra el aviso.
- [ ] Modo oscuro, fold abierto/cerrado y escritorio revisados por el equipo.
- [ ] URL de la política de datos definida y texto validado por jurídica.

## Corte a producción

1. Etiquetar la versión (`package.json` → `11.0.0`) y mergear a `release`.
2. `npm run build` con `.env.production` y publicar `dist/` en `app.fertrac.com` (mismo origen que la v10:
   los dispositivos aprobados se conservan).
3. Conservar la v10 en una rama (`v10-legacy`) para volver atrás en minutos si hace falta.
4. Después del corte: `ENFORCE_REVOCACION`/llave de transición dejan de usarse; la v2 solo envía token.
