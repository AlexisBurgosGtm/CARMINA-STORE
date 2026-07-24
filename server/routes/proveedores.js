const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT CODPROV, NOMPROV FROM PROVEEDORES ORDER BY NOMPROV');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar proveedores' });
  }
});

router.get('/:codprov', async (req, res) => {
  try {
    const rows = await query('SELECT CODPROV, NOMPROV FROM PROVEEDORES WHERE CODPROV = ?', [
      req.params.codprov,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { NOMPROV } = req.body;
    if (!NOMPROV || !String(NOMPROV).trim()) {
      return res.status(400).json({ error: 'NOMPROV es requerido' });
    }

    const maxRows = await query(`
      SELECT COALESCE(MAX(CAST(CODPROV AS UNSIGNED)), 0) AS maxCod
      FROM PROVEEDORES
      WHERE CODPROV REGEXP '^[0-9]+$'
    `);
    const nextNum = Number(maxRows[0].maxCod || 0) + 1;
    const CODPROV = String(nextNum);

    await query('INSERT INTO PROVEEDORES (CODPROV, NOMPROV) VALUES (?, ?)', [
      CODPROV,
      String(NOMPROV).trim(),
    ]);
    res.status(201).json({ ok: true, CODPROV });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

router.put('/:codprov', async (req, res) => {
  try {
    const { NOMPROV } = req.body;
    if (!NOMPROV) return res.status(400).json({ error: 'NOMPROV es requerido' });

    const rows = await query('SELECT CODPROV FROM PROVEEDORES WHERE CODPROV = ?', [req.params.codprov]);
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });

    await query('UPDATE PROVEEDORES SET NOMPROV = ? WHERE CODPROV = ?', [
      NOMPROV.trim(),
      req.params.codprov,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

router.delete('/:codprov', async (req, res) => {
  try {
    const rows = await query('SELECT CODPROV FROM PROVEEDORES WHERE CODPROV = ?', [req.params.codprov]);
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const productos = await query(
      'SELECT COUNT(*) AS total FROM PRODUCTOS WHERE CODPROV = ?',
      [req.params.codprov]
    );
    if (productos[0].total > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${productos[0].total} producto(s) asociados a este proveedor`,
      });
    }

    await query('DELETE FROM PROVEEDORES WHERE CODPROV = ?', [req.params.codprov]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar proveedor' });
  }
});

module.exports = router;
