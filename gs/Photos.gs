// ============================================================
// PHOTOS — Extracción de URLs de imágenes y gestión de CACHE_
// ============================================================
// CACHE_:
//   A = REFERENCIA
//   B = FOTO_URL_LISTAS      (URL original de LISTA DE PRECIOS)
//   C = FOTO_URL_DRIVE       (URL del archivo en Drive tras descarga)
//   D = FECHA_ACTUALIZACION
//   E = ERROR                (200 = OK, 1 = falló la descarga)
//   F = ERROR_DETALLE        (descripción del error)
// ============================================================

const CACHE_COL_REF       = 1;
const CACHE_TOTAL_COLS    = 6;
const BITACORA_TOTAL_COLS = 5;
const FOTOS_MAX_REINTENTOS = 2;
const FOTOS_BATCH_SIZE     = 20;

/**
 * Punto de entrada único para sincronizar fotos nuevas desde LISTA DE PRECIOS.
 */
function sincronizarFotos() {
  console.log("🔁 sincronizarFotos — sincronizando referencias nuevas");
  _sincronizarNuevasReferencias_();
  console.log("✅ sincronizarFotos — ciclo completo finalizado");
}

/**
 * Extrae la URL de una celda con imagen.
 * @param {*} valor Valor de la celda (CellImage, fórmula IMAGE, URL string, etc.).
 * @return {string} URL extraída o "" si no se pudo identificar.
 */
function obtenerUrlImagen(valor) {
  if (!valor) return "";

  if (typeof valor === "object" && typeof valor.getContentUrl === "function") {
    try {
      const url = valor.getContentUrl();
      if (url && url.indexOf("http") === 0) return url;
    } catch (e) {}
  }

  if (typeof valor === "object" && typeof valor.getUrl === "function") {
    try {
      const url = valor.getUrl();
      if (url && url.indexOf("http") === 0) return url;
    } catch (e) {}
  }

  if (typeof valor === "string") {
    if (valor.indexOf("http") === 0) return valor;
    if (valor.indexOf("=") === 0) {
      const match = valor.match(/=IMAGE\s*\(\s*["']([^"']+)["']/i);
      if (match) return match[1];
    }
  }

  return "";
}

/**
 * Sincroniza en lote las referencias de LISTA DE PRECIOS que aún no están en CACHE_.
 * Respeta CONFIG.FOTOS_MAX_MS para evitar timeouts de Apps Script y persiste
 * resultados en lotes (y en finally) para no dejar filas incompletas.
 */
function _sincronizarNuevasReferencias_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) {
    console.log("🔒 Lock en uso — omitiendo");
    return;
  }

  const inicioMs = Date.now();
  const maxMs = CONFIG.FOTOS_MAX_MS || 240000;
  const bufferCache = [];
  const bufferBitacora = [];
  let shCache = null;
  let shBitacora = null;

  try {
    const ssLista = SpreadsheetApp.openById(CONFIG.ID_LISTA_PRECIOS);
    const shLista = ssLista.getSheetByName(CONFIG.SHEET_LISTA);
    if (!shLista) {
      throw new Error('Hoja "' + CONFIG.SHEET_LISTA + '" no encontrada en LISTA DE PRECIOS');
    }

    const ssMotor = SpreadsheetApp.openById(CONFIG.ID_BASE_MOTOR);
    shCache = _obtenerOCrearCache_(ssMotor);
    shBitacora = _obtenerOCrearBitacora_(ssMotor);

    const cacheRefs = _leerReferenciasCache_(shCache);
    console.log("📋 Referencias en CACHE: " + cacheRefs.size);

    const { pendientes, yaEnCache, sinImg } = _recolectarPendientesLista_(shLista, cacheRefs);
    if (pendientes.length === 0) {
      console.log("📈 Sin fotos nuevas por procesar | Sin URL: " + sinImg + " | Ya en CACHE: " + yaEnCache);
      return;
    }

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    let agregadas = 0;
    let conError = 0;
    let detenidaPorTiempo = false;

    for (let i = 0; i < pendientes.length; i++) {
      if (Date.now() - inicioMs >= maxMs) {
        detenidaPorTiempo = true;
        console.warn("⏱️ Límite de tiempo alcanzado (" + Math.round(maxMs / 1000) + "s). Procesadas " + i + "/" + pendientes.length);
        break;
      }

      const { ref, url } = pendientes[i];
      console.log("🆕 " + ref + " — registrando foto (" + (i + 1) + "/" + pendientes.length + ")");

      const res = _procesarFotoReferencia_(ref, url, folder);
      const ahora = new Date();

      if (res.ok) {
        bufferCache.push([ref, url, res.driveUrl, ahora, 200, ""]);
        bufferBitacora.push([ahora, ref, "OK", res.metodo, res.intento]);
        agregadas++;
      } else {
        bufferCache.push([ref, url, "", ahora, 1, res.detalle]);
        bufferBitacora.push([ahora, ref, "ERROR", res.detalle, String(FOTOS_MAX_REINTENTOS)]);
        conError++;
      }

      if (bufferCache.length >= FOTOS_BATCH_SIZE) {
        _flushBuffersFotos_(shCache, shBitacora, bufferCache, bufferBitacora);
      }
    }

    console.log(
      "📈 Nuevas sincronizadas | Completadas: " + agregadas +
      " | Con error: " + conError +
      " | Sin URL: " + sinImg +
      " | Ya en CACHE: " + yaEnCache +
      (detenidaPorTiempo ? " | Pausado por tiempo" : "")
    );
  } catch (err) {
    console.error("❌ Error en _sincronizarNuevasReferencias_: " + err.message);
    try {
      registrarLog_("error", "backend", "fotos", err.message, err.stack || "", "", "");
    } catch (eLog) {}
  } finally {
    if (shCache && shBitacora) {
      _flushBuffersFotos_(shCache, shBitacora, bufferCache, bufferBitacora);
    }
    lock.releaseLock();
  }
}

