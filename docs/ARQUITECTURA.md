# Arquitectura

## Capas (puertos y adaptadores)

```
src/
  domain/     Reglas de negocio puras. Sin React, sin navegador, sin backend.
  ports/      Contratos: CatalogRepository, FavoritesRepository, AuthProvider, DeviceIdentity.
  adapters/   Implementaciones: appsScript/, catalog/, storage/ (IndexedDB), google/, device/, mock/.
  app/        Casos de uso y composición: config, container, sessionController, favoritesController.
  ui/         React: layout, pantallas, componentes y tokens (1:1 con las variables de Figma).
```

Dependencias siempre hacia adentro: `ui → app → ports ← adapters`, y todos conocen `domain`.
`app/container.ts` es el único archivo que decide qué adaptador concreto se usa.

## Por qué es más rápida

- El catálogo se ordena **una vez por sincronización** (`CatalogIndex`); buscar, filtrar y paginar es un
  recorrido lineal y un `slice`. En la demo de 4.732 productos, cambiar de página toma ~0,1 s medido de punta a punta.
- Solo hay 100 filas en el DOM y el navegador omite el render de las que no se ven (`content-visibility`).
- Arranque desde la copia local en IndexedDB; el catálogo y los favoritos funcionan sin conexión.
- Miniaturas con tamaño fijo y carga diferida; esqueletos en lugar de pantalla en blanco.

## Seguridad (sin cambios de contrato)

Cada petición envía `token` + `device`, `canal`, `plat`, `modelo`, `ver` (y `so=android`), igual que la v10,
por lo que `gs/API.gs` y `gs/Autorizacion.gs` no se tocan.

- El identificador del dispositivo usa **las mismas claves que la v10** (`fertrac_device_id`), así que un
  dispositivo ya aprobado sigue aprobado si la v2 se publica en el mismo origen (`app.fertrac.com`).
- La v2 **no usa la llave de transición** (`ACCESS_KEY`): solo token de Google.
- Acceso revocado (bloqueo, suspensión, fuera de lista blanca) borra la copia local del catálogo.

## Migración a la nube

1. Publicar una API con el contrato de `CatalogRepository` (`query` paginado y ordenado en servidor,
   `get`, `getMany`, `facets`) y de `FavoritesRepository`.
2. Escribir `adapters/cloud/CloudCatalogRepository.ts` y `CloudFavoritesRepository.ts` con sus pruebas.
3. Registrarlos en `app/container.ts` según `VITE_DATA_SOURCE`. Dominio y UI no cambian.

El estado de favoritos ya lleva `version` y `updatedAt` para migrar y sincronizar los datos locales.

## Tema

Claro por defecto (no sigue al sistema). El usuario lo cambia con el botón de tema (barra superior, riel,
barra lateral, login y Perfil) y la elección se recuerda en el dispositivo.

## Pendientes y supuestos

- **Staging**: `VITE_APPS_SCRIPT_URL` está vacío a propósito. Apuntar al Apps Script productivo registraría
  dispositivos PENDIENTE reales y notificaría al aprobador; se recomienda un despliegue de pruebas.
- **Login Google real** (web con Google Identity Services y APK con el plugin de Capacitor) está cubierto con
  pruebas sobre dobles; falta validarlo contra Google en staging. El origen de staging debe agregarse a los
  "Orígenes de JavaScript autorizados" del cliente OAuth.
- **Renovación de sesión**: el token dura ~1 h. Al vencer, la app sigue con la copia local y renueva al pulsar
  "Sincronizar". Validar en staging si se requiere renovación automática como en la v10.
- **Favoritos** se guardan en el dispositivo (decisión de esta fase): no se sincronizan entre dispositivos.
- **Inventario bajo**: la etiqueta amarilla aplica con menos de 10 unidades (`LOW_STOCK_THRESHOLD`). Por validar.
- **Promoción** se determina por la columna CONDICIÓN, no por tener precio promo: contiene "PROMO" o nombra un
  color ("Magenta", "Azul"…). El color distingue cada promoción y se muestra después del inventario (`PROMO_COLORS`).
- **Política de datos**: falta la URL oficial (`VITE_PRIVACY_POLICY_URL`) y la validación jurídica del texto.
- Íconos: 12 provienen del Figma; los demás (cerrar, lápiz, papelera, carpeta, etc.) se dibujaron en el mismo
  estilo porque el plan Starter de Figma agotó su cupo de exportación.
- Analítica GA4/GTM y el registro de actividad (`?activity=`) de la v10 aún no se portaron.
