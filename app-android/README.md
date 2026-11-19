# Fertrac - Lista de precios (App Android, Capacitor 8)

Contenedor Android (Capacitor) de la Lista de Precios Fertrac v2. Carga la web en `https://app.fertrac.com/`.

Proyecto reconstruido a partir del APK `app-release (1)` (v1.0, versionCode 1). Datos recuperados del APK: appId `com.fertrac.listaprecios`, nombre "Fertrac", minSdk 24 / target 36 (Capacitor 8), plugin `@codetrix-studio/capacitor-google-auth`, iconos y splash por defecto de Capacitor.

Cambio de esta version (2.0.0 / versionCode 4): el contenedor apunta a `https://app.fertrac.com/`. Con la URL anterior de GitHub Pages, Capacitor abria el navegador externo por la redireccion.

## Requisitos

- Node 22+
- Android Studio Otter (2025.2.1) o superior, con JDK 21
- El keystore con el que se firmo la v1.0 (obligatorio para actualizar encima de la app instalada)

## Instalacion y uso (Windows, en esta carpeta)

```bash
npm install --legacy-peer-deps
npm run add:android        # genera android/ y aplica versionCode 4
npm run open               # abre Android Studio
```

En Android Studio: Build -> Generate Signed App Bundle / APK -> APK -> keystore de la v1.0 -> release.

Para cada nueva version: subir `appVersion.versionCode` (y `versionName`) en `package.json` y ejecutar `npm run sync`.

## Login nativo

El `clientId` lo pasa la web en tiempo de ejecucion (`CLIENT_ID` en `js/config.js`, cliente Android). Ese cliente esta ligado a `com.fertrac.listaprecios` + SHA-1 del keystore: si se firma con otro keystore, hay que registrar el nuevo SHA-1 en Google Cloud Console.

## Scripts disponibles

- `npm run add:android`: agrega la plataforma Android y aplica la version.
- `npm run sync`: sincroniza los assets web y aplica la version.
- `npm run open`: abre el proyecto en Android Studio.
- `npm run build:release`: sincroniza, aplica version y compila el APK release.
