'use strict';

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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
  '6': `Votre message sera transmis à un conseiller KOOP Market. Veuillez décrire votre demande ci-dessous ou écrivez directement à : coop@amino.com`,
};

// Track users who selected option 6 and are expected to send a free-form message
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
    // After delivering option-6 prompt, flag this sender as awaiting their detailed message
    if (body === '6') {
      awaitingMessage.add(sender);
    }
    return;
  }

  // Any unrecognised input → show main menu
  await message.reply(MAIN_MENU);
});

client.initialize();
