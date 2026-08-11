const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT a.ID, a.NOMBRE, a.FECHA,
             COUNT(p.ID) AS TOTAL
      FROM ALBUMES a
      LEFT JOIN PUBLICACIONES p ON p.IDALBUM = a.ID
      GROUP BY a.ID, a.NOMBRE, a.FECHA
      ORDER BY a.FECHA DESC, a.ID DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar álbumes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const rows = await query(
      'SELECT ID, NOMBRE, FECHA FROM ALBUMES WHERE ID = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Álbum no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener álbum' });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = String(req.body?.NOMBRE || '').trim();
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del álbum es requerido' });
    }
    if (nombre.length > 150) {
      return res.status(400).json({ error: 'El nombre no puede superar 150 caracteres' });
    }

    const result = await query(
      'INSERT INTO ALBUMES (NOMBRE, FECHA) VALUES (?, NOW())',
      [nombre]
    );
    const rows = await query(
      'SELECT ID, NOMBRE, FECHA FROM ALBUMES WHERE ID = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear álbum' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const nombre = String(req.body?.NOMBRE || '').trim();
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre del álbum es requerido' });
    }
    if (nombre.length > 150) {
      return res.status(400).json({ error: 'El nombre no puede superar 150 caracteres' });
    }

    const existing = await query('SELECT ID FROM ALBUMES WHERE ID = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Álbum no encontrado' });

    await query('UPDATE ALBUMES SET NOMBRE = ? WHERE ID = ?', [nombre, id]);
    const rows = await query(
      'SELECT ID, NOMBRE, FECHA FROM ALBUMES WHERE ID = ?',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar álbum' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const existing = await query('SELECT ID FROM ALBUMES WHERE ID = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Álbum no encontrado' });

    // Cascade elimina publicaciones del álbum
    await query('DELETE FROM ALBUMES WHERE ID = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar álbum' });
  }
});

module.exports = router;
