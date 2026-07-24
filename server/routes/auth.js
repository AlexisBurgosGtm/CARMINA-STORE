const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { SUPER_USER, signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const username = String(user).trim().toUpperCase();

    // Super usuario siempre válido (aunque no esté en DB)
    if (username === SUPER_USER.USER && pass === SUPER_USER.PASS) {
      const token = signToken(SUPER_USER);
      return res.json({
        token,
        user: { USER: SUPER_USER.USER, TIPO: SUPER_USER.TIPO },
      });
    }

    const rows = await query('SELECT `USER`, PASS, TIPO FROM USUARIOS WHERE `USER` = ?', [username]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const dbUser = rows[0];
    const ok = await bcrypt.compare(pass, dbUser.PASS);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = signToken(dbUser);
    res.json({
      token,
      user: { USER: dbUser.USER, TIPO: dbUser.TIPO },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.get('/me', authRequired, (req, res) => {
  res.json({ user: { USER: req.user.user, TIPO: req.user.tipo } });
});

module.exports = router;