/**
 * Lee las referencias ya registradas en CACHE_.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} shCache
 * @return {Set<string>}
 */
function _leerReferenciasCache_(shCache) {
  const cacheRefs = new Set();
  const cacheLast = shCache.getLastRow();
  if (cacheLast <= 1) return cacheRefs;

  const valores = shCache.getRange(2, CACHE_COL_REF, cacheLast - 1, 1).getDisplayValues();
  for (let i = 0; i < valores.length; i++) {
    const ref = String(valores[i][0] || "").trim().toUpperCase();
    if (ref) cacheRefs.add(ref);
  }
  return cacheRefs;
}

/**
 * Lee LISTA DE PRECIOS y filtra las referencias nuevas que tienen URL de imagen.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} shLista
 * @param {Set<string>} cacheRefs
 * @return {{pendientes: Array<{ref: string, url: string}>, yaEnCache: number, sinImg: number}}
 */
function _recolectarPendientesLista_(shLista, cacheRefs) {
  const filaInicio = CONFIG.LISTA_DATA_ROW;
  const totalRows = shLista.getLastRow() - filaInicio + 1;
  if (totalRows <= 0) {
    console.log("⚠️ LISTA DE PRECIOS vacía");
    return { pendientes: [], yaEnCache: 0, sinImg: 0 };
  }

  console.log("📥 Leyendo " + totalRows + " filas de LISTA DE PRECIOS...");
  const refsLista = shLista.getRange(filaInicio, CONFIG.LISTA_COL_REF, totalRows, 1).getDisplayValues();
  const imgsLista = shLista.getRange(filaInicio, CONFIG.LISTA_COL_IMG, totalRows, 1).getValues();

  const tratadas = new Set();
  const pendientes = [];
  let yaEnCache = 0;
  let sinImg = 0;

  for (let j = 0; j < refsLista.length; j++) {
    const ref = String(refsLista[j][0] || "").trim().toUpperCase();
    if (!ref || tratadas.has(ref)) continue;
    if (cacheRefs.has(ref)) {
      yaEnCache++;
      continue;
    }
    if (!imgsLista[j][0]) {
      sinImg++;
      continue;
    }

    tratadas.add(ref);
    const url = obtenerUrlImagen(imgsLista[j][0]);
    if (!url) {
      sinImg++;
      console.log("⚠️ " + ref + " — sin URL extraíble, NO se agrega");
      continue;
    }
    pendientes.push({ ref, url });
  }

  return { pendientes, yaEnCache, sinImg };
}

/**
 * Descarga, valida y guarda en Drive la foto de una referencia con reintentos.
 * @param {string} ref
 * @param {string} url
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @return {{ok: boolean, driveUrl: string, metodo: string, intento: string, detalle: string}}
 */
