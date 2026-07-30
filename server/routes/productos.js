const express = require('express');
const multer = require('multer');
const path = require('path');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const { uploadFoto, downloadFoto, deleteFoto, deleteFotosByCodigo } = require('../webdav');
const { cotizarProducto } = require('../gemini');

const router = express.Router();

/** Límite de foto: 25 MB (más de 20) */
const MAX_FOTO_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FOTO_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Solo se permiten imágenes'), ok);
  },
});

/** Solo nombre de archivo basado en el código (la imagen vive en WebDAV) */
function buildFotoName(codprod, originalname, mimetype) {
  const safe = String(codprod).trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  let ext = path.extname(originalname || '').toLowerCase();
  if (!ext || ext.length > 5) {
    if (/png/i.test(mimetype || '')) ext = '.png';
    else if (/webp/i.test(mimetype || '')) ext = '.webp';
    else if (/gif/i.test(mimetype || '')) ext = '.gif';
    else ext = '.jpg';
  }
  return `${safe}${ext}`;
}

function uploadSingleFoto(req, res, next) {
  upload.single('foto')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `La foto supera el límite de ${Math.floor(MAX_FOTO_BYTES / (1024 * 1024))} MB`,
      });
    }
    return res.status(400).json({ error: err.message || 'Error al recibir la foto' });
  });
}

router.use(authRequired);

