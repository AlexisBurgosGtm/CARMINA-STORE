const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

const SECRET_OPTION = 'CLAVE VERIFICACIONES';

router.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT OPCION, VALOR FROM SETTINGS ORDER BY OPCION');
    // No exponer la clave en claro al listar
    const safe = rows.map((r) =>
      r.OPCION === SECRET_OPTION ? { OPCION: r.OPCION, VALOR: '', secreta: true } : r
    );
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar configuraciones' });
  }
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

router.put('/:opcion', async (req, res) => {
  try {
    const opcion = decodeURIComponent(req.params.opcion);
    const { VALOR } = req.body;
    if (VALOR === undefined || VALOR === null || String(VALOR).trim() === '') {
      return res.status(400).json({ error: 'VALOR es requerido' });
    }

    const rows = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [opcion]);
    if (!rows.length) return res.status(404).json({ error: 'Opción no encontrada' });

    await query('UPDATE SETTINGS SET VALOR = ? WHERE OPCION = ?', [
      String(VALOR).trim(),
      opcion,
    ]);
    res.json({
      ok: true,
      OPCION: opcion,
      VALOR: opcion === SECRET_OPTION ? '' : String(VALOR).trim(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

module.exports = router;
