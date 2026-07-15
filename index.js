'use strict';

const fs   = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ════════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR GUARDS — catch anything that would otherwise crash the process
// silently and leave Railway reporting "Crashed" with no useful log entry.
// ════════════════════════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
  console.error('[KOOP Bot] UNCAUGHT EXCEPTION — process will restart:', err);
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  console.error('[KOOP Bot] UNHANDLED PROMISE REJECTION:', reason);
});

// ════════════════════════════════════════════════════════════════════════════════
// HEALTH-CHECK HTTP SERVER — started FIRST so Railway's port check passes
// immediately, even while Puppeteer/Chromium is still warming up.
// ════════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT, () => {
  console.log(`[KOOP Bot] Health-check server listening on port ${PORT}`);
});

// ════════════════════════════════════════════════════════════════════════════════
// CHROMIUM BINARY DISCOVERY — uses `which` to find the binary wherever
// Railway/Nixpacks installed it (path varies between builds).
// ════════════════════════════════════════════════════════════════════════════════
function resolveChromiumPath() {
  console.log('[KOOP Bot] Starting Chromium binary discovery...');

  // 1. Check env var override first
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log('[KOOP Bot] PUPPETEER_EXECUTABLE_PATH env var set: ' + envPath);
    if (fs.existsSync(envPath)) {
      console.log('[KOOP Bot] ✓ Env var path exists and will be used.');
      return envPath;
    }
    console.log('[KOOP Bot] ✗ Env var path does NOT exist on disk, continuing search...');
  }

  // 2. System search using `which` — this finds the binary wherever Nixpacks put it
  const binaries = ['chromium', 'google-chrome', 'chromium-browser', 'google-chrome-stable'];

  for (const bin of binaries) {
    try {
      const foundPath = execSync(`which ${bin}`).toString().trim();
      if (foundPath && fs.existsSync(foundPath)) {
        console.log(`[KOOP Bot] System search for ${bin}: ${foundPath}`);
        console.log('[KOOP Bot] ✓ Binary found and verified. Using: ' + foundPath);
        return foundPath;
      }
    } catch (_) {
      console.log(`[KOOP Bot] System search for ${bin}: not found in PATH`);
    }
  }

  // 3. Fallback: probe well-known hardcoded paths
  const fallbackPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/nix/store/chromium',
  ];

  for (const candidate of fallbackPaths) {
    try {
      if (fs.existsSync(candidate)) {
        console.log('[KOOP Bot] ✓ Fallback path found: ' + candidate);
        return candidate;
      }
    } catch (_) { /* skip */ }
  }

  // 4. Last resort: search /nix/store for any chromium binary
  try {
    const nixSearch = execSync('find /nix/store -name "chromium" -type f -executable 2>/dev/null | head -1').toString().trim();
    if (nixSearch) {
      console.log('[KOOP Bot] ✓ Nix store search found: ' + nixSearch);
      return nixSearch;
    }
  } catch (_) {
    console.log('[KOOP Bot] Nix store search failed or returned empty.');
  }

  try {
    const nixSearch2 = execSync('find /nix/store -name "google-chrome" -type f -executable 2>/dev/null | head -1').toString().trim();
    if (nixSearch2) {
      console.log('[KOOP Bot] ✓ Nix store search found google-chrome: ' + nixSearch2);
      return nixSearch2;
    }
  } catch (_) { /* skip */ }

  console.error(
    '[KOOP Bot] ✗ CRITICAL: No Chromium binary found anywhere. ' +
    'Puppeteer will attempt its default (bundled) path — this may fail on Railway.'
  );
  return undefined;
}

const executablePath = resolveChromiumPath();
console.log('[KOOP Bot] Final Chromium executablePath: ' + (executablePath || 'NONE (using Puppeteer default)'));

// ════════════════════════════════════════════════════════════════════════════════
// BOT CONTENT
// ════════════════════════════════════════════════════════════════════════════════
const MAIN_MENU = `Veuillez choisir une option en tapant le numéro correspondant :

1. 📢 Chaîne WhatsApp : Rejoindre notre communauté
2. ℹ️ Infos : En savoir plus sur KOOP Market
3. 💼 Emploi : Besoin d'un travail ?
4. 🎓 Formation : Découvrir nos programmes
5. 🛒 Boutique : Accéder à la boutique KOOP
6. ✉️ Message particulier : Nous contacter par e-mail`;

const MENU_RESPONSES = {
  '1': `Cliquez ici pour rejoindre la chaîne WhatsApp KOOP Market : https://whatsapp.com/channel/0029Vb7vn4J8fewxV924lW1p`,
  '2': `Visitez notre site officiel pour tout savoir sur nous : https://koop-market.com`,
  '3': `KOOP Market est une plateforme qui partage des opportunités pour vous aider dans votre recherche. Nous n'engageons pas directement, mais nous centralisons les meilleures offres vérifiées pour vous. Pour voir les offres disponibles, rejoignez notre chaîne WhatsApp (Option 1) ou visitez : https://koop-market.com/#/jobs`,
  '4': `Découvrez nos formations et certifications : https://koop-market.com/#/services/training`,
  '5': `Accédez à la boutique KOOP pour voir nos articles et services : https://koop-market.com/#/koop`,
  '6': `Pour toute demande particulière, veuillez nous écrire directement à l'adresse suivante : contact@koop-market.com`,
};

// ——— Concluding / Politeness Keywords ————————————————————————————————————————————————
const CONCLUDING_KEYWORDS = [
  'merci', 'thanks', 'thank you', 'ok', 'okay',
  "d'accord", 'daccord', 'bien reçu', 'reçu', 'received'
];

const POLITE_EXIT_REPLY = 'Je vous en prie ! KOOP Market reste à votre disposition.';

function isConcludingMessage(text) {
  const normalized = text.trim().toLowerCase();
  return CONCLUDING_KEYWORDS.some(kw => normalized === kw);
}

// Track users who selected option 6 and are expected to send a free-form message
const awaitingMessage = new Set();

// ════════════════════════════════════════════════════════════════════════════════
// WHATSAPP CLIENT
// ════════════════════════════════════════════════════════════════════════════════
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

  // 1. Check concluding/politeness keywords FIRST
  if (isConcludingMessage(body)) {
    await message.reply(POLITE_EXIT_REPLY);
    return;
  }

  // Option 6 flow: user previously selected "Message particulier" — capture their free-form message
  if (awaitingMessage.has(sender)) {
    awaitingMessage.delete(sender);
    await message.reply(
      'Merci ! Pour toute demande, écrivez-nous directement à : contact@koop-market.com\n\n' + MAIN_MENU
    );
    return;
  }

  // 2. Check if it's a menu number (1-6)
  if (['1', '2', '3', '4', '5', '6'].includes(body)) {
    await message.reply(MENU_RESPONSES[body]);
    if (body === '6') {
      awaitingMessage.add(sender);
    }
    return;
  }

  // 3. Fallback: send the full menu directly
  await message.reply(MAIN_MENU);
});

// ════════════════════════════════════════════════════════════════════════════════
// BOOT SEQUENCE — initialize the WhatsApp client (after the HTTP server)
// ════════════════════════════════════════════════════════════════════════════════
console.log('[KOOP Bot] Initializing WhatsApp client...');
client.initialize().catch((err) => {
  console.error('[KOOP Bot] client.initialize() threw an error:', err);
  setTimeout(() => process.exit(1), 500);
});
