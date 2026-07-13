'use strict';

const fs   = require('fs');
const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL ERROR GUARDS — catch anything that would otherwise crash the process
// silently and leave Railway reporting "Crashed" with no useful log entry.
// ─────────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[KOOP Bot] UNCAUGHT EXCEPTION — process will restart:', err);
  // Give Railway/the logger a moment to flush, then exit so the platform
  // can restart the container (better than hanging in a broken state).
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  console.error('[KOOP Bot] UNHANDLED PROMISE REJECTION:', reason);
  // We intentionally keep the process alive here; a single rejected promise
  // (e.g. a failed message.reply) should not crash the whole bot.
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH-CHECK HTTP SERVER — started FIRST so Railway's port check passes
// immediately, even while Puppeteer/Chromium is still warming up.
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  console.log(`[KOOP Bot] Health-check server listening on port ${PORT}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// CHROMIUM BINARY DISCOVERY — try several well-known paths in priority order.
// ─────────────────────────────────────────────────────────────────────────────
function resolveChromiumPath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        console.log(`[KOOP Bot] Chromium found at: ${candidate}`);
        return candidate;
      }
    } catch (_) {
      // existsSync shouldn't throw, but be safe
    }
  }

  console.error(
    '[KOOP Bot] WARNING: No Chromium binary found at any known path. ' +
    'Tried: ' + candidates.join(', ') + '. ' +
    'Falling back to Puppeteer default (may fail).'
  );
  return undefined;
}

const executablePath = resolveChromiumPath();

// ─────────────────────────────────────────────────────────────────────────────
// BOT CONTENT
// ─────────────────────────────────────────────────────────────────────────────
const MAIN_MENU = `Bonjour ! Bienvenue chez KOOP Market. Comment pouvons-nous vous aider aujourd'hui ?

1. 📢 Chaîne WhatsApp : Rejoindre notre communauté
2. ℹ️ Infos : En savoir plus sur KOOP Market
3. 💼 Emploi : Besoin d'un travail ?
4. 🎓 Formation : Découvrir nos programmes
5. 🛒 Boutique : Accéder à la boutique KOOP
6. ✉️ Message particulier : Parler à un conseiller`;

const MENU_RESPONSES = {
  '1': `Cliquez ici pour rejoindre la chaîne WhatsApp KOOP Market : https://whatsapp.com/channel/0029Vb7vn4J8fewxV924lW1p`,
  '2': `Visitez notre site officiel pour tout savoir sur nous : https://koop-market.com`,
  '3': `KOOP Market est une plateforme qui partage des opportunités pour vous aider dans votre recherche. Nous n'engageons pas directement, mais nous centralisons les meilleures offres vérifiées pour vous. Pour voir les offres disponibles, rejoignez notre chaîne WhatsApp (Option 1) ou visitez : https://koop-market.com/#/jobs`,
  '4': `Découvrez nos formations et certifications : https://koop-market.com/#/services/training`,
  '5': `Accédez à la boutique KOOP pour voir nos articles et services : https://koop-market.com/#/koop`,
  '6': `Votre message sera transmis à un conseiller KOOP Market. Veuillez décrire votre demande ci-dessous ou écrivez directement à 📧 : contact@koop-market.com`,
};

// Track users who selected option 6 and are expected to send a free-form message
const awaitingMessage = new Set();

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const puppeteerConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu',
  ],
};

if (executablePath) {
  puppeteerConfig.executablePath = executablePath;
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'koop-market-bot' }),
  puppeteer: puppeteerConfig,
});

client.on('qr', (qr) => {
  console.log('\n[KOOP Bot] Scan the QR code below with WhatsApp to authenticate:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[KOOP Bot] Client is ready and listening for messages.');
});

client.on('auth_failure', (msg) => {
  console.error('[KOOP Bot] Authentication failure — check session or re-scan QR:', msg);
  // Give the logger time to flush before exiting
  setTimeout(() => process.exit(1), 500);
});

client.on('disconnected', (reason) => {
  console.warn('[KOOP Bot] Client disconnected (reason: ' + reason + '). Restarting process...');
  setTimeout(() => process.exit(1), 500);
});

client.on('message', async (message) => {
  if (message.fromMe) return;
  if (message.isGroupMsg) return;

  const sender = message.from;
  const body   = (message.body || '').trim();

  // Option 6 flow: user previously selected "Message particulier" — capture their free-form message
  if (awaitingMessage.has(sender)) {
    awaitingMessage.delete(sender);
    await message.reply(
      'Merci pour votre message ! Un conseiller KOOP Market vous contactera très bientôt. 🙏\n\n' + MAIN_MENU
    );
    return;
  }

  // Known menu option selected
  if (MENU_RESPONSES[body]) {
    await message.reply(MENU_RESPONSES[body]);
    if (body === '6') {
      awaitingMessage.add(sender);
    }
    return;
  }

  // Any unrecognised input → show main menu
  await message.reply(MAIN_MENU);
});

// ─────────────────────────────────────────────────────────────────────────────
// BOOT SEQUENCE — initialize the WhatsApp client (after the HTTP server)
// ─────────────────────────────────────────────────────────────────────────────
console.log('[KOOP Bot] Initializing WhatsApp client...');
client.initialize().catch((err) => {
  console.error('[KOOP Bot] client.initialize() threw an error:', err);
  setTimeout(() => process.exit(1), 500);
});
