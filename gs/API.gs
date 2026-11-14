// ============================================================
// API CATÁLOGO — doGet (sirve datos e imágenes a la app)
// Fase 1: acepta LLAVE (transición) o TOKEN verificado + autorizados
// Optimizaciones de latencia:
//   - verificación de token cacheada (evita la llamada HTTP a Google
//     en cada request; se valida una vez por token).
//   - datos de Hoja2 cacheados en CacheService (TTL corto) para no
//     releer la hoja entera en cada request.
// ============================================================

// Claves de caché (CacheService) y TTL.
const API_CACHE_VERIF = "api_verif_";        // prefijo + hash(token) → email
const API_CACHE_LISTA = "api_lista_datos";   // JSON de Hoja2
const API_TTL_LISTA  = 90;                   // segundos de vigencia de Hoja2
const API_TTL_VERIF  = 1500;                 // segundos (25 min) de vigencia del token

// GET: compatibilidad (clientes en caché). POST: canal recomendado — las
// credenciales viajan en el cuerpo (text/plain, sin preflight CORS) y no quedan
// en URLs, logs de ejecución ni proxies (SEC-03).
function doGet(e) {
  return manejarPeticion_((e && e.parameter) || {});
}

function doPost(e) {
  let cuerpo = {};
  try {
    const raw = e && e.postData && e.postData.contents;
    if (raw) cuerpo = JSON.parse(raw);
  } catch (err) {
    return jsonError_("respuesta_invalida");
  }
  const params = {};
  const copiar = function (o) {
    Object.keys(o || {}).forEach(function (k) {
      const v = o[k];
      if (v !== null && v !== undefined && typeof v !== "object") params[k] = String(v);
    });
  };
  copiar(e && e.parameter);
  copiar(cuerpo);                                         // el cuerpo manda sobre la URL
  return manejarPeticion_(params);
}

