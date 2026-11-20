// ============================================================
// CLASIFICACIÓN MANUAL — A DEMANDA (NO automática)
// Aplica CATEGORIA, SUBCATEGORIA y TIPO DE PRODUCTO desde
// "CLASIFICACION FINAL CATALOGO" sobre Hoja2, cruzando por REFERENCIA.
//
// ⚠️ DEBE vivir en el MISMO proyecto Apps Script que la sync
//    (fotos_lista_de_precios) para que comparta el LockService y
//    NUNCA escriba Hoja2 al mismo tiempo que la sincronización.
//
// Contrato de columnas en CLASIFICACION FINAL CATALOGO (SHEET_CLASIF):
//   A: REFERENCIA FERTRAC | C: CATEGORIA | D: SUBCATEGORIA | E: TIPO DE PRODUCTO
//   (header fila 1, datos desde fila 2)
//
// Columnas destino en Hoja2 (SHEET_MOTOR):
//   E = CATEGORIA (col 5) | F = SUBCATEGORIA (col 6) | G = TIPO DE PRODUCTO (col 7)
//   (H e I no se modifican).
// ============================================================

/**
 * Aplica la clasificación manual (columnas E, F y G) sobre Hoja2
 * usando las referencias de CLASIFICACION FINAL CATALOGO.
 *
 * @param {number} [filaInicioClasif=2] Fila inicial de lectura en CLASIFICACION FINAL CATALOGO.
 * @return {boolean} true si finalizó correctamente, false si omitió por lock, abortó o falló.
 */
function aplicarClasificacionManual(filaInicioClasif) {
  // ⚠️ LOCK GLOBAL: comparte LockService con sync, fotos y API para evitar escrituras concurrentes.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.log("🔒 Otra ejecución en curso — omitiendo");
    return false;
  }

  try {
    return _aplicarClasificacion_(filaInicioClasif);
  } catch (e) {
    registrarLog_("error", "backend", "clasificacion", e.message, e.stack || "", "", "");
    console.error("❌ Error en aplicarClasificacionManual:", e.message);
    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lee las referencias con conflicto real desde CONFLICTOS CLASIFICACION
 * para excluirlas de la escritura en Hoja2.
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @return {Set<string>}
 */
function _obtenerReferenciasEnConflicto_(ss) {
  const excluidas = new Set();
  const shConflictos = ss.getSheetByName(CONFIG.SHEET_CONFLICTOS);
  if (!shConflictos) return excluidas;

  const lastRow = shConflictos.getLastRow();
  if (lastRow < 2) return excluidas;

  const refs = shConflictos.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < refs.length; i++) {
    const key = String(refs[i][0] || "").trim().toUpperCase();
    if (key) excluidas.add(key);
  }
  return excluidas;
}

/**
 * Ejecuta la lectura, cruce en memoria y escritura por lotes en Hoja2.
 *
 * @param {number} [filaInicioClasif=2]
 * @return {boolean} true si completó el flujo sin abortar.
 */
