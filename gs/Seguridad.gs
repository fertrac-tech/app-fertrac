// ============================================================
// SEGURIDAD — Identidad (SEC-01) y token de dispositivo (SEC-02)
//
// Flujo:
//   1. La app obtiene un ID token (JWT) de Google y llama ?op=sesion con
//      id_token + identidad del dispositivo (POST, nunca en la URL).
//   2. verificarIdToken_ comprueba LOCALMENTE la firma RS256 contra las llaves
//      públicas de Google (JWKS) y los claims iss, aud, exp, iat, email_verified, hd.
//   3. Si el usuario está en la lista blanca, el backend emite un TOKEN DE
//      DISPOSITIVO firmado con HMAC-SHA256 (secreto en PropertiesService), ligado
//      a correo + device_id, con vida corta y rotación.
//   4. Cada petición de datos envía ese token (st). El token NO reemplaza la
//      lista blanca: el estado del usuario y del dispositivo se evalúa en cada
//      petición, así que suspender/bloquear en la hoja corta el acceso al instante.
//
// La capa de dispositivo es un CONTROL DE GESTIÓN (docs/SEGURIDAD_DISPOSITIVOS.md):
// el token impide reutilizar un device_id copiado sin su token, y las alertas
// detectan el uso compartido, pero un equipo comprometido puede copiar ambos.
// ============================================================

const SEG_JWKS_URL        = "https://www.googleapis.com/oauth2/v3/certs";
const SEG_CACHE_JWKS      = "seg_jwks_v1";
const SEG_ISS_VALIDOS     = ["accounts.google.com", "https://accounts.google.com"];
const SEG_TOLERANCIA_SEG  = 120;           // desfase de reloj aceptado (s)
const SEG_PROP_SECRETO    = "ST_SECRET";
const SEG_PROP_SECRETO_PREV = "ST_SECRET_PREV";
const SEG_PREFIJO_TOKEN   = "st1";

// ============================================================
// UTILIDADES BINARIAS
// ============================================================

function _segB64urlABytes_(s) {
  s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Utilities.base64Decode(s);
}
function _segBytesAB64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}
function _segB64urlATexto_(s) {
  return Utilities.newBlob(_segB64urlABytes_(s)).getDataAsString("UTF-8");
}
function _segTextoAB64url_(t) {
  return _segBytesAB64url_(Utilities.newBlob(String(t)).getBytes());
}
function _segBytesAHex_(bytes) {
  let h = "";
  for (let i = 0; i < bytes.length; i++) h += ((bytes[i] + 256) % 256).toString(16).padStart(2, "0");
  return h;
}
function _segBytesABigInt_(bytes) {
  const hex = _segBytesAHex_(bytes);
  return hex ? BigInt("0x" + hex) : BigInt(0);
}
function _segModPow_(base, exp, mod) {
  let r = BigInt(1);
  const cero = BigInt(0), uno = BigInt(1), dos = BigInt(2);
  base = base % mod;
  while (exp > cero) {
    if (exp % dos === uno) r = (r * base) % mod;
    exp = exp / dos;
    base = (base * base) % mod;
  }
  return r;
}
function _segSha256Hex_(texto) {
  return _segBytesAHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto), Utilities.Charset.UTF_8));
}
// Comparación en tiempo constante (evita filtrar la firma por tiempos de respuesta).
function _segIgual_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function _segAhora_() { return Math.floor(Date.now() / 1000); }

// ============================================================
// SEC-01 · VERIFICACIÓN DEL ID TOKEN DE GOOGLE (RS256 local)
// ============================================================

