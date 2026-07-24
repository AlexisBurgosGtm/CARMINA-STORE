require('dotenv').config();
const { createClient } = require('webdav');

const WEBDAV_TIMEOUT_MS = Number(process.env.WEBDAV_TIMEOUT_MS) || 10 * 60 * 1000; // 10 min

function getStoreHost() {
  let host = (process.env.STORE_HOST || '').replace(/^['"]|['"]$/g, '');
  if (!host.endsWith('/')) host += '/';
  return host;
}

function createWebdavClient() {
  return createClient(getStoreHost(), {
    username: (process.env.STORE_USER || '').replace(/^['"]|['"]$/g, ''),
    password: (process.env.STORE_PASS || '').replace(/^['"]|['"]$/g, ''),
  });
}

const FOTOS_DIR = 'shop-store-fotos';

async function ensureFotosDir(client) {
  try {
    const exists = await client.exists(FOTOS_DIR);
    if (!exists) {
      await client.createDirectory(FOTOS_DIR);
    }
  } catch (err) {
    try {
      await client.createDirectory(FOTOS_DIR);
    } catch (_) {
      /* ya existe */
    }
  }
}

function withTimeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function uploadFoto(filename, buffer) {
  const client = createWebdavClient();
  await ensureFotosDir(client);
  const remotePath = `${FOTOS_DIR}/${filename}`;
  const { signal, clear } = withTimeoutSignal(WEBDAV_TIMEOUT_MS);
  try {
    await client.putFileContents(remotePath, buffer, {
      overwrite: true,
      contentLength: buffer.length,
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al subir la foto a WebDAV');
    }
    throw err;
  } finally {
    clear();
  }
  return remotePath;
}

async function downloadFoto(filename) {
  const client = createWebdavClient();
  const remotePath = `${FOTOS_DIR}/${filename}`;
  const { signal, clear } = withTimeoutSignal(WEBDAV_TIMEOUT_MS);
  try {
    const exists = await client.exists(remotePath, { signal });
    if (!exists) return null;
    const data = await client.getFileContents(remotePath, { signal });
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  } finally {
    clear();
  }
}

async function deleteFoto(filename) {
  if (!filename) return;
  const client = createWebdavClient();
  const remotePath = `${FOTOS_DIR}/${filename}`;
  const { signal, clear } = withTimeoutSignal(WEBDAV_TIMEOUT_MS);
  try {
    const exists = await client.exists(remotePath, { signal });
    if (exists) await client.deleteFile(remotePath, { signal });
  } catch (_) {
    /* ignore */
  } finally {
    clear();
  }
}

/** Elimina todas las fotos de un código (cualquier extensión), excepto keepFilename */
async function deleteFotosByCodigo(codprod, keepFilename = null) {
  const safe = String(codprod || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safe) return;

  const client = createWebdavClient();
  const { signal, clear } = withTimeoutSignal(WEBDAV_TIMEOUT_MS);
  try {
    await ensureFotosDir(client);
    const items = await client.getDirectoryContents(FOTOS_DIR, { signal });
    const list = Array.isArray(items) ? items : items?.data || [];
    for (const item of list) {
      const name = item.basename || item.filename?.split('/').pop();
      if (!name) continue;
      const isMatch =
        name === safe ||
        name.startsWith(`${safe}.`) ||
        name.startsWith(`${safe}_`);
      if (!isMatch) continue;
      if (keepFilename && name === keepFilename) continue;
      try {
        await client.deleteFile(`${FOTOS_DIR}/${name}`, { signal });
      } catch (_) {
        /* ignore */
      }
    }
  } catch (_) {
    // Fallback: borrar la conocida si listar falla
    if (keepFilename === null) {
      /* noop */
    }
  } finally {
    clear();
  }
}

module.exports = {
  uploadFoto,
  downloadFoto,
  deleteFoto,
  deleteFotosByCodigo,
  FOTOS_DIR,
  WEBDAV_TIMEOUT_MS,
};
