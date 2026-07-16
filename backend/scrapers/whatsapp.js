const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
let qrcode;
try { qrcode = require('qrcode-terminal'); } catch { qrcode = null; }

let sock = null;
let qrCode = null;
let store = null;
let connected = false;
let messagesBuffer = [];
let saveMessageFn = null;
const AUTH_DIR = path.join(process.env.USERPROFILE || '.', '.axispanel', 'wa_auth');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

async function start(phoneNumber) {
  if (sock) return { success: true, message: 'WhatsApp ya conectado' };

  ensureDir(AUTH_DIR);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[WhatsApp] Usando WA v${version.join('.')}, latest: ${isLatest}`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  store = makeInMemoryStore({ logger: console });
  store.readFromFile(path.join(AUTH_DIR, 'store.json'));

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    syncFullHistory: false,
    browser: ['AxisPanel', 'Chrome', '3.0'],
    generateHighQualityLink: true,
  });

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCode = qr;
      console.log('[WhatsApp] Nuevo QR generado (escanea con tu teléfono)');
      console.log('[WhatsApp] QR string:', qr);
      if (qrcode) qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      connected = true;
      qrCode = null;
      console.log('[WhatsApp] Conectado!');
    }
    if (connection === 'close') {
      connected = false;
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('[WhatsApp] Desconectado. Razón:', reason);
      if (reason === DisconnectReason.loggedOut) {
        console.log('[WhatsApp] Sesión cerrada. Limpiando auth...');
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      }
      sock = null;
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || 'Desconocido';
        const phone = sender?.replace('@s.whatsapp.net', '') || '';

        console.log(`[WhatsApp] Mensaje de ${pushName} (${phone}): ${text.slice(0, 100)}`);

        const entry = {
          from: phone,
          name: pushName,
          text,
          timestamp: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString(),
          raw: msg,
        };
        messagesBuffer.push(entry);

        if (saveMessageFn) {
          try {
            await saveMessageFn(entry);
          } catch (e) {
            console.error('[WhatsApp] Error guardando mensaje:', e.message);
          }
        }
      }
    }
  });

  return { success: true, message: 'WhatsApp iniciando. Revisá la terminal para el QR (o status endpoint)' };
}

function stop() {
  if (sock) {
    sock.end(new Error('Stopped by user'));
    sock = null;
    connected = false;
    store?.writeToFile(path.join(AUTH_DIR, 'store.json'));
    return { success: true, message: 'WhatsApp desconectado' };
  }
  return { success: false, message: 'No estaba conectado' };
}

function getStatus() {
  const authExists = fs.existsSync(path.join(AUTH_DIR, 'creds.json'));
  return {
    connected,
    qr: qrCode,
    authenticated: authExists,
    authDir: AUTH_DIR,
    messagesBuffer: messagesBuffer.length,
    phone: null,
  };
}

async function sendMessage(to, text) {
  if (!sock || !connected) throw new Error('WhatsApp no conectado');
  const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text });
  return result;
}

function setSaveMessageHandler(fn) {
  saveMessageFn = fn;
}

function getPendingMessages() {
  const msgs = [...messagesBuffer];
  messagesBuffer = [];
  return msgs;
}

module.exports = { start, stop, getStatus, sendMessage, setSaveMessageHandler, getPendingMessages };