function manejarPeticion_(params) {

  // ── 0. Log de errores de la app (?log=1) ──
  // Va ANTES de la autorización a propósito; logDesdeApi_ exige su propia credencial.
  if (params.log === "1") {
    return logDesdeApi_(params);
  }

  // ── 0b. Canje del ID token de Google por el token de dispositivo (SEC-01/SEC-02) ──
  if (params.op === "sesion") {
    return iniciarSesion_(params);
  }

  // ── 1. Autorización ──
  // estado: 'ok' | 'token_invalido' | 'no_autorizado' | 'sin_credenciales' | 'token_requerido'
  // Con lista blanca (gs/Autorizacion.gs) además: 'usuario_suspendido' |
  // 'canal_no_autorizado' | 'dispositivo_pendiente' | 'dispositivo_bloqueado' |
  // 'dispositivo_limite' | ... — solo si CONFIG.ENFORCE_DISPOSITIVOS = true.
  let estado;
  let emailToken = null;                                // correo VERIFICADO (no el del query)
  let sesionRotada = null;                              // token nuevo para la app (rotación)
  if (params.st) {
    // Ruta principal: token de dispositivo firmado (ligado a correo + device_id).
    const ts = verificarTokenSesion_(params.st, params.device);
    if (!ts.ok) {
      estado = 'token_invalido';                        // vencido/alterado → la app renueva con Google
    } else {
      emailToken = ts.claims.e;
      const acl = evaluarAccesoDispositivo_(ts.claims.e, ts.claims.a, params);
      estado = resolverEstadoAcl_(acl, ts.claims.e, ts.claims.a, params);
      vigilarUsoDispositivo_(ts.claims.e, ts.claims.d, params, false);
      if (estado === 'ok') sesionRotada = rotarTokenSiCorresponde_(ts.claims);
    }
  } else if (params.token && CONFIG.ACEPTAR_ACCESS_TOKEN_LEGADO) {
    // TRANSICIÓN: access token de Google (clientes en caché). Exige azp/aud de Fertrac.
    const info = verificarTokenInfoCacheada_(params.token);
    if (!info) {
      estado = 'token_invalido';
    } else {
      emailToken = info.email;
      const acl = evaluarAccesoDispositivo_(info.email, info.azp, params);
      estado = resolverEstadoAcl_(acl, info.email, info.azp, params);
    }
  } else if (params.token) {
    estado = 'token_invalido';                          // legado apagado: fuerza el nuevo inicio de sesión
  } else if (params.key) {
    estado = 'token_requerido';                         // llave pública RETIRADA (ver docs/SEGURIDAD_DISPOSITIVOS.md)
  } else {
    estado = 'sin_credenciales';
  }

  if (estado !== 'ok') {
    return jsonError_(estado);
  }
  const conSesion = function (obj) {
    if (sesionRotada) obj.sesion = sesionRotada;
    return obj;
  };

  // ── 2. Imagen: ?img=FILE_ID ──
  // Render: se devuelve la URL pública de la miniatura de Drive (thumbnail),
  // NO el binario en base64. La app la usa directo en <img src>, evitando
  // la serialización binaria por el proxy (es lo que acelera la carga).
  // Los archivos ya son de lectura pública (ANYPONE_WITH_LINK), por lo que
  // el navegador puede descargarlos sin pasar por Apps Script.
  if (params.img) {
    try {
      const file = DriveApp.getFileById(params.img);
      const zoom = (params.sz && /^\d{2,4}$/.test(params.sz)) ? params.sz : "w800";
      // thumbnail?id=FILE_ID&sz=w800 → miniatura generada por Google
      return jsonRes_({
        ok: true,
        kind: "thumbnail",
        url: "https://drive.google.com/thumbnail?id=" + encodeURIComponent(params.img) + "&sz=" + zoom
      });
    } catch (err) {
      return jsonRes_({ ok: false, error: "img_no_disponible" });
    }
  }

  // ── 3. Catálogo de fotos: ?fotos=1 ──
  // Se sirve el mapa {referencia: driveUrl} desde CacheService (rápido, no
  // relee la CACHE sheet en cada request). Es un cache INDEPENDIENTE del de
  // datos: su invalidación no afecta el tiempo de sincronización de precios.
  if (params.fotos) {
    return jsonRes_(conSesion({
      ok: true,
      fotos: obtenerUrlsFotosCache_()
    }));
  }

  // ── 4. Actividad de sesión: ?activity=login|heartbeat|end|inactive ──
  // Registra en ACTIVIDAD_USUARIOS cada evento de sesión de la app. El
  // heartbeat se mama con CacheService (1 log por usuario/hora) para no
  // llenar la hoja con un registro por minuto. No expone datos: solo FECHA,
  // EMAIL, PLATAFORMA y TIPO.
  if (params.activity) {
    const tipo = ["login", "heartbeat", "end", "inactive"].includes(params.activity)
      ? params.activity : null;
    if (!tipo) return jsonError_('actividad_invalida');
    registrarActividad_(emailToken, tipo, params.platform);   // solo el correo VERIFICADO (nunca el del query)
    return jsonRes_({ ok: true });
  }

  // ── 5. Reporte de inactivos: ?report=inactivos&dias=N ──
  // Devuelve la lista de usuarios sin actividad en los últimos N días (N por
  // defecto = CONFIG.REPORTE_DIAS_INACTIVOS). La hoja ACTIVIDAD_USUARIOS
  // se crea sola la primera vez.
  if (params.report === "inactivos") {
    const dias = parseInt(params.dias, 10) || CONFIG.REPORTE_DIAS_INACTIVOS;
    return jsonRes_({ ok: true, inactivos: usuariosInactivos_(dias) });
  }

  // ── 6. Datos incrementales: ?delta=1&since=ISO ──
  // Devuelve solo las filas modificadas después de `since`. La marca W
  // (col 23) la actualiza cada sync (diurna y completa) así que sirve de
  // reloj de cambios. `since` vacío → respuesta completa (primera vez).
  // La respuesta firma `since` = mayor W visto para que el cliente lo
  // reenvíe en la siguiente llamada sin perder filas.
  if (params.delta === "1") {
    const resDatos = obtenerDatosListaCacheados_();
    if (!resDatos.ok) return jsonError_(resDatos.error || 'error');
    return jsonRes_(conSesion(filtrarDelta_(resDatos.data, params.since)));
  }

  // ── 7. Datos del catálogo: { data: [...] } ──
  // Se sirve de cache cuando está vigente (rápido). Si caducó, se lee la hoja
  // bajo lock (para evitar un estado a medias) y se repuebla el caché.
  const resDatos = obtenerDatosListaCacheados_();
  if (!resDatos.ok) return jsonError_(resDatos.error || 'error');
  return ContentService
    .createTextOutput(JSON.stringify(conSesion({ data: resDatos.data })))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Lee el catálogo completo de Hoja2 (con caché + lock) ──
// Devuelve { ok: true, data: [...] } o { ok: false, error: '...' }.
function obtenerDatosListaCacheados_() {
  const cache = CacheService.getScriptCache();
  const jsonCache = cacheGetGrande_(cache, API_CACHE_LISTA);
  if (jsonCache) {
    try { return { ok: true, data: JSON.parse(jsonCache).data || [] }; } catch (e) {}
  }

  // ⚠️ LOCK GLOBAL (docs/LOCK_APPS_SCRIPT.md): la API comparte el MISMO lock
  // que las sync/fotos. Si una de ellas lo sostiene, este READ responde
  // 'temporalmente_ocupado' en ≤1.8s y la app reintenta (espera breve, única
  // del sistema: no se lee a medias).
  const lock = LockService.getScriptLock();
  let tieneLock = false;

  try {
    // Intento rápido. Si el lock está ocupado por una sync en curso, se
    // responde 'temporalmente_ocupado' casi de inmediato (máx ~1.8s) para que
    // el frontend reintente al instante, en lugar de dejar al usuario esperando
    // ~8s. La lectura a medias se evita igual: no se lee sin lock.
    if (!lock.tryLock(1500)) return { ok: false, error: 'temporalmente_ocupado' };
    tieneLock = true;

    // Doble chequeo: quizá otra invocación pobló el caché mientras esperábamos.
    const jsonAhora = cacheGetGrande_(cache, API_CACHE_LISTA);
    if (jsonAhora) {
      try { return { ok: true, data: JSON.parse(jsonAhora).data || [] }; } catch (e) {}
    }

    const sh = SpreadsheetApp.openById(CONFIG.ID_BASE_MOTOR).getSheetByName(CONFIG.SHEET_MOTOR);
    const values = sh.getDataRange().getValues();       // incluye fila 1 (encabezado)
    cachePutGrande_(cache, API_CACHE_LISTA, JSON.stringify({ data: values }), API_TTL_LISTA); // repoblar caché
    return { ok: true, data: values };

  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (tieneLock) lock.releaseLock();
  }
}

// ── Filtra filas modificadas después de `since` (col W = 22 en 0-based) ──
// Devuelve:
//   rows — filas con W posterior a `since`; si `since` es vacío, todas.
//   refs — lista COMPLETA de refs vigentes. El cliente la usa para detectar
//          borrados (un ref que teníamos y que ya no está en `refs`).
// `since` devuelto = máximo W visto; el cliente lo reenvía: así ninguna fila
// modificada en el mismo segundo se pierde (si el W máximo se reenvía, se
// re-descarga al siguiente ciclo sin consecuencia).
function filtrarDelta_(values, since) {
  const W = 22; // columna 23 (W) en índice 0-based
  const sinceTs = since ? Date.parse(since) : 0;
  const primerVez = !since || Number.isNaN(sinceTs) || since === "0" || sinceTs <= 0;

  let maxTs = 0;
  const rows = [];
  const refs = [];

  (values || []).forEach((row, i) => {
    if (i === 0) return;                                  // encabezado
    const ref = String(row[0] || "").trim().toUpperCase();
    if (!ref) return;

    refs.push(ref);

    let ts = 0;
    const wVal = row[W];
    if (wVal instanceof Date) {
      ts = wVal.getTime();
    } else if (typeof wVal === "string" && wVal.trim()) {
      const p = Date.parse(wVal);
      if (!Number.isNaN(p)) ts = p;
    }

    if (ts > maxTs) maxTs = ts;
    if (primerVez || ts > sinceTs) rows.push(row);
  });

  const nuevoSince = maxTs > 0
    ? new Date(maxTs).toISOString()
    : new Date().toISOString();

  return { ok: true, delta: true, since: nuevoSince, refs, rows };
}

// Respuesta de error estándar en JSON.
function jsonError_(codigo) {
  return ContentService
    .createTextOutput(JSON.stringify({ error: codigo }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Respuesta JSON exitosa de alto nivel.
function jsonRes_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Verifica el token con Google, cacheando el resultado por token.
// Devuelve el correo (minúsculas) o null si es inválido. Se conserva para
// Log.gs; la lógica vive en verificarTokenInfoCacheada_.
function verificarTokenCacheada_(token) {
  const info = verificarTokenInfoCacheada_(token);
  return info ? info.email : null;
}

// Devuelve { email, azp } o null. SOLO para la ruta de transición (access token).
// SEC-01: el token debe haber sido emitido para un cliente OAuth de Fertrac
// (azp/aud ∈ CONFIG.OAUTH_AZP_LEGADO) y del dominio permitido. Se eliminó el
// respaldo por userinfo: no permite verificar para qué aplicación se emitió el token.
// UNA llamada externa por token; TTL = min(API_TTL_VERIF, vida restante).
const API_CACHE_VERIF2 = "api_verif3_";
function verificarTokenInfoCacheada_(token) {
  const cache = CacheService.getScriptCache();
  const key = API_CACHE_VERIF2 + _segSha256Hex_(token).slice(0, 48);

  const cacheado = cache.get(key);
  if (cacheado !== null) {
    if (cacheado === "null") return null;
    try { return JSON.parse(cacheado); } catch (e) {}
  }

  let info = null;
  let ttl = API_TTL_VERIF;
  try {
    const r1 = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    if (r1.getResponseCode() === 200) {
      const t = JSON.parse(r1.getContentText());
      const vida = parseInt(t.expires_in, 10);
      if (vida > 0) ttl = Math.max(60, Math.min(API_TTL_VERIF, vida));
      const permitidos = CONFIG.OAUTH_AZP_LEGADO || [];
      const azp = String(t.azp || ""), aud = String(t.aud || "");
      const email = String(t.email || "").trim().toLowerCase();
      const dominio = "@" + String(CONFIG.DOMINIO_PERMITIDO || "").toLowerCase();
      const clienteOk = permitidos.indexOf(azp) >= 0 || permitidos.indexOf(aud) >= 0;
      if (clienteOk && email && String(t.email_verified) === "true" && email.slice(-dominio.length) === dominio) {
        info = { email: email, azp: azp };
      } else if (!clienteOk) {
        registrarLog_("warn", "backend", "token", "Access token de cliente no permitido azp=" + azp, "", "", email);
      }
    }
  } catch (err) {
    info = null;
  }
  cache.put(key, info === null ? "null" : JSON.stringify(info), ttl);
  return info;
}

// ¿El correo está en la hoja USUARIOS AUTORIZADOS (columna A, desde fila 2)?
// Ahora sale de la matriz cacheada de gs/Autorizacion.gs (antes leía la hoja
// en cada request). Se conserva la firma por compatibilidad.
function estaAutorizado_(idSpreadsheet, nombreHoja, email) {
  return usuarioEnLista_(email);
}

// ── Invalida la caché del catálogo tras una sync completa ──
// Para que la app vea los precios nuevos sin esperar el TTL.
// También invalida el caché de URLs de fotos (independiente), para que
// el frontend vea fotos nuevas sin esperar su TTL.
function invalidarCacheCatalogo_() {
  try { cacheRemoveGrande_(CacheService.getScriptCache(), API_CACHE_LISTA); } catch (e) {}
  try { invalidarCacheFotos_(); } catch (e) {}
}

// ============================================================
// CACHÉ GRANDE — CacheService limita cada valor a 100 KB
// ("Argumento demasiado grande: value"). Estos helpers parten el texto en
// fragmentos y guardan en la clave principal un índice "__chunks:N".
// Un fallo de caché NUNCA rompe la respuesta: solo se pierde la aceleración.
// ============================================================
const CACHE_CHUNK_CHARS = 30000;   // 30k chars ≤ 90 KB aun con UTF-8 de 3 bytes
const CACHE_MAX_CHUNKS  = 300;     // CacheService guarda máx. 1.000 ítems (expulsa hasta 900):
                                   // más de ~9 MB no se cachea para no desplazar tokens/heartbeats.

function cachePutGrande_(cache, key, str, ttl) {
  try {
    const n = Math.max(1, Math.ceil(str.length / CACHE_CHUNK_CHARS));
    if (n > CACHE_MAX_CHUNKS) {
      console.warn("cachePutGrande_(" + key + ") omitido: " + n + " fragmentos > " + CACHE_MAX_CHUNKS);
      return false;
    }
    const obj = {};
    for (let i = 0; i < n; i++) {
      obj[key + "_" + i] = str.substr(i * CACHE_CHUNK_CHARS, CACHE_CHUNK_CHARS);
    }
    obj[key] = "__chunks:" + n;
    cache.putAll(obj, ttl);
    return true;
  } catch (e) {
    console.warn("cachePutGrande_(" + key + ") omitido: " + e.message);
    return false;
  }
}

function cacheGetGrande_(cache, key) {
  try {
    const idx = cache.get(key);
    if (idx === null) return null;
    if (idx.indexOf("__chunks:") !== 0) return idx;          // valor legado (sin fragmentar)
    const n = parseInt(idx.slice(9), 10);
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + "_" + i);
    const partes = cache.getAll(keys);
    let out = "";
    for (let i = 0; i < n; i++) {
      const p = partes[keys[i]];
      if (p === undefined || p === null) return null;       // fragmento expulsado → recalcular
      out += p;
    }
    return out;
  } catch (e) {
    return null;
  }
}

function cacheRemoveGrande_(cache, key) {
  try {
    const idx = cache.get(key);
    const keys = [key];
    if (idx && idx.indexOf("__chunks:") === 0) {
      const n = parseInt(idx.slice(9), 10);
      for (let i = 0; i < n; i++) keys.push(key + "_" + i);
    }
    cache.removeAll(keys);
  } catch (e) {}
}