function _aplicarClasificacion_(filaInicioClasif) {
  const MOTOR_DATA_ROW   = CONFIG.MOTOR_DATA_ROW;
  const MOTOR_COL_REF    = CONFIG.MOTOR_COL_REF;
  const COL_CATEGORIA    = 5; // E
  const COL_SUBCATEGORIA = 6; // F
  const COL_TIPO         = 7; // G

  const ss       = SpreadsheetApp.openById(CONFIG.ID_BASE_MOTOR);
  const shMotor  = ss.getSheetByName(CONFIG.SHEET_MOTOR);
  const shClasif = ss.getSheetByName(CONFIG.SHEET_CLASIF);

  if (!shMotor)  { console.warn("⚠️ No existe la hoja " + CONFIG.SHEET_MOTOR + " — abortando"); return false; }
  if (!shClasif) { console.warn("⚠️ No existe la hoja " + CONFIG.SHEET_CLASIF + " — abortando"); return false; }

  const filaIniClasif = filaInicioClasif || 2;
  const lastRowClasif = shClasif.getLastRow();
  if (lastRowClasif < filaIniClasif) {
    console.warn("⚠️ No hay filas desde la fila " + filaIniClasif + " en " + CONFIG.SHEET_CLASIF + " — abortando");
    return false;
  }

  const headersClasif = shClasif.getRange(1, 1, 1, Math.max(6, shClasif.getLastColumn())).getDisplayValues()[0];
  console.log("🔎 Encabezados CLASIFICACION:", JSON.stringify(headersClasif));

  const clasifData = shClasif.getRange(filaIniClasif, 1, lastRowClasif - filaIniClasif + 1, 5).getDisplayValues();
  const mapaClasif = new Map();
  for (let i = 0; i < clasifData.length; i++) {
    const row = clasifData[i];
    const ref = String(row[0] || "").trim().toUpperCase();
    if (!ref) continue;
    mapaClasif.set(ref, {
      refOriginal:  row[0],
      fila:         filaIniClasif + i,
      marca:        row[1],
      categoria:    row[2],
      subcategoria: row[3],
      tipo:         row[4]
    });
  }

  if (mapaClasif.size === 0) { console.warn("⚠️ Sin referencias válidas en " + CONFIG.SHEET_CLASIF + " — abortando"); return false; }

  const lastRowMotor   = shMotor.getLastRow();
  const totalRowsMotor = lastRowMotor - MOTOR_DATA_ROW + 1;

  if (totalRowsMotor <= 0) { console.warn("⚠️ " + CONFIG.SHEET_MOTOR + " vacía — abortando"); return false; }

  const referenciasExcluidas = _obtenerReferenciasEnConflicto_(ss);
  const refs    = shMotor.getRange(MOTOR_DATA_ROW, MOTOR_COL_REF, totalRowsMotor, 1).getDisplayValues();
  const salidaE = shMotor.getRange(MOTOR_DATA_ROW, COL_CATEGORIA, totalRowsMotor, 1).getValues();
  const salidaF = shMotor.getRange(MOTOR_DATA_ROW, COL_SUBCATEGORIA, totalRowsMotor, 1).getValues();
  const salidaG = shMotor.getRange(MOTOR_DATA_ROW, COL_TIPO, totalRowsMotor, 1).getValues();

  const aplicadasSet = new Set();
  const excluidasEncontradas = new Set();
  let aplicadas = 0;
  let conTipoNoVacio = 0;
  let excluidas = 0;

  for (let i = 0; i < totalRowsMotor; i++) {
    const key = String(refs[i][0] || "").trim().toUpperCase();
    if (referenciasExcluidas.has(key)) {
      excluidas++;
      excluidasEncontradas.add(key);
      continue;
    }

    const clas = mapaClasif.get(key);
    if (clas) {
      salidaE[i][0] = clas.categoria;
      salidaF[i][0] = clas.subcategoria;
      salidaG[i][0] = clas.tipo;
      if (String(clas.tipo || "").trim() !== "") conTipoNoVacio++;
      aplicadas++;
      aplicadasSet.add(key);
    }
  }

  if (aplicadas > 0) {
    shMotor.getRange(MOTOR_DATA_ROW, COL_CATEGORIA, totalRowsMotor, 1).setValues(salidaE);
    shMotor.getRange(MOTOR_DATA_ROW, COL_SUBCATEGORIA, totalRowsMotor, 1).setValues(salidaF);
    shMotor.getRange(MOTOR_DATA_ROW, COL_TIPO, totalRowsMotor, 1).setValues(salidaG);
  }

  const ahora = new Date();
  const sinMatch = [];
  mapaClasif.forEach((clas, ref) => {
    if (!referenciasExcluidas.has(ref) && !aplicadasSet.has(ref)) {
      sinMatch.push([clas.refOriginal, clas.fila, clas.marca, clas.categoria, clas.subcategoria, clas.tipo, "No existe en Hoja2", ahora]);
    }
  });

  let shConflictos = ss.getSheetByName(CONFIG.SHEET_CONFLICTOS);
  if (!shConflictos) {
    shConflictos = ss.insertSheet(CONFIG.SHEET_CONFLICTOS);
  } else {
    shConflictos.clearContents();
  }

  const headersConflictos = ["REFERENCIA FERTRAC", "FILA EN CLASIFICACION", "MARCA", "CATEGORIA", "SUBCATEGORIA", "TIPO DE PRODUCTO", "MOTIVO", "FECHA"];
  shConflictos.getRange(1, 1, 1, headersConflictos.length).setValues([headersConflictos]).setFontWeight("bold");

  if (sinMatch.length > 0) {
    shConflictos.getRange(2, 1, sinMatch.length, headersConflictos.length).setValues(sinMatch);
  }

  console.log(`✅ Clasificación | Filas Hoja2 actualizadas: ${aplicadas} | Refs en CLASIFICACION: ${mapaClasif.size} | Filas Hoja2 leídas: ${totalRowsMotor}`);
  console.log(`🔎 Diagnóstico TIPO DE PRODUCTO | Aplicadas con tipo no vacío: ${conTipoNoVacio}/${aplicadas}`);
  if (excluidas > 0) {
    console.log(`⏭️ ${excluidas} fila(s) de Hoja2 OMITIDAS por conflicto real sin resolver: ${Array.from(excluidasEncontradas).join(", ")}`);
  }
  if (sinMatch.length > 0) {
    console.warn(`⚠️ ${sinMatch.length} referencias de CLASIFICACION NO existen en Hoja2 — registradas en "${CONFIG.SHEET_CONFLICTOS}"`);
  }

  return true;
}
