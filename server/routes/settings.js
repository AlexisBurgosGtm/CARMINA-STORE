const express = require('express');
const { query } = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const {
  GEMINI_MODELS,
  SETTING_MODELO,
  isAllowedGeminiModel,
} = require('../gemini-models');
const { consultarTipoCambioMxnPorGtq } = require('../gemini');

const router = express.Router();
router.use(authRequired);

const SECRET_OPTION = 'CLAVE VERIFICACIONES';
const FACTOR_OPTION = 'FACTOR CAMBIO MONEDA';

router.get('/', adminRequired, async (_req, res) => {
  try {
    const rows = await query('SELECT OPCION, VALOR FROM SETTINGS ORDER BY OPCION');
    const safe = rows.map((r) =>
      r.OPCION === SECRET_OPTION ? { OPCION: r.OPCION, VALOR: '', secreta: true } : r
    );
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar configuraciones' });
  }
});

router.get('/gemini-models', adminRequired, (_req, res) => {
  res.json({ models: GEMINI_MODELS, setting: SETTING_MODELO });
});

router.post('/verificar-clave', async (req, res) => {
  try {
    const clave = String(req.body?.clave ?? '');
    const rows = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [SECRET_OPTION]);
    if (!rows.length) {
      return res.status(500).json({ error: 'Clave de verificaciones no configurada' });
    }
    const ok = clave === String(rows[0].VALOR);
    if (!ok) {
      return res.status(403).json({ ok: false, error: 'Clave de verificación incorrecta' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar la clave' });
  }
});

router.post('/tipo-cambio-gemini', async (_req, res) => {
  try {
    const data = await consultarTipoCambioMxnPorGtq();
    const current = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [FACTOR_OPTION]);
    res.json({
      ...data,
      factor_actual: current[0] ? Number(current[0].VALOR) : null,
      opcion: FACTOR_OPTION,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al consultar tipo de cambio' });
  }
});

router.put('/factor-cambio', async (req, res) => {
  try {
    const valor = Number(req.body?.VALOR ?? req.body?.factor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({ error: 'Factor de cambio inválido' });
    }
    const rounded = Math.round(valor * 10000) / 10000;
    const rows = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [FACTOR_OPTION]);
    if (!rows.length) {
      await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [
        FACTOR_OPTION,
        String(rounded),
      ]);
    } else {
      await query('UPDATE SETTINGS SET VALOR = ? WHERE OPCION = ?', [
        String(rounded),
        FACTOR_OPTION,
      ]);
    }
    res.json({ ok: true, OPCION: FACTOR_OPTION, VALOR: String(rounded) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar el factor de cambio' });
  }
});

router.get('/:opcion', async (req, res) => {
  try {
    const opcion = decodeURIComponent(req.params.opcion);
    if (opcion === SECRET_OPTION) {
      return res.status(403).json({ error: 'No se puede consultar esta opción directamente' });
    }
    const rows = await query('SELECT OPCION, VALOR FROM SETTINGS WHERE OPCION = ?', [opcion]);
    if (!rows.length) return res.status(404).json({ error: 'Opción no encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

router.put('/:opcion', adminRequired, async (req, res) => {
  try {
    const opcion = decodeURIComponent(req.params.opcion);
    const { VALOR } = req.body;
    if (VALOR === undefined || VALOR === null || String(VALOR).trim() === '') {
      return res.status(400).json({ error: 'VALOR es requerido' });
    }

    const valor = String(VALOR).trim();

    if (opcion === SETTING_MODELO && !isAllowedGeminiModel(valor)) {
      return res.status(400).json({
        error: 'Modelo Gemini no permitido',
        models: GEMINI_MODELS.map((m) => m.id),
      });
    }

    const rows = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [opcion]);
    if (!rows.length) return res.status(404).json({ error: 'Opción no encontrada' });

    await query('UPDATE SETTINGS SET VALOR = ? WHERE OPCION = ?', [valor, opcion]);
    res.json({
      ok: true,
      OPCION: opcion,
      VALOR: opcion === SECRET_OPTION ? '' : valor,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

module.exports = router;
