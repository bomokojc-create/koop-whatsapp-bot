'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const MAIN_MENU = `Bonjour ! Bienvenue chez KOOP Market. Comment puis-je vous aider aujourd'hui ?

Veuillez choisir une option en tapant le chiffre correspondant :
1. Rejoindre la chaîne WhatsApp (Ya Biso Moko)
2. C'est quoi Koop Market ?
3. Contacter un agent`;

const MENU_RESPONSES = {
  '1': 'Cliquez sur ce lien pour rejoindre notre communauté : https://whatsapp.com/channel/0029Vb7vn4J8fewxV924lW1p',
  '2': 'KOOP Market est votre plateforme d\'emploi, de formation et de commerce en RDC. Visitez notre site pour en savoir plus : https://koop-market.com',
  '3': 'Un agent vous contactera dès que possible. Merci de votre patience.',
};

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'koop-market-bot' }),
  puppeteer: {
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
  },
});

client.on('qr', (qr) => {
  console.log('\n[KOOP Bot] Scan the QR code below with WhatsApp to authenticate:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('[KOOP Bot] Client is ready and listening for messages.');
});

client.on('auth_failure', (msg) => {
  console.error('[KOOP Bot] Authentication failure:', msg);
  process.exit(1);
});

client.on('disconnected', (reason) => {
  console.warn('[KOOP Bot] Client was disconnected:', reason);
  process.exit(1);
});

client.on('message', async (message) => {
  if (message.fromMe) return;
  if (message.isGroupMsg) return;

  const body = (message.body || '').trim();

  if (MENU_RESPONSES[body]) {
    await message.reply(MENU_RESPONSES[body]);
    return;
  }

  if (/^[0-9]+$/.test(body)) {
    await message.reply(MAIN_MENU);
    return;
  }

  await message.reply(MAIN_MENU);
});

client.initialize();