// Llaves públicas de Google, cacheadas según su Cache-Control (máx. 6 h).
function obtenerJwksGoogle_(forzar) {
  const cache = CacheService.getScriptCache();
  if (!forzar) {
    const c = cache.get(SEG_CACHE_JWKS);
    if (c) { try { return JSON.parse(c); } catch (e) {} }
  }
  const res = UrlFetchApp.fetch(SEG_JWKS_URL, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error("jwks_http_" + res.getResponseCode());
  const jwks = JSON.parse(res.getContentText());
  let ttl = 3600;
  try {
    const cc = String(res.getHeaders()["Cache-Control"] || res.getHeaders()["cache-control"] || "");
    const m = /max-age=(\d+)/.exec(cc);
    if (m) ttl = Math.max(300, Math.min(21600, parseInt(m[1], 10)));
  } catch (e) {}
  cache.put(SEG_CACHE_JWKS, JSON.stringify(jwks), ttl);
  return jwks;
}

// Verifica una firma RS256 (RSASSA-PKCS1-v1_5 + SHA-256) con una JWK {n, e}.
// Apps Script no trae verificación RSA, así que se hace con BigInt:
// m = s^e mod n y se compara con el bloque EMSA-PKCS1-v1_5 esperado.
function verificarFirmaRs256_(entradaFirmada, firmaB64url, jwk) {
  const nBytes = _segB64urlABytes_(jwk.n);
  const n = _segBytesABigInt_(nBytes);
  const e = _segBytesABigInt_(_segB64urlABytes_(jwk.e));
  const sBytes = _segB64urlABytes_(firmaB64url);
  let k = nBytes.length;
  if (nBytes[0] === 0) k -= 1;                         // byte de signo en el módulo
  if (sBytes.length !== k) return false;
  const s = _segBytesABigInt_(sBytes);
  if (s >= n) return false;

  const m = _segModPow_(s, e, n).toString(16).padStart(k * 2, "0");
  const digestInfo = "3031300d060960864801650304020105000420" + _segSha256Hex_(entradaFirmada);
  const relleno = k * 2 - 6 - digestInfo.length;       // 0001 + FF… + 00 + DigestInfo
  if (relleno < 16) return false;
  const esperado = "0001" + "f".repeat(relleno) + "00" + digestInfo;
  return _segIgual_(m, esperado);
}

// Devuelve { ok:true, claims } o { ok:false, motivo }.
function verificarIdToken_(jwt) {
  const partes = String(jwt || "").split(".");
  if (partes.length !== 3) return { ok: false, motivo: "formato" };
  let header, claims;
  try {
    header = JSON.parse(_segB64urlATexto_(partes[0]));
    claims = JSON.parse(_segB64urlATexto_(partes[1]));
  } catch (e) {
    return { ok: false, motivo: "json" };
  }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, motivo: "alg" };

  // 1. Firma: se busca la llave por kid (se refrescan las llaves una vez si no aparece).
  let jwks;
  try { jwks = obtenerJwksGoogle_(false); } catch (e) { return { ok: false, motivo: "jwks_no_disponible" }; }
  let jwk = (jwks.keys || []).filter(function (k) { return k.kid === header.kid; })[0];
  if (!jwk) {
    try { jwks = obtenerJwksGoogle_(true); } catch (e) { return { ok: false, motivo: "jwks_no_disponible" }; }
    jwk = (jwks.keys || []).filter(function (k) { return k.kid === header.kid; })[0];
  }
  if (!jwk || jwk.kty !== "RSA") return { ok: false, motivo: "kid" };
  if (!verificarFirmaRs256_(partes[0] + "." + partes[1], partes[2], jwk)) return { ok: false, motivo: "firma" };

  // 2. Claims.
  const ahora = _segAhora_();
  const auds = [].concat(claims.aud || []);
  const permitidos = CONFIG.OAUTH_CLIENT_IDS || [];
  if (SEG_ISS_VALIDOS.indexOf(claims.iss) < 0) return { ok: false, motivo: "iss" };
  if (!auds.some(function (a) { return permitidos.indexOf(a) >= 0; })) return { ok: false, motivo: "aud" };
  if (!(Number(claims.exp) > ahora - SEG_TOLERANCIA_SEG)) return { ok: false, motivo: "exp" };
  if (Number(claims.iat) > ahora + SEG_TOLERANCIA_SEG) return { ok: false, motivo: "iat" };
  if (String(claims.email_verified) !== "true") return { ok: false, motivo: "email_no_verificado" };
  const dominio = String(CONFIG.DOMINIO_PERMITIDO || "").toLowerCase();
  const email = String(claims.email || "").trim().toLowerCase();
  if (String(claims.hd || "").toLowerCase() !== dominio) return { ok: false, motivo: "hd" };
  if (!email || email.slice(-(dominio.length + 1)) !== "@" + dominio) return { ok: false, motivo: "dominio" };

  return {
    ok: true,
    claims: {
      email: email,
      sub: String(claims.sub || ""),
      azp: String(claims.azp || ""),
      name: String(claims.name || email).slice(0, 120),
      picture: /^https:\/\//.test(String(claims.picture || "")) ? String(claims.picture) : ""
    }
  };
}

