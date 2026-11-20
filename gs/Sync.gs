// ============================================================
// SINCRONIZACIÓN — Precios, inventario, inactivas y correo
// Todos los IDs, hojas y columnas vienen de CONFIG (Config.gs).
// ============================================================

// ── Actualización completa. ignorarHorario = true omite la validación
//    de horario laboral (se usa cuando se dispara por edición) ──
async function sincronizacionCompleta(ignorarHorario) {

  const ahora = new Date();
  const hora  = ahora.getHours();
  const dia   = ahora.getDay();

  const esLunesViernes = dia >= 1 && dia <= 5 && hora >= 7 && hora < 19;
  const esSabado       = dia === 6 && hora >= 8 && hora < 13;

  if (!ignorarHorario && !esLunesViernes && !esSabado) {
    console.log("⏸ Fuera de horario — omitiendo ejecución");
    return;
  }

  // ⚠️ LOCK GLOBAL (docs/LOCK_APPS_SCRIPT.md): mientras ESTA sync se ejecuta,
  // la hoja queda bloqueada para otros y la app responde 'temporalmente_ocupado'
  // (falla la sincronización hasta que termina). La app reintenta sola.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log("🔒 Otra ejecución en curso — omitiendo");
    return;
  }

  let completaOk = false;
  try {
    ejecutarCompleta_();
    completaOk = true;
  } catch (e) {
    registrarLog_('error', 'backend', 'sync_completa', e.message, e.stack || '', '', '');
    console.log("❌ Error:", e.message);
  } finally {
    lock.releaseLock();
  }

  if (completaOk) {
    try {
      const clasifOk = await ejecutarClasificacionManualAsync_();
      if (clasifOk) {
        console.log("✅ aplicarClasificacionManual finalizó satisfactoriamente");
      } else {
        console.warn("⚠️ aplicarClasificacionManual no se completó satisfactoriamente (revisar log previo)");
      }
    } catch (e) {
      registrarLog_('error', 'backend', 'sync_completa_clasif', e.message, e.stack || '', '', '');
      console.error("❌ Error esperando aplicarClasificacionManual:", e.message);
    }
  }
}

/**
 * Envuelve aplicarClasificacionManual en una Promesa para esperar su
 * resolución dentro de la misma ejecución y ventana de log.
 *
 * @returns {Promise<boolean>} true si se ejecutó satisfactoriamente.
 */
function ejecutarClasificacionManualAsync_() {
  console.log("▶ Iniciando ejecutarClasificacionManualAsync_");
  return new Promise((resolve, reject) => {
    try {
      const ok = Boolean(aplicarClasificacionManual());
      console.log("◀ ejecutarClasificacionManualAsync_ resultado:", ok);
      registrarLog_(ok ? 'info' : 'warn', 'backend', 'sync_completa_clasif', 'aplicarClasificacionManual resultado: ' + ok, '', '', '');
      resolve(ok);
    } catch (err) {
      console.error("❌ Error en ejecutarClasificacionManualAsync_:", err.message);
      registrarLog_('error', 'backend', 'sync_completa_clasif', err.message, err.stack || '', '', '');
      reject(err);
    }
  });
}

// ============================================================
// MOTOR COMPLETO — Todas las columnas, solo actualiza diferencias
// (mantiene el orden actual de Hoja2; nuevas van al final)
// ============================================================

