'use strict';

const fs   = require('fs');
const http = require('http');
const { execSync } = require('child_process');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR GUARDS — catch anything that would otherwise crash the process
// silently and leave Railway reporting "Crashed" with no useful log entry.
// ═══════════════════════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
  console.error('[KOOP Bot] UNCAUGHT EXCEPTION — process will restart:', err);
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason) => {
  console.error('[KOOP Bot] UNHANDLED PROMISE REJECTION:', reason);
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH-CHECK HTTP SERVER — started FIRST so Railway's port check passes
// immediately, even while Puppeteer/Chromium is still warming up.
// ═══════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK 🌐 KOOP Bot v11 running');
}).listen(PORT, () => {
  console.log(`[KOOP Bot] Health-check server listening on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// LD_LIBRARY_PATH FIX — Dynamically find all /nix/store lib directories
// and inject them so Chromium can locate its shared libraries (libglib, etc.).
// This runs BEFORE Chromium is launched.
// ═══════════════════════════════════════════════════════════════════════════════
function fixLibraryPath() {
  console.log('[KOOP Bot] [LD_FIX] Scanning /nix/store for shared library directories...');
  const startTime = Date.now();

  try {
    // Find all 'lib' directories in /nix/store that contain .so files
    const cmd = `find /nix/store -maxdepth 3 -type d -name "lib" 2>/dev/null | head -n 200`;
    const result = execSync(cmd, { timeout: 30000 }).toString().trim();

    if (result) {
      const libDirs = result.split('\n').filter(d => d.length > 0);
      const currentLdPath = process.env.LD_LIBRARY_PATH || '';
      const newLdPath = libDirs.join(':') + (currentLdPath ? ':' + currentLdPath : '');
      process.env.LD_LIBRARY_PATH = newLdPath;
      console.log(`[KOOP Bot] [LD_FIX] Found ${libDirs.length} lib directories in ${Date.now() - startTime}ms`);
      console.log(`[KOOP Bot] [LD_FIX] LD_LIBRARY_PATH set (first 3 entries): ${libDirs.slice(0, 3).join(', ')}...`);
    } else {
      console.log('[KOOP Bot] [LD_FIX] No lib directories found in /nix/store');
    }
  } catch (err) {
    console.error('[KOOP Bot] [LD_FIX] Error scanning for libraries:', err.message);
  }

  // Also try a more targeted approach: find directories containing libglib specifically
  try {
    const glibCmd = `find /nix/store -name "libglib-2.0.so*" -type f 2>/dev/null | head -n 5`;
    const glibResult = execSync(glibCmd, { timeout: 15000 }).toString().trim();
    if (glibResult) {
      const glibDirs = glibResult.split('\n').map(f => f.substring(0, f.lastIndexOf('/')));
      const currentLdPath = process.env.LD_LIBRARY_PATH || '';
      for (const dir of glibDirs) {
        if (!currentLdPath.includes(dir)) {
          process.env.LD_LIBRARY_PATH = dir + ':' + process.env.LD_LIBRARY_PATH;
        }
      }
      console.log(`[KOOP Bot] [LD_FIX] Found libglib in: ${glibDirs.join(', ')}`);
    }
  } catch (err) {
    console.log('[KOOP Bot] [LD_FIX] libglib targeted search skipped:', err.message);
  }

  console.log(`[KOOP Bot] [LD_FIX] Library path fix completed in ${Date.now() - startTime}ms`);
}

// Execute library path fix immediately
fixLibraryPath();

// ═══════════════════════════════════════════════════════════════════════════════
// CHROMIUM BINARY DISCOVERY — Extremely aggressive, infallible search.
// Uses multiple strategies to guarantee finding the Chromium binary.
// ═══════════════════════════════════════════════════════════════════════════════
function resolveChromiumPath() {
  console.log('[KOOP Bot] [CHROMIUM] Starting aggressive binary discovery...');
  const startTime = Date.now();

  // ─── Strategy 1: Environment variable override ───
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    console.log(`[KOOP Bot] [CHROMIUM] Strategy 1 — Env var PUPPETEER_EXECUTABLE_PATH: ${envPath}`);
    if (fs.existsSync(envPath)) {
      console.log('[KOOP Bot] [CHROMIUM] ✓ Env var path exists. Using it.');
      return envPath;
    }
    console.log('[KOOP Bot] [CHROMIUM] ✗ Env var path does NOT exist on disk.');
  } else {
    console.log('[KOOP Bot] [CHROMIUM] Strategy 1 — No PUPPETEER_EXECUTABLE_PATH set.');
  }

  // ─── Strategy 2: `which` lookup (fastest) ───
  const binaries = ['chromium', 'google-chrome', 'chromium-browser', 'google-chrome-stable'];
  console.log('[KOOP Bot] [CHROMIUM] Strategy 2 — Checking PATH with `which`...');

  for (const bin of binaries) {
    try {
      const foundPath = execSync(`which ${bin} 2>/dev/null`).toString().trim();
      if (foundPath && fs.existsSync(foundPath)) {
        // Resolve symlinks to get the real binary
        const realPath = fs.realpathSync(foundPath);
        console.log(`[KOOP Bot] [CHROMIUM] ✓ Found '${bin}' via which: ${foundPath}`);
        console.log(`[KOOP Bot] [CHROMIUM]   Real path (resolved symlinks): ${realPath}`);
        console.log(`[KOOP Bot] [CHROMIUM]   Discovery took ${Date.now() - startTime}ms`);
        return foundPath;
      }
    } catch (_) {
      // `which` returns exit code 1 if not found
    }
  }
  console.log('[KOOP Bot] [CHROMIUM] ✗ No binary found in PATH.');

  // ─── Strategy 3: Infallible /nix/store deep search ───
  // This is the nuclear option. It WILL find Chromium if it's installed anywhere in /nix/store.
  console.log('[KOOP Bot] [CHROMIUM] Strategy 3 — Deep scanning /nix/store (may take 10-15s)...');

  const searchPatterns = [
    // Look for chromium wrapper scripts first (these handle LD_LIBRARY_PATH internally)
    `find /nix/store -path "*/bin/chromium" -type f 2>/dev/null | head -n 1`,
    `find /nix/store -path "*/bin/google-chrome" -type f 2>/dev/null | head -n 1`,
    `find /nix/store -path "*/bin/chromium-browser" -type f 2>/dev/null | head -n 1`,
    // Look for any executable named chromium
    `find /nix/store -name "chromium" -type f -executable 2>/dev/null | head -n 1`,
    // Look for the .chromium-wrapped binary (Nix wrapper pattern)
    `find /nix/store -name ".chromium-wrapped" -type f -executable 2>/dev/null | head -n 1`,
    // Broader search for chrome binaries
    `find /nix/store -name "chrome" -type f -executable 2>/dev/null | head -n 1`,
  ];

  for (const cmd of searchPatterns) {
    try {
      const result = execSync(cmd, { timeout: 30000 }).toString().trim();
      if (result && fs.existsSync(result)) {
        console.log(`[KOOP Bot] [CHROMIUM] ✓ Deep search found: ${result}`);
        console.log(`[KOOP Bot] [CHROMIUM]   Command: ${cmd}`);
        console.log(`[KOOP Bot] [CHROMIUM]   Discovery took ${Date.now() - startTime}ms`);
        return result;
      }
    } catch (err) {
      console.log(`[KOOP Bot] [CHROMIUM]   Pattern timed out or failed: ${cmd.substring(0, 60)}...`);
    }
  }

  // ─── Strategy 4: Check known hardcoded paths ───
  console.log('[KOOP Bot] [CHROMIUM] Strategy 4 — Checking hardcoded fallback paths...');
  const fallbackPaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];

  for (const candidate of fallbackPaths) {
    if (fs.existsSync(candidate)) {
      console.log(`[KOOP Bot] [CHROMIUM] ✓ Fallback path exists: ${candidate}`);
      return candidate;
    }
  }

  // ─── Strategy 5: Let Puppeteer use its own bundled Chromium ───
  console.log('[KOOP Bot] [CHROMIUM] ✗ ALL STRATEGIES EXHAUSTED. No Chromium found.');
  console.log('[KOOP Bot] [CHROMIUM] Puppeteer will use its bundled Chromium (may fail without libs).');
  console.log(`[KOOP Bot] [CHROMIUM] Total search time: ${Date.now() - startTime}ms`);

  // Log system info for debugging
  try {
    const pathEnv = process.env.PATH || '';
    console.log(`[KOOP Bot] [DEBUG] PATH: ${pathEnv}`);
    const lsNix = execSync('ls /nix/store/ 2>/dev/null | head -n 20').toString();
    console.log(`[KOOP Bot] [DEBUG] /nix/store (first 20): ${lsNix}`);
  } catch (_) { /* ignore */ }

  return undefined;
}

const executablePath = resolveChromiumPath();
console.log('[KOOP Bot] Final Chromium executablePath: ' + (executablePath || 'NONE (using Puppeteer default)'));

// ═══════════════════════════════════════════════════════════════════════════════
// BOT CONTENT
// ═══════════════════════════════════════════════════════════════════════════════
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

// ——— Concluding / Politeness Keywords ————————————————————————————————————————
const CONCLUDING_KEYWORDS = [
  'merci', 'merci beaucoup', 'thanks', 'thank you', 'ok', 'okay',
  "d'accord", 'daccord', 'bien reçu', 'reçu', 'received', 'dkr'
];

const POLITE_EXIT_REPLY = 'Je vous en prie ! KOOP Market reste à votre disposition.';

function isConcludingMessage(text) {
  const normalized = text.trim().toLowerCase();
  return CONCLUDING_KEYWORDS.some(kw => normalized === kw);
}

// Track users who selected option 6 and are expected to send a free-form message
const awaitingMessage = new Set();

// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP CLIENT
// ═══════════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════════
// BOOT SEQUENCE — initialize the WhatsApp client (after the HTTP server)
// ═══════════════════════════════════════════════════════════════════════════════
console.log('[KOOP Bot] Initializing WhatsApp client...');
client.initialize().catch((err) => {
  console.error('[KOOP Bot] client.initialize() threw an error:', err);
  setTimeout(() => process.exit(1), 500);
});