// ============================================================
// SEC-02 · TOKEN DE DISPOSITIVO (HMAC-SHA256)
// Formato: st1.<payload base64url>.<firma base64url>
// payload = { e: correo, d: device_id, c: canal, a: azp, iat, exp, au: inicio de sesión }
// ============================================================

function _segNuevoSecreto_() {
  const semilla = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid(), Date.now(), Math.random()].join("|");
  return _segBytesAB64url_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, semilla, Utilities.Charset.UTF_8)) +
    _segBytesAB64url_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + semilla, Utilities.Charset.UTF_8));
}

// Secreto vigente (se crea la primera vez, bajo lock para no generar dos).
function _segSecretos_() {
  const props = PropertiesService.getScriptProperties();
  let actual = props.getProperty(SEG_PROP_SECRETO);
  if (!actual) {
    const lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        actual = props.getProperty(SEG_PROP_SECRETO);
        if (!actual) { actual = _segNuevoSecreto_(); props.setProperty(SEG_PROP_SECRETO, actual); }
      } finally { lock.releaseLock(); }
    }
    if (!actual) throw new Error("secreto_no_disponible");
  }
  return { actual: actual, previo: props.getProperty(SEG_PROP_SECRETO_PREV) || "" };
}

function _segFirmar_(datos, secreto) {
  return _segBytesAB64url_(Utilities.computeHmacSha256Signature(datos, secreto, Utilities.Charset.UTF_8));
}

// Emite un token. `inicio` (au) se conserva al rotar para aplicar la vida máxima de sesión.
function emitirTokenSesion_(email, device, canal, azp, inicio) {
  const cfg = CONFIG.TOKEN_DISPOSITIVO;
  const ahora = _segAhora_();
  const au = inicio || ahora;
  const exp = Math.min(ahora + cfg.TTL_HORAS * 3600, au + cfg.SESION_MAX_DIAS * 86400);
  const payload = { v: 1, e: email, d: device, c: canal, a: azp || "", iat: ahora, exp: exp, au: au };
  const cuerpo = SEG_PREFIJO_TOKEN + "." + _segTextoAB64url_(JSON.stringify(payload));
  return { token: cuerpo + "." + _segFirmar_(cuerpo, _segSecretos_().actual), exp: exp * 1000 };
}

// Verifica firma (secreto actual o el anterior, para rotar sin cortar sesiones),
// vencimiento, vida máxima y que el device_id de la petición sea el del token.
// Devuelve { ok:true, claims } o { ok:false, motivo }.
function verificarTokenSesion_(token, device) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3 || partes[0] !== SEG_PREFIJO_TOKEN) return { ok: false, motivo: "formato" };
  const cuerpo = partes[0] + "." + partes[1];
  let secretos;
  try { secretos = _segSecretos_(); } catch (e) { return { ok: false, motivo: "secreto" }; }
  const valida = _segIgual_(_segFirmar_(cuerpo, secretos.actual), partes[2]) ||
    (!!secretos.previo && _segIgual_(_segFirmar_(cuerpo, secretos.previo), partes[2]));
  if (!valida) return { ok: false, motivo: "firma" };

  let c;
  try { c = JSON.parse(_segB64urlATexto_(partes[1])); } catch (e) { return { ok: false, motivo: "json" }; }
  const ahora = _segAhora_();
  if (!(c.exp > ahora)) return { ok: false, motivo: "exp" };
  if (!(c.au + CONFIG.TOKEN_DISPOSITIVO.SESION_MAX_DIAS * 86400 > ahora)) return { ok: false, motivo: "sesion_max" };
  if (!device || c.d !== String(device)) return { ok: false, motivo: "dispositivo" };
  return { ok: true, claims: c };
}

// Rotación deslizante: pasado ROTAR_HORAS desde la emisión, se entrega un token nuevo
// (mismo inicio de sesión). Devuelve { token, exp } o null.
function rotarTokenSiCorresponde_(claims) {
  const cfg = CONFIG.TOKEN_DISPOSITIVO;
  const ahora = _segAhora_();
  if (ahora - claims.iat < cfg.ROTAR_HORAS * 3600) return null;
  if (claims.au + cfg.SESION_MAX_DIAS * 86400 - ahora < 600) return null;   // la sesión termina: pedirá Google
  return emitirTokenSesion_(claims.e, claims.d, claims.c, claims.a, claims.au);
}

