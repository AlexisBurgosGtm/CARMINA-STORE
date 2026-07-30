const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');

const AUTH_DIR = path.join(__dirname, 'data', 'whatsapp-auth');
const CONTACTS_FILE = path.join(__dirname, 'data', 'whatsapp-contacts.json');

/** @type {'idle'|'connecting'|'qr'|'connected'|'disconnected'} */
let connectionState = 'idle';
let lastQrDataUrl = null;
let lastError = null;
let sock = null;
let starting = false;
let intentionalLogout = false;
let userInfo = null;
/** @type {Set<string>} */
const contactJids = new Set();

function ensureDirs() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(CONTACTS_FILE), { recursive: true });
}

function loadContactsFromDisk() {
  try {
    if (!fs.existsSync(CONTACTS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      for (const jid of raw) {
        if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
          contactJids.add(jid);
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
}

function saveContactsToDisk() {
  try {
    ensureDirs();
    fs.writeFileSync(CONTACTS_FILE, JSON.stringify([...contactJids], null, 0));
  } catch (_) {
    /* ignore */
  }
}

function rememberJid(jid) {
  if (!jid || typeof jid !== 'string') return;
  const clean = jid.split(':')[0];
  if (!clean.endsWith('@s.whatsapp.net')) return;
  if (clean.includes('@lid')) return;
  if (!contactJids.has(clean)) {
    contactJids.add(clean);
    saveContactsToDisk();
  }
}

function rememberContacts(list) {
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const c of list) {
    const id = c?.id || c;
    if (typeof id !== 'string') continue;
    const clean = id.split(':')[0];
    if (clean.endsWith('@s.whatsapp.net') && !contactJids.has(clean)) {
      contactJids.add(clean);
      changed = true;
    }
  }
  if (changed) saveContactsToDisk();
}

async function loadBaileys() {
  return import('@whiskeysockets/baileys');
}

function getPublicStatus() {
  return {
    state: connectionState,
    connected: connectionState === 'connected',
    qr: connectionState === 'qr' ? lastQrDataUrl : null,
    user: userInfo,
    contacts: contactJids.size,
    error: lastError,
  };
}

async function startWhatsApp() {
  if (starting) return getPublicStatus();
  if (sock && connectionState === 'connected') return getPublicStatus();

  starting = true;
  intentionalLogout = false;
  lastError = null;
  connectionState = 'connecting';
  lastQrDataUrl = null;

  try {
    ensureDirs();
    loadContactsFromDisk();

    const baileys = await loadBaileys();
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const {
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      Browsers,
    } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end?.(undefined);
      } catch (_) {
        /* ignore */
      }
      sock = null;
    }

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      printQRInTerminal: false,
      getMessage: async () => undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('contacts.upsert', (contacts) => {
      rememberContacts(contacts);
    });

    sock.ev.on('contacts.update', (updates) => {
      rememberContacts(updates);
    });

    sock.ev.on('chats.upsert', (chats) => {
      for (const chat of chats || []) {
        rememberJid(chat.id);
      }
    });

    sock.ev.on('messaging-history.set', ({ contacts, chats }) => {
      rememberContacts(contacts);
      for (const chat of chats || []) {
        rememberJid(chat.id);
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          lastQrDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 320,
            color: { dark: '#134e4a', light: '#ffffff' },
          });
          connectionState = 'qr';
          userInfo = null;
        } catch (err) {
          lastError = err.message || 'No se pudo generar el QR';
        }
      }

      if (connection === 'open') {
        connectionState = 'connected';
        lastQrDataUrl = null;
        lastError = null;
        const me = sock?.user;
        userInfo = me
          ? {
              id: me.id,
              name: me.name || me.verifiedName || null,
              phone: String(me.id || '').split('@')[0]?.split(':')[0] || null,
            }
          : null;
        console.log('[WhatsApp] Conectado', userInfo?.phone || '');
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut || intentionalLogout;
        connectionState = 'disconnected';
        lastQrDataUrl = null;
        userInfo = null;
        sock = null;
        starting = false;

        if (loggedOut) {
          lastError = intentionalLogout ? null : 'Sesión cerrada. Escanea el QR de nuevo.';
          intentionalLogout = false;
          console.log('[WhatsApp] Sesión cerrada (logout)');
        } else {
          lastError = 'Conexión cerrada. Reintentando...';
          console.log('[WhatsApp] Desconectado, reconectando...', statusCode);
          setTimeout(() => {
            startWhatsApp().catch((err) => {
              lastError = err.message;
              connectionState = 'disconnected';
            });
          }, 2500);
        }
      }
    });

    starting = false;
    return getPublicStatus();
  } catch (err) {
    starting = false;
    connectionState = 'disconnected';
    lastError = err.message || 'Error al iniciar WhatsApp';
    sock = null;
    throw err;
  }
}

async function logoutWhatsApp() {
  intentionalLogout = true;
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      try {
        sock.end?.(undefined);
      } catch (_) {
        /* ignore */
      }
    }
  } finally {
    sock = null;
    userInfo = null;
    lastQrDataUrl = null;
    connectionState = 'disconnected';
    lastError = null;
    starting = false;
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
    } catch (_) {
      /* ignore */
    }
  }
  return getPublicStatus();
}

function getStatusJidList() {
  const list = new Set(contactJids);
  if (userInfo?.id) {
    const raw = String(userInfo.id).split(':')[0];
    if (raw.endsWith('@s.whatsapp.net')) list.add(raw);
    else if (/^\d+$/.test(raw)) list.add(`${raw}@s.whatsapp.net`);
  }
  if (userInfo?.phone && /^\d+$/.test(String(userInfo.phone))) {
    list.add(`${userInfo.phone}@s.whatsapp.net`);
  }
  return [...list].slice(0, 500);
}

/**
 * Publica una imagen (o texto) en el Estado de WhatsApp.
 * @param {{ image?: Buffer, caption: string }} payload
 */
async function publishStatus({ image, caption }) {
  if (!sock || connectionState !== 'connected') {
    const err = new Error('WhatsApp no está conectado. Ve a la sección WhatsApp e inicia sesión.');
    err.code = 'WA_NOT_CONNECTED';
    throw err;
  }

  const statusJidList = getStatusJidList();
  if (!statusJidList.length) {
    const err = new Error(
      'Aún no hay contactos sincronizados. Deja la sesión conectada unos minutos e inténtalo de nuevo.'
    );
    err.code = 'WA_NO_CONTACTS';
    throw err;
  }

  const text = String(caption || '').trim();
  const opts = {
    broadcast: true,
    statusJidList,
  };

  if (image && Buffer.isBuffer(image) && image.length) {
    await sock.sendMessage(
      'status@broadcast',
      { image, caption: text || undefined },
      opts
    );
  } else {
    if (!text) {
      throw new Error('Se requiere foto o texto para el estado');
    }
    await sock.sendMessage('status@broadcast', { text }, opts);
  }

  return { ok: true, recipients: statusJidList.length };
}

function isConnected() {
  return connectionState === 'connected' && !!sock;
}

module.exports = {
  startWhatsApp,
  logoutWhatsApp,
  getPublicStatus,
  publishStatus,
  isConnected,
};
