const express = require('express');
const { query } = require('../db');
const { authRequired } = require('../middleware/auth');
const { downloadFoto } = require('../webdav');
const { publishStatus, isConnected } = require('../whatsapp');
const { composePublicacionImage, formatQ } = require('../compose-publicacion');

const router = express.Router();
router.use(authRequired);

async function loadPublicacionConFoto(id) {
  const rows = await query(
    `SELECT pub.ID, pub.IDALBUM, pub.CODPROD, p.DESPROD, p.PRECIO, p.FOTO
     FROM PUBLICACIONES pub
     INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
     WHERE pub.ID = ?`,
    [id]
  );
  if (!rows.length) return { error: 'Publicación no encontrada', status: 404 };
  const item = rows[0];
  if (!item.FOTO) {
    return {
      error: 'El producto no tiene foto. Agrega una foto antes de continuar.',
      status: 400,
      item,
    };
  }
  const photoBuffer = await downloadFoto(item.FOTO);
  if (!photoBuffer) {
    return {
      error: 'No se encontró la foto del producto en WebDAV',
      status: 404,
      item,
    };
  }
  return { item, photoBuffer };
}

/** Lista publicaciones; opcional ?album=ID */
router.get('/', async (req, res) => {
  try {
    const albumId = Number(req.query.album);
    const hasAlbum = Number.isFinite(albumId) && albumId > 0;

    const rows = await query(
      `
      SELECT pub.ID, pub.IDALBUM, pub.CODPROD, pub.FECHA,
             p.DESPROD, p.PRECIO, p.COSTO, p.FOTO
      FROM PUBLICACIONES pub
      INNER JOIN PRODUCTOS p ON p.CODPROD = pub.CODPROD
      ${hasAlbum ? 'WHERE pub.IDALBUM = ?' : ''}
      ORDER BY pub.FECHA DESC, pub.ID DESC
    `,
      hasAlbum ? [albumId] : []
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar publicaciones' });
  }
});

router.post('/', async (req, res) => {
  try {
    const codprod = String(req.body?.CODPROD || '').trim();
    const idalbum = Number(req.body?.IDALBUM);
    if (!codprod) {
      return res.status(400).json({ error: 'CODPROD es requerido' });
    }
    if (!Number.isFinite(idalbum) || idalbum <= 0) {
      return res.status(400).json({ error: 'IDALBUM es requerido' });
    }

    const album = await query('SELECT ID FROM ALBUMES WHERE ID = ?', [idalbum]);
    if (!album.length) {
      return res.status(404).json({ error: 'Álbum no encontrado' });
    }

    const prod = await query(
      'SELECT CODPROD, DESPROD, PRECIO, FOTO FROM PRODUCTOS WHERE CODPROD = ?',
      [codprod]
    );
    if (!prod.length) {
      return res.status(404).json({ error: 'Producto no encontrado en el catálogo' });
    }

    const exists = await query(
      'SELECT ID FROM PUBLICACIONES WHERE IDALBUM = ? AND CODPROD = ?',
      [idalbum, codprod]
    );
    if (exists.length) {
      return res.status(409).json({ error: 'Este producto ya está en este álbum' });
    }

    const result = await query(
      'INSERT INTO PUBLICACIONES (IDALBUM, CODPROD, FECHA) VALUES (?, ?, NOW())',
      [idalbum, codprod]
    );

    const rows = await query(
      `SELECT pub.ID, pub.IDALBUM, pub.CODPROD, pub.FECHA, p.DESPROD, p.PRECIO, p.COSTO, p.FOTO
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

/**
 * Descarga la imagen de publicación ya compuesta (logo + precio).
 * La foto original del producto no se modifica.
 */
router.get('/:id/imagen', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const loaded = await loadPublicacionConFoto(id);
    if (loaded.error) {
      return res.status(loaded.status).json({ error: loaded.error });
    }

    const composed = await composePublicacionImage({
      photoBuffer: loaded.photoBuffer,
      precio: loaded.item.PRECIO,
    });

    const safeName = String(loaded.item.CODPROD || id).replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.set(
      'Content-Disposition',
      `attachment; filename="publicacion-${safeName}.png"`
    );
    res.send(composed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al generar la imagen' });
  }
});

/** Publica en el Estado de WhatsApp la imagen compuesta (logo + precio) */
router.post('/:id/whatsapp', async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(409).json({
        error: 'WhatsApp no está conectado. Ve al menú WhatsApp e inicia sesión con el QR.',
      });
    }

    const id = Number(req.params.id);
    const loaded = await loadPublicacionConFoto(id);
    if (loaded.error) {
      return res.status(loaded.status).json({ error: loaded.error });
    }

    const item = loaded.item;
    const caption = `${String(item.DESPROD || '').trim()}\n${formatQ(item.PRECIO)}`;

    const image = await composePublicacionImage({
      photoBuffer: loaded.photoBuffer,
      precio: item.PRECIO,
    });

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
