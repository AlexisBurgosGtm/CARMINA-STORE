const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authRequired, adminRequired, SUPER_USER } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);
router.use(adminRequired);

router.get('/', async (_req, res) => {
  try {
    const rows = await query('SELECT `USER`, TIPO FROM USUARIOS ORDER BY `USER`');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { USER, PASS, TIPO } = req.body;
    if (!USER || !PASS || !TIPO) {
      return res.status(400).json({ error: 'USER, PASS y TIPO son requeridos' });
    }
    if (!['ADMINISTRADOR', 'OPERADOR'].includes(TIPO)) {
      return res.status(400).json({ error: 'TIPO debe ser ADMINISTRADOR u OPERADOR' });
    }

    const username = String(USER).trim().toUpperCase();
    const exists = await query('SELECT `USER` FROM USUARIOS WHERE `USER` = ?', [username]);
    if (exists.length) return res.status(409).json({ error: 'El usuario ya existe' });

    const hash = await bcrypt.hash(PASS, 10);
    await query('INSERT INTO USUARIOS (`USER`, PASS, TIPO) VALUES (?, ?, ?)', [
      username,
      hash,
      TIPO,
    ]);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

router.put('/:user', async (req, res) => {
  try {
    const username = String(req.params.user).toUpperCase();
    const { PASS, TIPO } = req.body;

    const rows = await query('SELECT `USER` FROM USUARIOS WHERE `USER` = ?', [username]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (TIPO && !['ADMINISTRADOR', 'OPERADOR'].includes(TIPO)) {
      return res.status(400).json({ error: 'TIPO inválido' });
    }

    if (username === SUPER_USER.USER && TIPO && TIPO !== 'ADMINISTRADOR') {
      return res.status(400).json({ error: 'El super usuario debe ser ADMINISTRADOR' });
    }

    if (PASS && TIPO) {
      const hash = await bcrypt.hash(PASS, 10);
      await query('UPDATE USUARIOS SET PASS = ?, TIPO = ? WHERE `USER` = ?', [hash, TIPO, username]);
    } else if (PASS) {
      const hash = await bcrypt.hash(PASS, 10);
      await query('UPDATE USUARIOS SET PASS = ? WHERE `USER` = ?', [hash, username]);
    } else if (TIPO) {
      await query('UPDATE USUARIOS SET TIPO = ? WHERE `USER` = ?', [TIPO, username]);
    } else {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

router.delete('/:user', async (req, res) => {
  try {
    const username = String(req.params.user).toUpperCase();
    if (username === SUPER_USER.USER) {
      return res.status(400).json({ error: 'No se puede eliminar el super usuario' });
    }

    const rows = await query('SELECT `USER` FROM USUARIOS WHERE `USER` = ?', [username]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    await query('DELETE FROM USUARIOS WHERE `USER` = ?', [username]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
