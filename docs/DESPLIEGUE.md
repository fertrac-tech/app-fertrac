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

## Corte a producción (app.fertrac.com)

`app.fertrac.com` lo sirve GitHub Pages desde `developments-fertrac/lista-precios-fertrac` (rama `main`, con `CNAME`).
Un repositorio solo puede tener un sitio de Pages y el de `app-fertrac` ya es staging, así que producción se publica
**compilada** en ese repositorio; el código fuente queda en `fertrac-tech/app-fertrac`.

### Una sola vez
1. En `lista-precios-fertrac`: crear la rama `v10-legacy` desde `main` (respaldo de la app anterior; vuelta atrás en minutos).
2. Crear un token de GitHub con permiso de escritura de contenido sobre `lista-precios-fertrac` y guardarlo en
   `app-fertrac` → Settings → Secrets → Actions como `PROD_DEPLOY_TOKEN`.
3. En `app-fertrac` crear el environment `production` (opcional: con revisores obligatorios, para que nadie publique sin aprobación).
4. Verificar en Google Cloud que `https://app.fertrac.com` sigue en los orígenes autorizados del cliente OAuth web (ya lo está para la v10).

### Cada publicación
1. Mergear `main` en `release` y hacer push. El workflow `deploy-production.yml` corre pruebas, compila con
   `.env.production` y sube `dist/` + `CNAME` a `lista-precios-fertrac/main`. Pages publica en 1–3 minutos.
2. Abrir https://app.fertrac.com en una ventana privada: sin etiqueta de entorno, login, catálogo, foto en detalle.
3. En un teléfono con la app instalada: cerrar y abrir la app; debe mostrar la v2 sin reinstalar.

### Qué pasa con la app anterior (v10)
- La web v10 deja de existir en `app.fertrac.com` en el momento del push (sus archivos se reemplazan).
- El APK instalado (`com.fertrac.listaprecios`) solo abre `https://app.fertrac.com/`, así que pasa a la v2 solo. No es
  obligatorio reinstalar; el nuevo APK 2.0.0 es opcional (mismo paquete y misma firma).
- El service worker de la v10 se reemplaza por el de la v2 (`sw.js`, mismo nombre) y se limpian sus cachés.
- Sesión: la v2 no lee `fertrac_user`/`fertrac_token` de la v10; cada usuario inicia sesión con Google una vez.
- Dispositivos: la v2 reutiliza `fertrac_device_id`, por lo que los dispositivos ya aprobados siguen aprobados.
- La llave de transición (`ACCESS_KEY`) ya no se envía. Cuando ningún cliente v10 quede activo, poner
  `CONFIG.ENFORCE_DISPOSITIVOS = true` en el Apps Script para que la llave deje de servir datos.
- Backend (Apps Script, hojas, fotos, lista blanca): sin cambios.

### Vuelta atrás
En `lista-precios-fertrac`: `git checkout main && git reset --hard v10-legacy && git push --force`. Pages vuelve a la v10 en minutos.
