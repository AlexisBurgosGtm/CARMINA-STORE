const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { SUPER_USER, signToken, authRequired } = require('../middleware/auth');
const {
  parseCredential,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
} = require('../webauthn');

const router = express.Router();

function normalizeUser(user) {
  return String(user || '').trim().toUpperCase();
}

async function findUser(username) {
  const rows = await query(
    'SELECT `USER`, PASS, TIPO, WEBAUTHN FROM USUARIOS WHERE `USER` = ?',
    [username]
  );
  return rows[0] || null;
}

router.post('/login', async (req, res) => {
  try {
    const { user, pass } = req.body;
    if (!user || !pass) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const username = normalizeUser(user);

    // Super usuario siempre válido (aunque no esté en DB)
    if (username === SUPER_USER.USER && pass === SUPER_USER.PASS) {
      const token = signToken(SUPER_USER);
      const dbUser = await findUser(username);
      return res.json({
        token,
        user: { USER: SUPER_USER.USER, TIPO: SUPER_USER.TIPO },
        webauthnRegistered: !!parseCredential(dbUser?.WEBAUTHN),
      });
    }

    const dbUser = await findUser(username);
    if (!dbUser) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const ok = await bcrypt.compare(pass, dbUser.PASS);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = signToken(dbUser);
    res.json({
      token,
      user: { USER: dbUser.USER, TIPO: dbUser.TIPO },
      webauthnRegistered: !!parseCredential(dbUser.WEBAUTHN),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  try {
    const dbUser = await findUser(req.user.user);
    res.json({
      user: { USER: req.user.user, TIPO: req.user.tipo },
      webauthnRegistered: !!parseCredential(dbUser?.WEBAUTHN),
    });
  } catch (err) {
    console.error(err);
    res.json({ user: { USER: req.user.user, TIPO: req.user.tipo }, webauthnRegistered: false });
  }
});

router.get('/webauthn/status/:user', async (req, res) => {
  try {
    const username = normalizeUser(req.params.user);
    if (!username) return res.status(400).json({ error: 'Usuario requerido' });
    const dbUser = await findUser(username);
    res.json({
      registered: !!parseCredential(dbUser?.WEBAUTHN),
      supported: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar biometría' });
  }
});

router.post('/webauthn/register/options', authRequired, async (req, res) => {
  try {
    const username = normalizeUser(req.user.user);
    const dbUser = await findUser(username);
    if (!dbUser && username !== SUPER_USER.USER) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const existing = parseCredential(dbUser?.WEBAUTHN);
    const options = await buildRegistrationOptions(req, username, existing);
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al preparar registro biométrico' });
  }
});

router.post('/webauthn/register/verify', authRequired, async (req, res) => {
  try {
    const username = normalizeUser(req.user.user);
    const dbUser = await findUser(username);
    if (!dbUser && username !== SUPER_USER.USER) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const credential = await verifyRegistration(req, username, req.body);
    await query('UPDATE USUARIOS SET WEBAUTHN = ? WHERE `USER` = ?', [
      JSON.stringify(credential),
      username,
    ]);

    // Si ALEXIS no estuviera en DB (caso raro), asegurar fila
    if (username === SUPER_USER.USER && !dbUser) {
      const hash = await bcrypt.hash(SUPER_USER.PASS, 10);
      await query(
        'INSERT INTO USUARIOS (`USER`, PASS, TIPO, WEBAUTHN) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE WEBAUTHN = VALUES(WEBAUTHN)',
        [SUPER_USER.USER, hash, SUPER_USER.TIPO, JSON.stringify(credential)]
      );
    }

    res.json({ ok: true, verified: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'No se pudo registrar la biometría' });
  }
});

router.post('/webauthn/login/options', async (req, res) => {
  try {
    const username = normalizeUser(req.body?.user);
    if (!username) {
      return res.status(400).json({ error: 'Usuario requerido' });
    }
    const dbUser = await findUser(username);
    if (!dbUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const existing = parseCredential(dbUser.WEBAUTHN);
    if (!existing) {
      return res.status(400).json({ error: 'Este usuario aún no tiene biometría registrada' });
    }
    const options = await buildAuthenticationOptions(req, username, existing);
    res.json(options);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al preparar biometría' });
  }
});

router.post('/webauthn/login/verify', async (req, res) => {
  try {
    const username = normalizeUser(req.body?.user);
    const response = req.body?.credential;
    if (!username || !response) {
      return res.status(400).json({ error: 'Usuario y credencial requeridos' });
    }

    const dbUser = await findUser(username);
    if (!dbUser) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const existing = parseCredential(dbUser.WEBAUTHN);
    const result = await verifyAuthentication(req, username, response, existing);

    const updated = { ...existing, counter: result.counter };
    await query('UPDATE USUARIOS SET WEBAUTHN = ? WHERE `USER` = ?', [
      JSON.stringify(updated),
      username,
    ]);

    const token = signToken(dbUser);
    res.json({
      token,
      user: { USER: dbUser.USER, TIPO: dbUser.TIPO },
      webauthnRegistered: true,
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: err.message || 'Autenticación biométrica fallida' });
  }
});

module.exports = router;