function _procesarFotoReferencia_(ref, url, folder) {
  const minBytes = (CONFIG.FOTOS_MIN_KB || 10) * 1024;
  let ultimoDetalle = "";

  for (let intento = 1; intento <= FOTOS_MAX_REINTENTOS; intento++) {
    const resultado = _descargarWebp_(url, ref + ".webp");
    if (!resultado.ok) {
      ultimoDetalle = resultado.detalle;
      console.log("🔄 " + ref + " intento " + intento + "/" + FOTOS_MAX_REINTENTOS + " — " + ultimoDetalle);
      if (intento < FOTOS_MAX_REINTENTOS) Utilities.sleep(1000 * intento);
      continue;
    }

    let file = null;
    try {
      file = _guardarEnCarpeta_(folder, ref + ".webp", resultado.blob);
      if (file.getSize() < minBytes) {
        try { file.setTrashed(true); } catch (e) {}
        ultimoDetalle = "Archivo en Drive por debajo del tamaño mínimo (" + file.getSize() + " bytes)";
        console.log("🔄 " + ref + " intento " + intento + "/" + FOTOS_MAX_REINTENTOS + " — " + ultimoDetalle);
        if (intento < FOTOS_MAX_REINTENTOS) Utilities.sleep(1000 * intento);
        continue;
      }

      const driveUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";
      console.log("✅ " + ref + " — foto en Drive (intento " + intento + ", " + resultado.detalle + ")");
      return {
        ok: true,
        driveUrl: driveUrl,
        metodo: resultado.detalle,
        intento: String(intento),
        detalle: ""
      };
    } catch (e) {
      if (file) {
        try { file.setTrashed(true); } catch (eTrash) {}
      }
      ultimoDetalle = "Error guardando en Drive: " + e.message;
      console.warn("🔄 " + ref + " intento " + intento + "/" + FOTOS_MAX_REINTENTOS + " — " + ultimoDetalle);
      if (intento < FOTOS_MAX_REINTENTOS) Utilities.sleep(1000 * intento);
    }
  }

  console.log("❌ " + ref + " — falló tras " + FOTOS_MAX_REINTENTOS + " intentos (" + ultimoDetalle + ")");
  return {
    ok: false,
    driveUrl: "",
    metodo: "",
    intento: String(FOTOS_MAX_REINTENTOS),
    detalle: ultimoDetalle
  };
}

/**
 * Escribe en lote las filas acumuladas en CACHE_ y BITACORA_FOTOS y limpia los buffers.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} shCache
 * @param {GoogleAppsScript.Spreadsheet.Sheet} shBitacora
 * @param {Array<Array<*>>} bufferCache
 * @param {Array<Array<*>>} bufferBitacora
 */
function _flushBuffersFotos_(shCache, shBitacora, bufferCache, bufferBitacora) {
  if (bufferCache.length > 0) {
    const startCache = shCache.getLastRow() + 1;
    shCache.getRange(startCache, 1, bufferCache.length, CACHE_TOTAL_COLS).setValues(bufferCache);
    bufferCache.length = 0;
  }

  if (bufferBitacora.length > 0) {
    try {
      const startBitacora = shBitacora.getLastRow() + 1;
      shBitacora.getRange(startBitacora, 1, bufferBitacora.length, BITACORA_TOTAL_COLS).setValues(bufferBitacora);
    } catch (e) {
      console.warn("⚠️ No se pudo escribir bitácora en lote: " + e.message);
    }
    bufferBitacora.length = 0;
  }
}

/**
 * Obtiene o crea la hoja CACHE_ con encabezados.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ssMotor
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function _obtenerOCrearCache_(ssMotor) {
  let shCache = ssMotor.getSheetByName(CONFIG.SHEET_CACHE);
  if (!shCache) {
    shCache = ssMotor.insertSheet(CONFIG.SHEET_CACHE);
    shCache.getRange(1, 1, 1, CACHE_TOTAL_COLS)
      .setValues([["REFERENCIA", "FOTO_URL_LISTAS", "FOTO_URL_DRIVE", "FECHA_ACTUALIZACION", "ERROR", "ERROR_DETALLE"]])
      .setFontWeight("bold");
    console.log("📄 Hoja CACHE_ creada con encabezados");
  }
  return shCache;
}

/**
 * Obtiene o crea la hoja BITACORA_FOTOS con encabezados.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ssMotor
 * @return {GoogleAppsScript.Spreadsheet.Sheet}
 */
function _obtenerOCrearBitacora_(ssMotor) {
  let sh = ssMotor.getSheetByName(CONFIG.SHEET_BITACORA_FOTOS);
  if (!sh) {
    sh = ssMotor.insertSheet(CONFIG.SHEET_BITACORA_FOTOS);
    sh.getRange(1, 1, 1, BITACORA_TOTAL_COLS)
      .setValues([["FECHA", "REFERENCIA", "RESULTADO", "DETALLE", "INTENTO"]])
      .setFontWeight("bold");
  }
  return sh;
}

