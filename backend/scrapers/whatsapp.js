const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

let sock = null;
let qrCode = null;
let qrDataUrl = null;
let connected = false;
let connecting = false;
let messagesBuffer = [];
let saveMessageFn = null;
const contacts = new Map(); // jid -> { jid, phone, name, notify, verifiedName, imgUrl, status }
const AUTH_DIR = path.join(process.env.USERPROFILE || '.', '.axispanel', 'wa_auth');

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function toPhone(id, phoneNumber) {
  if (phoneNumber) return String(phoneNumber).replace(/[^0-9]/g, '');
  return String(id || '').replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
}

function upsertContact(c) {
  if (!c || !c.id) return;
  const jid = c.id;
  // Saltar grupos, broadcasts y newsletters
  if (jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@newsletter')) return;
  const phone = toPhone(jid, c.phoneNumber);
  if (!phone) return;
  const prev = contacts.get(jid) || {};
  contacts.set(jid, {
    jid,
    phone,
    name: c.name || prev.name || c.notify || c.verifiedName || phone,
    notify: c.notify || prev.notify || '',
    verifiedName: c.verifiedName || prev.verifiedName || '',
    imgUrl: c.imgUrl || prev.imgUrl || null,
    status: c.status || prev.status || '',
  });
}

async function start() {
  if (sock) return { success: true, message: 'WhatsApp ya conectado' };
  connecting = true;

  ensureDir(AUTH_DIR);

  const { version } = await fetchLatestBaileysVersion();
  console.log(`[WhatsApp] Usando WA v${version.join('.')}`);

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    version,
    auth: state,
    syncFullHistory: false,
    browser: ['AxisPanel', 'Chrome', '3.0'],
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrCode = qr;
      try { qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 }); } catch { qrDataUrl = null; }
      console.log('[WhatsApp] Nuevo QR generado — escanéalo desde el panel');
    }
    if (connection === 'open') {
      connected = true;
      connecting = false;
      qrCode = null;
      qrDataUrl = null;
      console.log('[WhatsApp] Conectado!');
      if (sock && sock.user && sock.user.id) contacts.delete(sock.user.id);
    }
    if (connection === 'close') {
      connected = false;
      const reason = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output ? lastDisconnect.error.output.statusCode : undefined;
      console.log('[WhatsApp] Desconectado. Razón:', reason);
      sock = null;
      qrCode = null;
      qrDataUrl = null;
      if (reason === DisconnectReason.loggedOut) {
        console.log('[WhatsApp] Sesión inválida — limpiando auth y regenerando QR...');
        contacts.clear();
        try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); }
        catch (e) {
          console.error('[WhatsApp] Error limpiando auth:', e.message);
          setTimeout(() => { try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e2) {} }, 1500);
        }
        connecting = true;
        setTimeout(() => { start().catch(e => console.error('[WhatsApp] Reintento error:', e.message)); }, 2000);
      } else if (connecting) {
        console.log('[WhatsApp] QR expirado — regenerando en 2.5s...');
        setTimeout(() => { start().catch(e => console.error('[WhatsApp] Reintento error:', e.message)); }, 2500);
      }
    }
  });

  sock.ev.on('contacts.upsert', (list) => { for (const c of list || []) upsertContact(c); });
  sock.ev.on('contacts.update', (list) => { for (const c of list || []) upsertContact(c); });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message) {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        const sender = msg.key.remoteJid;
        const pushName = msg.pushName || 'Desconocido';
        const phone = sender ? sender.replace('@s.whatsapp.net', '') : '';

        console.log(`[WhatsApp] Mensaje de ${pushName} (${phone}): ${text.slice(0, 100)}`);

        const entry = {
          from: phone,
          name: pushName,
          text,
          timestamp: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toISOString() : new Date().toISOString(),
        };
        messagesBuffer.push(entry);

        if (saveMessageFn) {
          try { await saveMessageFn(entry); } catch (e) { console.error('[WhatsApp] Error guardando mensaje:', e.message); }
        }
      }
    }
  });

  return { success: true, message: 'WhatsApp iniciando. Escanea el QR en el panel' };
}

function stop() {
  connecting = false;
  if (sock) {
    try { sock.end(new Error('Stopped by user')); } catch (e) {}
    sock = null;
    connected = false;
    qrCode = null;
    qrDataUrl = null;
    return { success: true, message: 'WhatsApp desconectado' };
  }
  return { success: false, message: 'No estaba conectado' };
}

function getStatus() {
  return {
    connected,
    qr: qrCode,
    qrDataUrl,
    authenticated: fs.existsSync(path.join(AUTH_DIR, 'creds.json')),
    contacts: contacts.size,
    messagesBuffer: messagesBuffer.length,
  };
}

async function sendMessage(to, text) {
  if (!sock || !connected) throw new Error('WhatsApp no conectado');
  const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
  return await sock.sendMessage(jid, { text });
}

function setSaveMessageHandler(fn) { saveMessageFn = fn; }

function getContacts() {
  return Array.from(contacts.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getPendingMessages() {
  const msgs = [...messagesBuffer];
  messagesBuffer = [];
  return msgs;
}

module.exports = { start, stop, getStatus, sendMessage, setSaveMessageHandler, getPendingMessages, getContacts };