router.post('/cotizar', async (req, res) => {
  try {
    const descripcion = String(req.body?.descripcion || '').trim();
    if (!descripcion) {
      return res.status(400).json({ error: 'La descripción del producto es requerida' });
    }
    if (descripcion.length < 3) {
      return res.status(400).json({ error: 'Escribe al menos 3 caracteres para cotizar' });
    }
    const cotizacion = await cotizarProducto(descripcion);
    res.json(cotizacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al cotizar con Gemini' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT p.CODPROD, p.DESPROD, p.CODPROV, p.LASTUPDATE, p.COSTO, p.PRECIO, p.FACTOR, p.FOTO,
             pr.NOMPROV
      FROM PRODUCTOS p
      LEFT JOIN PROVEEDORES pr ON pr.CODPROV = p.CODPROV
      ORDER BY p.DESPROD
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar productos' });
  }
});

router.get('/:codprod', async (req, res) => {
  try {
    const rows = await query(`
      SELECT p.CODPROD, p.DESPROD, p.CODPROV, p.LASTUPDATE, p.COSTO, p.PRECIO, p.FACTOR, p.FOTO,
             pr.NOMPROV
      FROM PRODUCTOS p
      LEFT JOIN PROVEEDORES pr ON pr.CODPROV = p.CODPROV
      WHERE p.CODPROD = ?
    `, [req.params.codprod]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

router.get('/:codprod/foto', async (req, res) => {
  try {
    const rows = await query('SELECT FOTO FROM PRODUCTOS WHERE CODPROD = ?', [req.params.codprod]);
    if (!rows.length || !rows[0].FOTO) {
      return res.status(404).json({ error: 'Sin foto' });
    }
    const data = await downloadFoto(rows[0].FOTO);
    if (!data) return res.status(404).json({ error: 'Foto no encontrada en WebDAV' });

    const ext = path.extname(rows[0].FOTO).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' :
      ext === '.gif' ? 'image/gif' : 'image/jpeg';

    res.set('Content-Type', mime);
    res.set('Cache-Control', 'no-store');
    res.send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener foto' });
  }
});

router.post('/', uploadSingleFoto, async (req, res) => {
  try {
    const { CODPROD, DESPROD, CODPROV, COSTO, PRECIO, FACTOR } = req.body;
    if (!CODPROD || !DESPROD || !CODPROV || PRECIO === undefined || COSTO === undefined) {
      return res.status(400).json({ error: 'Campos requeridos: CODPROD, DESPROD, CODPROV, COSTO, PRECIO' });
    }

    const codprod = String(CODPROD).trim();
    if (!codprod) {
      return res.status(400).json({ error: 'El código de producto es requerido' });
    }

    const prov = await query('SELECT CODPROV FROM PROVEEDORES WHERE CODPROV = ?', [CODPROV]);
    if (!prov.length) return res.status(400).json({ error: 'Proveedor no existe' });

    const exists = await query(
      'SELECT CODPROD FROM PRODUCTOS WHERE CODPROD = ? OR UPPER(CODPROD) = UPPER(?)',
      [codprod, codprod]
    );
    if (exists.length) {
      return res.status(409).json({ error: 'Ya existe un producto con ese código' });
    }

    let factorVal = Number(FACTOR);
    if (!Number.isFinite(factorVal) || factorVal <= 0) {
      const setting = await query('SELECT VALOR FROM SETTINGS WHERE OPCION = ?', [
        'FACTOR CAMBIO MONEDA',
      ]);
      factorVal = setting[0] ? Number(setting[0].VALOR) : 2.2;
      if (!Number.isFinite(factorVal) || factorVal <= 0) factorVal = 2.2;
    }

    // En DB solo se guarda el nombre del archivo (basado en el código), nunca la imagen
    let fotoName = null;
    if (req.file) {
      fotoName = buildFotoName(codprod, req.file.originalname, req.file.mimetype);
      await uploadFoto(fotoName, req.file.buffer);
    }

    await query(
      `INSERT INTO PRODUCTOS (CODPROD, DESPROD, CODPROV, LASTUPDATE, COSTO, PRECIO, FACTOR, FOTO)
       VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        codprod,
        DESPROD.trim(),
        CODPROV.trim(),
        Number(COSTO),
        Number(PRECIO),
        factorVal,
        fotoName,
      ]
    );

    res.status(201).json({ ok: true, FOTO: fotoName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al crear producto' });
  }
});

router.put('/:codprod', uploadSingleFoto, async (req, res) => {
  try {
    const codprod = req.params.codprod;
    const { DESPROD, CODPROV, COSTO, PRECIO } = req.body;

    const rows = await query('SELECT * FROM PRODUCTOS WHERE CODPROD = ?', [codprod]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    const current = rows[0];
    const desprod = DESPROD ?? current.DESPROD;
    const codprov = CODPROV ?? current.CODPROV;
    const costo = COSTO !== undefined ? Number(COSTO) : Number(current.COSTO ?? 0);
    const precio = PRECIO !== undefined ? Number(PRECIO) : current.PRECIO;

    const prov = await query('SELECT CODPROV FROM PROVEEDORES WHERE CODPROV = ?', [codprov]);
    if (!prov.length) return res.status(400).json({ error: 'Proveedor no existe' });

    let fotoName = current.FOTO;
    if (req.file) {
      fotoName = buildFotoName(codprod, req.file.originalname, req.file.mimetype);
      // Quitar cualquier foto previa del mismo código; solo queda la nueva
      await deleteFotosByCodigo(codprod, null);
      await uploadFoto(fotoName, req.file.buffer);
    }

    await query(
      `UPDATE PRODUCTOS SET DESPROD = ?, CODPROV = ?, COSTO = ?, PRECIO = ?, FOTO = ?, LASTUPDATE = NOW()
       WHERE CODPROD = ?`,
      [desprod, codprov, costo, precio, fotoName, codprod]
    );

    res.json({ ok: true, FOTO: fotoName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al actualizar producto' });
  }
});

router.delete('/:codprod', async (req, res) => {
  try {
    const rows = await query('SELECT FOTO, CODPROD FROM PRODUCTOS WHERE CODPROD = ?', [
      req.params.codprod,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    // Eliminar foto(s) del producto en WebDAV
    await deleteFotosByCodigo(rows[0].CODPROD, null);
    if (rows[0].FOTO) await deleteFoto(rows[0].FOTO);

    await query('DELETE FROM PRODUCTOS WHERE CODPROD = ?', [req.params.codprod]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

router.post('/:codprod/cotizar', async (req, res) => {
  try {
    const rows = await query('SELECT DESPROD FROM PRODUCTOS WHERE CODPROD = ?', [req.params.codprod]);
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    const cotizacion = await cotizarProducto(rows[0].DESPROD);
    res.json(cotizacion);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al cotizar con Gemini' });
  }
});

module.exports = router;