// Rotación del SECRETO: el actual pasa a "anterior" (sigue validando ≤ TTL) y se crea uno nuevo.
// Ejecutar a mano ante sospecha de filtración o dejar el disparador semanal.
// Para invalidar TODAS las sesiones de inmediato, usar revocarTodasLasSesiones().
function rotarSecretoTokens() {
  const props = PropertiesService.getScriptProperties();
  const actual = _segSecretos_().actual;
  props.setProperties({ ST_SECRET_PREV: actual, ST_SECRET: _segNuevoSecreto_() });
  registrarLog_("info", "backend", "seguridad", "Secreto de tokens rotado", "", "", "");
}
function revocarTodasLasSesiones() {
  PropertiesService.getScriptProperties().setProperties({ ST_SECRET: _segNuevoSecreto_(), ST_SECRET_PREV: "" });
  registrarLog_("warn", "backend", "seguridad", "Todas las sesiones revocadas (secreto reemplazado)", "", "", "");
}
function instalarTriggerRotacionSecreto() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "rotarSecretoTokens"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  // Semanal: el secreto anterior sigue válido 7 días ≥ TTL del token (12 h).
  ScriptApp.newTrigger("rotarSecretoTokens").timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  console.log("🔐 Rotación semanal del secreto de tokens instalada");
}

// ============================================================
// ?op=sesion — canje del ID token por el token de dispositivo
// ============================================================

// Códigos que impiden emitir el token. El resto (dispositivo pendiente, límite…)
// SÍ recibe token: las peticiones de datos devolverán el estado y la app muestra
// su pantalla (código del dispositivo, reintentar) igual que hoy.
const SEG_NIEGAN_SESION_SIEMPRE = ["no_autorizado", "acl_no_disponible"];
const SEG_NIEGAN_SESION_ENFORCE = ["usuario_suspendido", "canal_no_autorizado", "canal_no_verificado", "web_android_no_permitido", "dispositivo_bloqueado"];

function iniciarSesion_(params) {
  const v = verificarIdToken_(params.id_token);
  if (!v.ok) {
    registrarLog_("warn", "backend", "sesion", "ID token rechazado: " + v.motivo, "", "plat=" + _aclTxt_(params.plat), "");
    return jsonError_(v.motivo === "jwks_no_disponible" ? "temporalmente_ocupado" : "token_invalido");
  }
  const id = v.claims;
  const device = _aclTxt_(params.device);
  const canal = canalDeSolicitud_(params);
  if (!ACL_RE_DEVICE.test(device) || !canal) return jsonError_("dispositivo_invalido");

  // SEC-02.3 · Play Integrity (solo APK, tras el interruptor).
  if (canal === "APP" && CONFIG.PLAY_INTEGRITY.ACTIVO) {
    const pi = verificarIntegridadPlay_(params.integridad, _segRequestHash_(params.id_token));
    if (!pi.ok) {
      registrarLog_("warn", "backend", "play_integrity", "RECHAZO " + pi.motivo + " " + id.email + " …" + device.slice(-6), "", "", id.email);
      return jsonError_("canal_no_verificado");
    }
  }

  const acl = evaluarAccesoDispositivo_(id.email, id.azp, params);
  if (SEG_NIEGAN_SESION_SIEMPRE.indexOf(acl.codigo) >= 0 ||
      (CONFIG.ENFORCE_DISPOSITIVOS && SEG_NIEGAN_SESION_ENFORCE.indexOf(acl.codigo) >= 0)) {
    resolverEstadoAcl_(acl, id.email, id.azp, params);                 // deja el rastro en Log App
    return jsonError_(acl.codigo === "acl_no_disponible" ? "temporalmente_ocupado" : acl.codigo);
  }

  vigilarUsoDispositivo_(id.email, device, params, true);
  const sesion = emitirTokenSesion_(id.email, device, canal, id.azp, 0);
  return jsonRes_({ ok: true, sesion: sesion, usuario: { email: id.email, name: id.name, picture: id.picture } });
}

// requestHash de Play Integrity = SHA-256 (base64url) del ID token: liga la atestación a ESTE inicio de sesión.
function _segRequestHash_(idToken) {
  return _segBytesAB64url_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(idToken || ""), Utilities.Charset.UTF_8));
}

