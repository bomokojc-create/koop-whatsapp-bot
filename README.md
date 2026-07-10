# KOOP Market WhatsApp Bot

An automated WhatsApp chatbot for **KOOP Market** — your employment, training, and commerce platform in the DRC. Built with [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js).

---

## Features

- Sends an interactive welcome menu to every new incoming message
- Routes users to the WhatsApp Channel, the KOOP Market website, or a human agent
- Session persistence via `LocalAuth` (no QR scan on every restart)

---

## Prerequisites

| Requirement | Version |
|-------------|----------|
| Node.js     | ≥ 18    |
| npm         | ≥ 9     |
| Google Chrome / Chromium | Auto-managed by Puppeteer |

> **Note:** On headless Linux servers (e.g. VPS / EC2) make sure the following packages are installed:
> ```
> sudo apt-get install -y ca-certificates fonts-liberation libasound2 \
>   libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
>   libexpat1 libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 \
>   libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
>   libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
>   libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
>   lsb-release wget xdg-utils
> ```

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/bomokojc-create/koop-whatsapp-bot.git
cd koop-whatsapp-bot

# 2. Install dependencies
npm install
```

---

## Running the Bot

```bash
node index.js
```

On **first run**, a QR code will appear in the terminal:

```
[KOOP Bot] Scan the QR code below with WhatsApp to authenticate:

▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█ ▄▄▄▄▄ █ ▀▄█▀▄▄▄▄▄ █
...
```

1. Open **WhatsApp** on your phone.
2. Go to **Settings → Linked Devices → Link a Device**.
3. Scan the QR code.

The bot will then show:
```
[KOOP Bot] Client is ready and listening for messages.
```

On **subsequent runs**, the saved session (`.wwebjs_auth/`) is reused automatically — no QR scan needed.

---

## Bot Menu Flow

```
User sends any message
        │
        ▼
  ┌─────────────┐
  │  Main Menu  │  ← "Bonjour ! Bienvenue chez KOOP Market..."
  └─────────────┘
        │
   User replies
        │
   ┌────┴──────────────────────────────────────┐
   │  1  │  WhatsApp Channel link              │
   │  2  │  About KOOP Market + website link   │
   │  3  │  Agent contact confirmation         │
   │ any │  Repeat main menu                   │
   └───────────────────────────────────────────┘
```

---

## Production / Keep-Alive

Use **PM2** to keep the bot running in the background:

```bash
npm install -g pm2
pm2 start index.js --name koop-whatsapp-bot
pm2 save
pm2 startup
```

---

## Project Structure

```
koop-whatsapp-bot/
├── index.js        # Core bot logic
├── package.json    # Dependencies & scripts
├── .gitignore      # Ignored files (node_modules, session data)
└── README.md       # This file
```

---

## License

MIT — © KOOP Market