function ejecutarCompleta_() {

  const ssMotor = SpreadsheetApp.openById(CONFIG.ID_BASE_MOTOR);
  const ssLista = SpreadsheetApp.openById(CONFIG.ID_LISTA_PRECIOS);
  const shMotor = ssMotor.getSheetByName(CONFIG.SHEET_MOTOR);
  const shLista = ssLista.getSheetByName(CONFIG.SHEET_LISTA);
  const ahora = new Date();
  const { LISTA_DATA_ROW, LISTA_COL_REF, LISTA_COL_ALT, LISTA_COL_PROD, LISTA_COL_PRECIO, LISTA_COL_INV } = CONFIG;
  const { MOTOR_DATA_ROW, MOTOR_COL_REF, MOTOR_COL_FOTO, MOTOR_TOTAL_COLS } = CONFIG;

  // Columnas de Hoja2 (1-based) a sincronizar desde LISTA DE PRECIOS.
  // B (foto) se actualiza al final con la fórmula VLOOKUP hacia CACHE_.
  // H (LINEA) e I (MARCA): LISTA DE PRECIOS tiene PRIORIDAD. Si LISTA trae
  // valor, sobrescribe lo que haya en Hoja2 (incluida la clasificación
  // manual). Si LISTA viene vacía o en 0, se conserva el valor actual.
  // Nota: la letra de columna y el número deben coincidir (A=1 ... Z=26).
  const COLS_PRIORIDAD_LISTA = [8, 9];   // H - LINEA, I - MARCA
  const COLS_SYNC = [
    [3,  'alt'],       // C  - REF ALTERNAS
    [4,  'prod'],      // D  - PRODUCTO
    [8,  'linea'],     // H  - LINEA  (prioridad LISTA, col U)
    [9,  'marca'],     // I  - MARCA  (prioridad LISTA, col H)
    [11, 'precio'],    // K  - PRECIO BRUTO
    [12, 'neto5'],     // L  - NETO -5%
    [13, 'neto8'],     // M  - NETO -8%
    [14, 'promo'],     // N  - PRECIO PROMO (texto literal)
    [15, 'undEscala'], // O  - UND ESCALA
    [16, 'undMin'],    // P  - UND MIN VTA
    [17, 'undMax'],    // Q  - UND MAX VTA
    [18, 'promoFin'],  // R  - PROMO FINALIZA
    [19, 'inv'],       // S  - INV
    [20, 'undRm'],     // T  - UND RM
    [21, 'undRmc'],    // U  - UND RMC
    [22, 'condicion']  // V  - CONDICION
  ];

  let shInactivas = ssMotor.getSheetByName(CONFIG.SHEET_INACTIVAS);
  if (!shInactivas) {
    shInactivas = ssMotor.insertSheet(CONFIG.SHEET_INACTIVAS);
    shInactivas.getRange(1, 1, 1, 2).setValues([["REFERENCIA", "FECHA_INACTIVACION"]]);
  }

  // ── 1. Leer LISTA DE PRECIOS ──
  const lastRowLista   = shLista.getLastRow();
  const totalRowsLista = lastRowLista - LISTA_DATA_ROW + 1;
  if (totalRowsLista <= 0) { console.log("⚠️ No hay datos en LISTA DE PRECIOS"); return; }

  const rangoLista   = shLista.getRange(LISTA_DATA_ROW, 1, totalRowsLista, 21);
  const dataLista    = rangoLista.getValues();
  const displayLista = rangoLista.getDisplayValues();

  const refsOrdenadas = [];
  const mapaLista = new Map();
  for (let i = 0; i < dataLista.length; i++) {
    const row  = dataLista[i];
    const disp = displayLista[i];
    const ref  = String(disp[LISTA_COL_REF  - 1] || "").trim().toUpperCase();
    const alt  = String(disp[LISTA_COL_ALT  - 1] || "").trim();
    const prod = String(disp[LISTA_COL_PROD - 1] || "").trim();
    if (!alt && !prod) continue;
    if (!ref) continue;
    if (!mapaLista.has(ref)) {
      refsOrdenadas.push(ref);
      mapaLista.set(ref, {
        precio:    row[LISTA_COL_PRECIO - 1],
        inv:       row[LISTA_COL_INV - 1],
        alt:       row[4],
        prod:      String(row[5] == null ? "" : row[5]).trim(),
        linea:     textoClasif_(row[20]),   // U de LISTA
        marca:     textoClasif_(row[7]),    // H de LISTA
        neto5:     row[9],
        neto8:     row[10],
        promo:     disp[11],                // L de LISTA → texto literal
        undEscala: row[12],
        undMin:    row[13],
        undMax:    row[14],
        promoFin:  row[15],
        undRm:     row[17],
        undRmc:    row[18],
        condicion: row[19]
      });
    }
  }

  if (mapaLista.size === 0) { console.log("⚠️ Sin referencias válidas en LISTA DE PRECIOS"); return; }

  // ── 2. Leer BASE MOTOR completo ──
  const lastRowMotor   = shMotor.getLastRow();
  const totalRowsMotor = lastRowMotor - MOTOR_DATA_ROW + 1;
  if (totalRowsMotor <= 0) { console.log("⚠️ No hay datos en BASE MOTOR"); return; }

  const dataMotor = shMotor.getRange(MOTOR_DATA_ROW, 1, totalRowsMotor, MOTOR_TOTAL_COLS).getValues();
  const mapaMotor = new Map();
  for (let i = 0; i < dataMotor.length; i++) {
    const row = dataMotor[i];
    const key = String(row[MOTOR_COL_REF - 1] || "").trim().toUpperCase();
    if (key && !mapaMotor.has(key)) mapaMotor.set(key, { filaReal: MOTOR_DATA_ROW + i, row });
  }

  // ── 3. Inactivas: mover en lote a INACTIVAS y borrar bloques contiguos de Hoja2 ──
  const refsInactivas = [];
  const filasInactivas = [];
  const filasBorradasSet = new Set();

  mapaMotor.forEach(({ filaReal, row }, ref) => {
    if (!mapaLista.has(ref)) {
      const filaInactiva = row.slice();
      filaInactiva[22] = ahora;
      filasInactivas.push(filaInactiva);
      refsInactivas.push({ ref, filaReal });
      filasBorradasSet.add(filaReal);
    }
  });

  if (filasInactivas.length > 0) {
    const inicioInactivas = shInactivas.getLastRow() + 1;
    shInactivas.getRange(inicioInactivas, 1, filasInactivas.length, MOTOR_TOTAL_COLS).setValues(filasInactivas);

    // Agrupar filas contiguas (de abajo hacia arriba) para usar deleteRows() en lugar de deleteRow() uno a uno
    const filasDesc = refsInactivas.map(e => e.filaReal).sort((a, b) => b - a);
    let rangoFin = filasDesc[0];
    let cantidad = 1;
    for (let i = 1; i < filasDesc.length; i++) {
      if (filasDesc[i] === rangoFin - cantidad) {
        cantidad++;
      } else {
        shMotor.deleteRows(rangoFin - cantidad + 1, cantidad);
        rangoFin = filasDesc[i];
        cantidad = 1;
      }
    }
    shMotor.deleteRows(rangoFin - cantidad + 1, cantidad);
  }
  const inactivadas = refsInactivas.length;

  // ── 4. Reconstruir índice de Hoja2 en memoria (evita releer toda la hoja) ──
  let dataMotor2;
  let mapaMotor2;
  let ultimaFilaRegistro = MOTOR_DATA_ROW - 1;
  if (inactivadas === 0) {
    dataMotor2 = dataMotor;
    mapaMotor2 = mapaMotor;
    for (let i = dataMotor2.length - 1; i >= 0; i--) {
      if (String(dataMotor2[i][MOTOR_COL_REF - 1] || "").trim()) {
        ultimaFilaRegistro = MOTOR_DATA_ROW + i;
        break;
      }
    }
  } else {
    dataMotor2 = [];
    mapaMotor2 = new Map();
    for (let i = 0; i < dataMotor.length; i++) {
      if (filasBorradasSet.has(MOTOR_DATA_ROW + i)) continue;
      const row = dataMotor[i];
      const nuevoIdx = dataMotor2.length;
      dataMotor2.push(row);
      const key = String(row[MOTOR_COL_REF - 1] || "").trim().toUpperCase();
      if (key) {
        ultimaFilaRegistro = MOTOR_DATA_ROW + nuevoIdx;
        if (!mapaMotor2.has(key)) {
          mapaMotor2.set(key, { filaReal: ultimaFilaRegistro, row });
        }
      }
    }
  }

  const totalRowsMotor2 = dataMotor2.length;

  // ── 5. Comparar diferencias en memoria y escribir por bloques de columnas ──
  let actualizadas = 0;
  const refsActualizadas = [];
  let tocaCD = false;
  let tocaHI = false;
  let tocaKW = false;
  let minIdx = totalRowsMotor2;
  let maxIdx = -1;

  mapaLista.forEach((datos, ref) => {
    if (!mapaMotor2.has(ref)) return;
    const { filaReal, row } = mapaMotor2.get(ref);
    const idx = filaReal - MOTOR_DATA_ROW;
    let cambio = false;

    for (let c = 0; c < COLS_SYNC.length; c++) {
      const [col, campo] = COLS_SYNC[c];
      let valor = datos[campo];
      if (col === 4) valor = String(valor == null ? "" : valor).trim();
      if (COLS_PRIORIDAD_LISTA.includes(col)) {
        if (!valor) continue;                                  // LISTA vacía → conservar Hoja2
        if (textoClasif_(row[col - 1]) === valor) continue;    // ignora espacios/mayúsculas
      }
      if (String(row[col - 1]) !== String(valor)) {
        row[col - 1] = valor;
        cambio = true;
        if (col <= 4)       tocaCD = true;
        else if (col <= 9)  tocaHI = true;
        else                tocaKW = true;
      }
    }

    if (cambio) {
      row[22] = ahora; // W - fecha/hora de actualización
      tocaKW = true;
      actualizadas++;
      refsActualizadas.push(ref);
      if (idx < minIdx) minIdx = idx;
      if (idx > maxIdx) maxIdx = idx;
    }
  });

  // Escribir solo el rango [minIdx..maxIdx] en máx. 3 llamadas setValues() sin tocar B, E-G ni J
  if (actualizadas > 0 && maxIdx >= minIdx) {
    const numFilas = maxIdx - minIdx + 1;
    const filaInicioEscritura = MOTOR_DATA_ROW + minIdx;

    if (tocaCD) {
      const bloqueCD = new Array(numFilas);
      for (let i = 0; i < numFilas; i++) {
        const r = dataMotor2[minIdx + i];
        bloqueCD[i] = [r[2], r[3]];
      }
      shMotor.getRange(filaInicioEscritura, 3, numFilas, 2).setValues(bloqueCD);
    }

    if (tocaHI) {
      const bloqueHI = new Array(numFilas);
      for (let i = 0; i < numFilas; i++) {
        const r = dataMotor2[minIdx + i];
        bloqueHI[i] = [r[7], r[8]];
      }
      shMotor.getRange(filaInicioEscritura, 8, numFilas, 2).setValues(bloqueHI);
    }

    if (tocaKW) {
      const bloqueKW = new Array(numFilas);
      for (let i = 0; i < numFilas; i++) {
        bloqueKW[i] = dataMotor2[minIdx + i].slice(10, 23);
      }
      shMotor.getRange(filaInicioEscritura, 11, numFilas, 13).setValues(bloqueKW);
    }
  }

  // ── 6. Nuevas referencias después del último registro de Hoja2 ──
  const refsNuevas = [];
  const nuevasFilas = [];
  for (let i = 0; i < refsOrdenadas.length; i++) {
    const ref = refsOrdenadas[i];
    if (mapaMotor2.has(ref)) continue;
    const datos = mapaLista.get(ref);
    const filaVacia = new Array(MOTOR_TOTAL_COLS).fill("");
    filaVacia[0]  = ref;
    filaVacia[2]  = datos.alt;
    filaVacia[3]  = String(datos.prod == null ? "" : datos.prod).trim();
    filaVacia[4]  = 0;
    filaVacia[5]  = 0;
    filaVacia[6]  = 0;
    filaVacia[7]  = datos.linea || 0;
    filaVacia[8]  = datos.marca || 0;
    filaVacia[9]  = 0;
    filaVacia[10] = datos.precio;
    filaVacia[11] = datos.neto5;
    filaVacia[12] = datos.neto8;
    filaVacia[13] = datos.promo;
    filaVacia[14] = datos.undEscala;
    filaVacia[15] = datos.undMin;
    filaVacia[16] = datos.undMax;
    filaVacia[17] = datos.promoFin;
    filaVacia[18] = datos.inv;
    filaVacia[19] = datos.undRm || 0;
    filaVacia[20] = datos.undRmc || 0;
    filaVacia[21] = String(datos.condicion || "").trim() ? datos.condicion : "NO TIENE";
    filaVacia[22] = ahora; // W - fecha/hora de creación
    nuevasFilas.push(filaVacia);
    refsNuevas.push(ref);
  }

  if (nuevasFilas.length > 0) {
    shMotor.getRange(ultimaFilaRegistro + 1, 1, nuevasFilas.length, MOTOR_TOTAL_COLS).setValues(nuevasFilas);
  }
  const nuevas = refsNuevas.length;

  // ── 7. Actualizar columna B (FOTO) con la fórmula hacia CACHE_ ──
  const ultimaFilaFinal = ultimaFilaRegistro + nuevas;
  if (ultimaFilaFinal >= MOTOR_DATA_ROW) {
    const totalFilasB = ultimaFilaFinal - MOTOR_DATA_ROW + 1;
    const formulasB = new Array(totalFilasB);
    for (let i = 0; i < totalFilasB; i++) {
      const fila = MOTOR_DATA_ROW + i;
      formulasB[i] = ['=IF(A' + fila + '="", "", IFERROR(VLOOKUP(A' + fila + '&"", ' + CONFIG.SHEET_CACHE + '!A:C, 3, FALSE), "Sin Foto"))'];
    }
    shMotor.getRange(MOTOR_DATA_ROW, MOTOR_COL_FOTO, totalFilasB, 1).setFormulas(formulasB);
  }

  console.log(`✅ Sync COMPLETA | Actualizadas: ${actualizadas} | Nuevas: ${nuevas} | Inactivadas: ${inactivadas}`);
  if (refsActualizadas.length > 0) console.log("🔍 Referencias actualizadas:", refsActualizadas.join(", "));

  // La app lee Hoja2 con caché: invalidarla para ver los cambios sin esperar TTL.
  try { invalidarCacheCatalogo_(); } catch (e) {}
}

// ── Normaliza MARCA/LINEA: texto sin espacios extremos, en mayúsculas;
//    vacío y "0" (relleno de LISTA) se tratan como "sin dato". ──
function textoClasif_(v) {
  const t = String(v == null ? "" : v).trim().toUpperCase();
  return (t === "0") ? "" : t;
}