// ============================================================
// SEC-02.3 · PLAY INTEGRITY (APK) — apagado por defecto
// Requisitos para activar (docs/SEGURIDAD_DISPOSITIVOS.md):
//   · App registrada en Play Console y vinculada al proyecto de Google Cloud del Apps Script.
//   · Play Integrity API habilitada en ese proyecto.
//   · Scope "https://www.googleapis.com/auth/playintegrity" en appsscript.json.
//   · CERT_SHA256 con la huella SHA-256 del certificado de firma de la APK.
// ============================================================
function verificarIntegridadPlay_(tokenIntegridad, requestHashEsperado) {
  const cfg = CONFIG.PLAY_INTEGRITY;
  if (!tokenIntegridad) return { ok: false, motivo: "sin_token" };
  let v;
  try {
    const res = UrlFetchApp.fetch(
      "https://playintegrity.googleapis.com/v1/" + encodeURIComponent(cfg.PAQUETE) + ":decodeIntegrityToken",
      {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        payload: JSON.stringify({ integrity_token: String(tokenIntegridad) }),
        muteHttpExceptions: true
      }
    );
    if (res.getResponseCode() !== 200) return { ok: false, motivo: "http_" + res.getResponseCode() };
    v = JSON.parse(res.getContentText()).tokenPayloadExternal || {};
  } catch (e) {
    return { ok: false, motivo: "decode" };
  }
  const req = v.requestDetails || {}, app = v.appIntegrity || {}, disp = v.deviceIntegrity || {};
  if (req.requestPackageName !== cfg.PAQUETE) return { ok: false, motivo: "paquete_solicitud" };
  if (!_segIgual_(String(req.requestHash || ""), requestHashEsperado)) return { ok: false, motivo: "request_hash" };
  if (Math.abs(Date.now() - Number(req.timestampMillis || 0)) > cfg.MAX_EDAD_MS) return { ok: false, motivo: "vencido" };
  if (cfg.VEREDICTOS_APP.indexOf(app.appRecognitionVerdict) < 0) return { ok: false, motivo: "app_" + app.appRecognitionVerdict };
  if (app.packageName && app.packageName !== cfg.PAQUETE) return { ok: false, motivo: "paquete_app" };
  const certs = (app.certificateSha256Digest || []).map(String);
  if (!cfg.CERT_SHA256.length || !certs.some(function (c) { return cfg.CERT_SHA256.indexOf(c) >= 0; })) return { ok: false, motivo: "certificado" };
  if ((disp.deviceRecognitionVerdict || []).indexOf(cfg.EXIGIR_DISPOSITIVO) < 0) return { ok: false, motivo: "dispositivo" };
  return { ok: true };
}

// ============================================================
// SEC-02.4 · ALERTAS DE USO COMPARTIDO DEL DISPOSITIVO
// En una ventana corta, por device_id: correos distintos, huellas distintas
// (plataforma + modelo/navegador) o demasiados inicios de sesión.
// Nota: Apps Script NO expone la IP del cliente; la huella usa los datos de la
// petición. Para alertas por IP se requiere un proxy (p. ej. Cloudflare Worker).
// ============================================================
// Huella visible del dispositivo: plataforma | modelo o navegador (la declara el cliente).
function huellaDispositivo_(params) {
  return (_aclTxt_(params.plat) + "|" + _aclTxt_(params.modelo)).slice(0, 160);
}

function vigilarUsoDispositivo_(email, device, params, esInicioSesion) {
  try {
    const cfg = CONFIG.ALERTAS_DISPOSITIVO;
    const cache = CacheService.getScriptCache();
    const clave = "alr_" + _segSha256Hex_(device).slice(0, 40);
    const ahora = Date.now();
    const ventanaMs = cfg.VENTANA_MIN * 60000;
    let r = {};
    try { r = JSON.parse(cache.get(clave) || "{}"); } catch (e) {}
    const limpiar = function (obj) {
      const out = {};
      Object.keys(obj || {}).forEach(function (k) { if (ahora - obj[k] < ventanaMs) out[k] = obj[k]; });
      return out;
    };
    r.em = limpiar(r.em); r.fp = limpiar(r.fp);
    r.ses = (r.ses || []).filter(function (t) { return ahora - t < ventanaMs; });

    const huella = huellaDispositivo_(params);
    r.em[email] = ahora;
    r.fp[huella] = ahora;
    if (esInicioSesion) r.ses.push(ahora);
    cache.put(clave, JSON.stringify(r), Math.min(21600, cfg.VENTANA_MIN * 60));

    const alertas = [];
    if (Object.keys(r.em).length > 1) alertas.push(["correos_distintos", Object.keys(r.em).join(", ")]);
    if (Object.keys(r.fp).length > 1) alertas.push(["huellas_distintas", Object.keys(r.fp).join(" ; ")]);
    if (r.ses.length > cfg.MAX_SESIONES_VENTANA) alertas.push(["sesiones_excesivas", r.ses.length + " inicios en " + cfg.VENTANA_MIN + " min"]);
    alertas.forEach(function (a) { emitirAlertaDispositivo_(a[0], a[1], email, device); });
  } catch (err) {
    console.warn("vigilarUsoDispositivo_: " + err.message);      // la vigilancia nunca rompe el API
  }
}