/**
 * Guarda un blob en la carpeta destino. Si ya existen archivos con el mismo
 * nombre, los envía a la papelera antes de crear el nuevo para evitar corrupción.
 * @param {GoogleAppsScript.Drive.Folder} folder
 * @param {string} nombre
 * @param {GoogleAppsScript.Base.Blob} blob
 * @return {GoogleAppsScript.Drive.File}
 */
function _guardarEnCarpeta_(folder, nombre, blob) {
  const existing = folder.getFilesByName(nombre);
  while (existing.hasNext()) {
    try {
      existing.next().setTrashed(true);
    } catch (e) {
      console.warn("⚠️ No se pudo enviar a papelera duplicado " + nombre + ": " + e.message);
    }
  }
  const file = folder.createFile(blob);
  _hacerPublicoLectura_(file);
  return file;
}

/**
 * Asigna permiso de lectura a cualquier persona con el enlace.
 * @param {GoogleAppsScript.Drive.File} file
 */
function _hacerPublicoLectura_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn("⚠️ No se pudo hacer público " + file.getName() + ": " + e.message);
  }
}

/**
 * Valida que los bytes descargados correspondan a una imagen WEBP real y usable.
 * @param {number[]} bytes
 * @return {boolean}
 */
function _esWebpValido_(bytes) {
  if (!bytes || bytes.length < 12) return false;

  const firmaWebp =
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;  // WEBP

  const minBytes = (CONFIG.FOTOS_MIN_KB || 10) * 1024;
  return firmaWebp && bytes.length >= minBytes;
}

/**
 * Descarga o convierte una imagen a WEBP probando 3 métodos en cascada:
 *   1. wsrv.nl GET (conversión remota)
 *   2. Descarga directa del origen (si ya es WEBP válido)
 *   3. POST a wsrv.nl con los bytes descargados del origen
 *
 * @param {string} url URL original de la imagen.
 * @param {string} nombre Nombre para el blob (ej. "REF.webp").
 * @return {{ok: boolean, blob: GoogleAppsScript.Base.Blob|null, detalle: string}}
 */
function _descargarWebp_(url, nombre) {
  const razones = [];

  // Método 1: wsrv.nl GET
  try {
    const urlConv = CONFIG.FOTOS_CONV_WEBP.replace("{URL}", encodeURIComponent(url));
    const r = UrlFetchApp.fetch(urlConv, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const b = r.getBlob().setName(nombre);
      if (_esWebpValido_(b.getBytes())) return { ok: true, blob: b, detalle: "wsrv GET" };
      razones.push("wsrv GET: inválida " + (b.getBytes().length / 1024).toFixed(1) + "KB");
    } else {
      razones.push("wsrv GET: HTTP " + r.getResponseCode());
    }
  } catch (e) {
    razones.push("wsrv GET: " + e.message);
  }

  // Método 2: descarga directa
  let directa = null;
  try {
    const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const b = r.getBlob().setName(nombre);
      if (_esWebpValido_(b.getBytes())) return { ok: true, blob: b, detalle: "directa (ya WEBP)" };
      razones.push("directa: inválida " + (b.getBytes().length / 1024).toFixed(1) + "KB");
      directa = b;
    } else {
      razones.push("directa: HTTP " + r.getResponseCode());
    }
  } catch (e) {
    razones.push("directa: " + e.message);
  }

  // Método 3: wsrv.nl POST
  if (directa) {
    try {
      const r = UrlFetchApp.fetch(CONFIG.FOTOS_CONV_WEBP_POST, {
        method: "post",
        payload: directa.getBytes(),
        contentType: directa.getContentType() || "application/octet-stream",
        muteHttpExceptions: true
      });
      if (r.getResponseCode() === 200) {
        const b = r.getBlob().setName(nombre);
        if (_esWebpValido_(b.getBytes())) return { ok: true, blob: b, detalle: "wsrv POST" };
        razones.push("wsrv POST: inválida " + (b.getBytes().length / 1024).toFixed(1) + "KB");
      } else {
        razones.push("wsrv POST: HTTP " + r.getResponseCode());
      }
    } catch (e) {
      razones.push("wsrv POST: " + e.message);
    }
  } else {
    razones.push("wsrv POST: sin bytes del origen");
  }

  return { ok: false, blob: null, detalle: razones.join(" | ") };
}
