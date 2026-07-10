'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const MAIN_MENU = `Bonjour ! Bienvenue chez KOOP Market. Nous sommes ravis de vous accompagner dans votre réussite. Comment pouvons-nous vous aider aujourd'hui ?

Veuillez choisir une option en tapant le chiffre correspondant :
1. Rejoindre la chaîne
2. Infos Koop Market
3. Je cherche un travail
4. Je cherche une formation
5. Message particulier`;

const MENU_RESPONSES = {
  '1': `Cliquez ici pour rejoindre la communauté et ne rien rater : https://whatsapp.com/channel/0029Vb7vn4J8fewxV924lW1p`,
  '2': `KOOP Market est votre portail vers l'emploi et la formation en RDC. Visitez notre site officiel : https://koop-market.com`,
  '3': `KOOP Market est une plateforme qui centralise les opportunités pour vous aider. Nous n'engageons pas directement, mais nous dénichons les meilleures offres du marché. Pour voir les offres d'emploi, rejoignez la chaîne WhatsApp (Option 1) ou visitez notre page : https://koop-market.com/#/jobs`,
  '4': `Améliorez vos compétences avec nos formations : https://koop-market.com/#/training`,
  '5': `Veuillez laisser votre message détaillé ci-dessous. Un membre de notre équipe reviendra vers vous dès que possible.`,
};

// Track users who selected option 5 and are expected to send a free-form message
const awaitingMessage = new Set();

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

  const sender = message.from;
  const body = (message.body || '').trim();

  // Option 5 flow: user previously selected "Message particulier" — capture their free-form message
  if (awaitingMessage.has(sender)) {
    awaitingMessage.delete(sender);
    await message.reply(
      'Merci pour votre message ! Un membre de notre équipe vous contactera très bientôt. 🙏\n\n' + MAIN_MENU
    );
    return;
  }

  // Known menu option selected
  if (MENU_RESPONSES[body]) {
    await message.reply(MENU_RESPONSES[body]);
    // After delivering option-5 prompt, flag this sender as awaiting their detailed message
    if (body === '5') {
      awaitingMessage.add(sender);
    }
    return;
  }

  // Any unrecognised input → show main menu
  await message.reply(MAIN_MENU);
});

client.initialize();
