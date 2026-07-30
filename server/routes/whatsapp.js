const express = require('express');
const { authRequired } = require('../middleware/auth');
const {
  startWhatsApp,
  logoutWhatsApp,
  getPublicStatus,
} = require('../whatsapp');

const router = express.Router();
router.use(authRequired);

router.get('/status', (_req, res) => {
  res.json(getPublicStatus());
});

router.post('/connect', async (_req, res) => {
  try {
    const status = await startWhatsApp();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'No se pudo iniciar WhatsApp' });
  }
});

router.post('/disconnect', async (_req, res) => {
  try {
    const status = await logoutWhatsApp();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'No se pudo cerrar WhatsApp' });
  }
});

module.exports = router;
