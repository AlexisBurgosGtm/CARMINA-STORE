const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const { downloadFoto } = require('../webdav');
const { publishStatus, isConnected } = require('../whatsapp');

const router = express.Router();
router.use(authRequired);

function formatQ(n) {
  return `Q ${Number(n || 0).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

router.get('/', async (_req, res) => {
  try {
    const rows = await query(`
      SELECT pub.ID, pub.CODPROD, pub.FECHA,
             p.DESPROD, p.PRECIO, p.COSTO, p.FOTO
      FROM PUBLICACIONES pub
      INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
      ORDER BY pub.FECHA DESC, pub.ID DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar publicaciones' });
  }
});

router.post('/', async (req, res) => {
  try {
    const codprod = String(req.body?.CODPROD || '').trim();
    if (!codprod) {
      return res.status(400).json({ error: 'CODPROD es requerido' });
    }

    const prod = await query(
      'SELECT CODPROD, DESPROD, PRECIO, FOTO FROM PRODUCTOS WHERE CODPROD = ?',
      [codprod]
    );
    if (!prod.length) {
      return res.status(404).json({ error: 'Producto no encontrado en el catálogo' });
    }

    const exists = await query('SELECT ID FROM PUBLICACIONES WHERE CODPROD = ?', [codprod]);
    if (exists.length) {
      return res.status(409).json({ error: 'Este producto ya está en publicaciones' });
    }

    const result = await query(
      'INSERT INTO PUBLICACIONES (CODPROD, FECHA) VALUES (?, NOW())',
      [codprod]
    );

    const rows = await query(
      `SELECT pub.ID, pub.CODPROD, pub.FECHA, p.DESPROD, p.PRECIO, p.COSTO, p.FOTO
       FROM PUBLICACIONES pub
       INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
       WHERE pub.ID = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al agregar publicación' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const rows = await query('SELECT ID FROM PUBLICACIONES WHERE ID = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Publicación no encontrada' });
    await query('DELETE FROM PUBLICACIONES WHERE ID = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar publicación' });
  }
});

/** Pendiente de implementar la publicación real en redes */
router.post('/:id/publicar', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      `SELECT pub.ID, pub.CODPROD, p.DESPROD, p.PRECIO
       FROM PUBLICACIONES pub
       INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
       WHERE pub.ID = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Publicación no encontrada' });
    res.status(501).json({
      error: 'Publicar en redes sociales aún no está implementado',
      pendiente: true,
      item: rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al publicar' });
  }
});

/** Publica en el Estado de WhatsApp del dispositivo vinculado con Baileys */
router.post('/:id/whatsapp', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(409).json({
        error: 'WhatsApp no está conectado. Ve al menú WhatsApp e inicia sesión con el QR.',
      });
    }

    const id = Number(req.params.id);
    const rows = await query(
      `SELECT pub.ID, pub.CODPROD, p.DESPROD, p.PRECIO, p.FOTO
       FROM PUBLICACIONES pub
       INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
       WHERE pub.ID = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Publicación no encontrada' });

    const item = rows[0];
    const caption = `${String(item.DESPROD || '').trim()}\n${formatQ(item.PRECIO)}`;

    let image;
    if (item.FOTO) {
      image = await downloadFoto(item.FOTO);
      if (!image) {
        return res.status(404).json({
          error: 'No se encontró la foto del producto en WebDAV',
        });
      }
    } else {
      return res.status(400).json({
        error: 'El producto no tiene foto. Agrega una foto antes de publicar en WhatsApp.',
      });
    }

    const result = await publishStatus({ image, caption });
    res.json({
      ok: true,
      message: 'Publicado en Estado de WhatsApp',
      caption,
      recipients: result.recipients,
    });
  } catch (err) {
    console.error(err);
    const status =
      err.code === 'WA_NOT_CONNECTED' || err.code === 'WA_NO_CONTACTS' ? 409 : 500;
    res.status(status).json({ error: err.message || 'Error al publicar en WhatsApp' });
  }
});

module.exports = router;
