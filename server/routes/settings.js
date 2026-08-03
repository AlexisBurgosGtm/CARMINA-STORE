const express = require('express');
const multer = require('multer');
const { query } = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const {
  GEMINI_MODELS,
  SETTING_MODELO,
  isAllowedGeminiModel,
} = require('../gemini-models');
const { consultarTipoCambioMxnPorGtq } = require('../google-finance');
const {
  COLOR_OPTION,
  FORMA_OPTION,
  isValidColor,
  isValidForma,
  normalizeColor,
  normalizeForma,
  colorOptions,
  formaOptions,
} = require('../badge-precio');

const router = express.Router();

const SECRET_OPTION = 'CLAVE VERIFICACIONES';
const FACTOR_OPTION = 'FACTOR CAMBIO MONEDA';
const LOGO_OPTION = 'LOGO EMPRESA';
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (_req, file, cb) => {
    // PNG/WebP/GIF conservan transparencia; JPEG también permitido
    const ok = /^image\/(png|webp|gif|jpeg|jpg)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Solo imágenes PNG, WebP, GIF o JPEG'), ok);
  },
});

function parseDataUrl(valor) {
  const raw = String(valor || '');
  const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!m) return null;
  return {
    mime: m[1].toLowerCase(),
    buffer: Buffer.from(m[2].replace(/\s+/g, ''), 'base64'),
  };
}

function hasLogoValue(valor) {
  return !!(valor && String(valor).startsWith('data:image/'));
}

/** Público: sirve el logo de empresa (con transparencias PNG/WebP) */
router.get('/logo', async (_req, res) => {
  try {
    const rows = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [LOGO_OPTION]);
    if (!rows.length || !hasLogoValue(rows[0].VALOR)) {
      return res.status(404).json({ error: 'Logo no configurado' });
    }
    const parsed = parseDataUrl(rows[0].VALOR);
    if (!parsed || !parsed.buffer.length) {
      return res.status(404).json({ error: 'Logo inválido' });
    }
    res.set('Content-Type', parsed.mime);
    res.set('Cache-Control', 'no-store');
    res.send(parsed.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener logo' });
  }
});

router.use(authRequired);

router.get('/', adminRequired, async (_req, res) => {
  try {
    const rows = await query('SELECT OPCION, VALOR FROM SETTINGS ORDER BY OPCION');
    const safe = rows.map((r) => {
      if (r.OPCION === SECRET_OPTION) {
        return { OPCION: r.OPCION, VALOR: '', secreta: true };
      }
      if (r.OPCION === LOGO_OPTION) {
        return {
          OPCION: r.OPCION,
          VALOR: '',
          isLogo: true,
          hasLogo: hasLogoValue(r.VALOR),
          mime: hasLogoValue(r.VALOR) ? parseDataUrl(r.VALOR)?.mime || null : null,
        };
      }
      return r;
    });
    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar configuraciones' });
  }
});

router.get('/gemini-models', adminRequired, (_req, res) => {
  res.json({ models: GEMINI_MODELS, setting: SETTING_MODELO });
});

router.get('/badge-precio-options', adminRequired, (_req, res) => {
  res.json({
    colores: colorOptions(),
    formas: formaOptions(),
    colorOption: COLOR_OPTION,
    formaOption: FORMA_OPTION,
  });
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

/** Sube / reemplaza logo de empresa (PNG/WebP preferidos por transparencias) */
router.post('/logo', adminRequired, (req, res) => {
  uploadLogo.single('logo')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: `El logo no puede superar ${Math.floor(MAX_LOGO_BYTES / (1024 * 1024))} MB`,
        });
      }
      return res.status(400).json({ error: err.message || 'Error al recibir el logo' });
    }
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ error: 'Selecciona una imagen de logo' });
      }
      const mime = (req.file.mimetype || 'image/png').toLowerCase().replace('image/jpg', 'image/jpeg');
      const dataUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

      const rows = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [LOGO_OPTION]);
      if (!rows.length) {
        await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [LOGO_OPTION, dataUrl]);
      } else {
        await query('UPDATE SETTINGS SET VALOR = ? WHERE OPCION = ?', [dataUrl, LOGO_OPTION]);
      }

      res.json({
        ok: true,
        OPCION: LOGO_OPTION,
        hasLogo: true,
        mime,
        url: `/api/settings/logo?t=${Date.now()}`,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Error al guardar el logo' });
    }
  });
});

router.delete('/logo', adminRequired, async (_req, res) => {
  try {
    const rows = await query('SELECT OPCION FROM SETTINGS WHERE OPCION = ?', [LOGO_OPTION]);
    if (!rows.length) {
      await query('INSERT INTO SETTINGS (OPCION, VALOR) VALUES (?, ?)', [LOGO_OPTION, '']);
    } else {
      await query('UPDATE SETTINGS SET VALOR = ? WHERE OPCION = ?', ['', LOGO_OPTION]);
    }
    res.json({ ok: true, OPCION: LOGO_OPTION, hasLogo: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar el logo' });
  }
});

router.get('/:opcion', async (req, res) => {
  try {
    const opcion = decodeURIComponent(req.params.opcion);
    if (opcion === SECRET_OPTION) {
      return res.status(403).json({ error: 'No se puede consultar esta opción directamente' });
    }
    if (opcion === LOGO_OPTION) {
      const rows = await query('SELECT OPCION, VALOR FROM SETTINGS WHERE OPCION = ?', [opcion]);
      if (!rows.length) return res.status(404).json({ error: 'Opción no encontrada' });
      return res.json({
        OPCION: LOGO_OPTION,
        hasLogo: hasLogoValue(rows[0].VALOR),
        mime: hasLogoValue(rows[0].VALOR) ? parseDataUrl(rows[0].VALOR)?.mime || null : null,
        url: hasLogoValue(rows[0].VALOR) ? `/api/settings/logo?t=${Date.now()}` : null,
      });
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
    if (opcion === LOGO_OPTION) {
      return res.status(400).json({
        error: 'Usa POST /api/settings/logo para subir el logo de empresa',
      });
    }
    const { VALOR } = req.body;
    if (VALOR === undefined || VALOR === null || String(VALOR).trim() === '') {
      return res.status(400).json({ error: 'VALOR es requerido' });
    }

    let valor = String(VALOR).trim();

    if (opcion === SETTING_MODELO && !isAllowedGeminiModel(valor)) {
      return res.status(400).json({
        error: 'Modelo Gemini no permitido',
        models: GEMINI_MODELS.map((m) => m.id),
      });
    }

    if (opcion === COLOR_OPTION) {
      if (!isValidColor(valor)) {
        return res.status(400).json({
          error: 'Color de badge no permitido',
          options: colorOptions().map((c) => c.id),
        });
      }
      valor = normalizeColor(valor);
    }

    if (opcion === FORMA_OPTION) {
      if (!isValidForma(valor)) {
        return res.status(400).json({
          error: 'Forma de badge no permitida',
          options: formaOptions().map((f) => f.id),
        });
      }
      valor = normalizeForma(valor);
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