function emitirAlertaDispositivo_(tipo, detalle, email, device) {
  const cfg = CONFIG.ALERTAS_DISPOSITIVO;
  const cache = CacheService.getScriptCache();
  const k = "alr_env_" + tipo + "_" + _segSha256Hex_(device).slice(0, 32);
  if (cache.get(k)) return;                                      // ya avisado en este periodo
  cache.put(k, "1", Math.min(21600, cfg.REENVIO_HORAS * 3600));

  const codigo = device.slice(-6).toUpperCase();
  registrarLog_("warn", "backend", "alerta_disp", "ALERTA " + tipo + " " + email + " …" + codigo, "", detalle.slice(0, 500), email);

  let bloqueado = false;
  if (cfg.AUTO_BLOQUEAR) bloqueado = bloquearDispositivoPorAlerta_(device, tipo);
  registrarAlertaEnHoja_(tipo, email, device, detalle, bloqueado ? "BLOQUEADO automáticamente" : "Pendiente de revisión");

  try {
    const asunto = "ALERTA de seguridad: dispositivo " + codigo + " (" + tipo + ")";
    const cuerpo = "Se detectó un uso anómalo de un dispositivo de la Lista de Precios.\n\n" +
      "Tipo: " + tipo + "\nUsuario: " + email + "\nCódigo del dispositivo: " + codigo +
      "\nDetalle (últimos " + cfg.VENTANA_MIN + " min): " + detalle +
      "\n\nAcción: " + (bloqueado ? "el dispositivo fue BLOQUEADO automáticamente." :
        "revise la hoja " + CONFIG.SHEET_DISPOSITIVOS + " y bloquéelo si no es un uso legítimo.");
    GmailApp.sendEmail(CONFIG.APROBADORES_DISPOSITIVOS.join(","), asunto, cuerpo);
  } catch (err) {
    console.warn("emitirAlertaDispositivo_: " + err.message);
  }
}

// Hoja ALERTAS_DISPOSITIVOS (se crea sola): una fila por alerta, con las huellas o correos detectados.
const ALERTA_COLS = ["FECHA", "TIPO", "EMAIL", "CODIGO", "DEVICE_ID", "DETALLE", "ACCION", "REVISADO_POR", "NOTA"];
function registrarAlertaEnHoja_(tipo, email, device, detalle, accion) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.ID_BASE_MOTOR);
    let sh = ss.getSheetByName(CONFIG.SHEET_ALERTAS);
    if (!sh) {
      sh = ss.insertSheet(CONFIG.SHEET_ALERTAS);
      sh.getRange(1, 1, 1, ALERTA_COLS.length).setValues([ALERTA_COLS]).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      new Date(), tipo, _aclCelda_(email, 120), device.slice(-6).toUpperCase(), _aclCelda_(device, 90),
      _aclCelda_(detalle, 1000), accion, "", ""
    ]);
  } catch (err) {
    console.warn("registrarAlertaEnHoja_: " + err.message);
  }
}

function bloquearDispositivoPorAlerta_(device, tipo) {
  try {
    const sh = hojaDispositivos_(false);
    if (!sh || sh.getLastRow() < 2) return false;
    const ids = sh.getRange(2, DC.DEVICE_ID, sh.getLastRow() - 1, 1).getValues();
    let hecho = false;
    for (let i = 0; i < ids.length; i++) {
      if (_aclTxt_(ids[i][0]) !== device) continue;
      sh.getRange(i + 2, DC.ESTADO).setValue("BLOQUEADO");
      sh.getRange(i + 2, DC.NOTA).setValue("Bloqueo automático por alerta: " + tipo + " (" + new Date().toISOString() + ")");
      hecho = true;
    }
    invalidarCacheAutorizacion_();
    return hecho;
  } catch (err) {
    console.warn("bloquearDispositivoPorAlerta_: " + err.message);
    return false;
  }
}
