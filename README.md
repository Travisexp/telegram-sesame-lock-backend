# Telegram Sesame Lock Backend

Node.js + Express backend for controlling a CANDY HOUSE Sesame smart lock from Telegram.

Flow:

```text
Telegram message -> Telegram Bot -> Node.js backend -> CANDY HOUSE Sesame API -> Sesame lock -> Telegram reply
```

## Features

- `/start`
- `/status`
- `/battery`
- `/lock`
- `/unlock confirm`
- `/sync`
- `/order_preview`
- Telegram chat allowlist with `TELEGRAM_ALLOWED_CHAT_ID`
- Local long polling mode
- Production webhook mode
- Sesame command-result polling
- Safe command logs without API keys or bot tokens
- Deployable to Render, Railway, a VPS, or local Node.js

## Requirements

- Node.js 20+
- A Telegram bot token from BotFather
- Your Telegram chat ID
- CANDY HOUSE Sesame API key
- Sesame device UUID
- Sesame paired with a Wi-Fi Access Point
- Sesame API/cloud integration enabled in the Sesame app

CANDY HOUSE API v3 requires the Sesame owner account, a paired Wi-Fi Access Point, and API integration enabled for the device.

## Setup

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
TELEGRAM_BOT_TOKEN=123456789:your_bot_token
TELEGRAM_ALLOWED_CHAT_ID=your_telegram_chat_id
SESAME_API_KEY=your_sesame_api_key
SESAME_DEVICE_UUID=your_sesame_device_uuid
BOT_MODE=polling
```

Start locally:

```bash
npm start
```

Send `/start` to your Telegram bot.

## Getting Your Telegram Chat ID

Temporarily start the bot with your token, then send a message to the bot.

You can also call Telegram's `getUpdates` endpoint in a browser:

```text
https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

Look for:

```json
"chat": { "id": 123456789 }
```

Put that number in `TELEGRAM_ALLOWED_CHAT_ID`.

## Commands

### `/start`

Shows available commands.

### `/status`

Gets the current Sesame lock status:

- locked/unlocked
- battery percentage
- responsiveness

### `/battery`

Shows battery percentage and current lock status.

### `/lock`

Sends the Sesame `lock` command, waits for the command result, then replies with the updated lock status.

### `/unlock confirm`

Unlocking requires confirmation. `/unlock` by itself will be rejected with a safety reminder.

### `/sync`

Sends the Sesame `sync` command, waits for the command result, then replies with the updated status.

Frequent sync commands can reduce Sesame battery life.

### `/order_preview`

Sends an animated GIF preview of the order status flow:

```text
Item Pending -> Pending Approval -> Sent to Merchant -> Delivery
```

## Webhook Mode

For production, deploy the app at an HTTPS URL and set:

```env
BOT_MODE=webhook
WEBHOOK_URL=https://your-app.example.com/telegram/webhook
PUBLIC_BASE_URL=https://your-app.example.com
TELEGRAM_WEBHOOK_SECRET=use_a_long_random_string
```

Start the server:

```bash
npm start
```

The app registers the webhook automatically with Telegram.

Telegram sends the webhook secret in the `X-Telegram-Bot-Api-Secret-Token` header, and this backend rejects webhook calls that do not match.

## Local Polling Mode

For local testing:

```env
BOT_MODE=polling
TELEGRAM_CLEAR_WEBHOOK_ON_POLL=true
```

Telegram does not allow `getUpdates` polling while a webhook is active. With `TELEGRAM_CLEAR_WEBHOOK_ON_POLL=true`, this app clears the webhook when polling starts.

## Deploying

### Render or Railway

1. Create a new Node.js service.
2. Set build command:

```bash
npm install
```

3. Set start command:

```bash
npm start
```

4. Add the environment variables from `.env.example`.
5. Set `BOT_MODE=webhook`.
6. Set `WEBHOOK_URL` to your deployed HTTPS endpoint:

```text
https://your-service.example.com/telegram/webhook
```

This repository includes `render.yaml` for Render Blueprint deploys and `railway.json` for Railway deploy settings.

For Render, the app uses:

- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

For Railway, the app uses:

- Start command: `npm start`
- Health check path: `/health`

Add production secrets in the host dashboard, not in `.env`.

### VPS

1. Install Node.js 20+.
2. Clone or upload this project.
3. Run `npm install`.
4. Create `.env`.
5. Put the app behind HTTPS with Caddy, Nginx, or a platform proxy.
6. Run `npm start` with systemd, pm2, or your preferred process manager.

## Security Notes

- Keep `.env` private.
- Never commit `TELEGRAM_BOT_TOKEN`, `SESAME_API_KEY`, or `SESAME_SECRET_KEY`.
- Only one Telegram chat ID is allowed.
- Unknown chat IDs receive `Unauthorized.`
- The app logs command names and chat IDs, but never logs bot tokens, Sesame API keys, or secret keys.
- `/unlock` requires `/unlock confirm`.

## Sesame API Notes

This project uses the official CANDY HOUSE Sesame API v3 endpoints:

- `GET /public/sesame/{device_id}` for lock status, battery, and responsiveness
- `POST /public/sesame/{device_id}` with `{"command":"lock"}`
- `POST /public/sesame/{device_id}` with `{"command":"unlock"}`
- `POST /public/sesame/{device_id}` with `{"command":"sync"}`
- `GET /public/action-result?task_id={task_id}` for command results

`SESAME_SECRET_KEY` is included in `.env.example` for compatibility with older API examples, but the v3 REST API path used here does not require it.

## Telegram API Notes

This project uses:

- `sendMessage` for replies
- `getUpdates` for local long polling
- `setWebhook` for production webhooks
- `deleteWebhook` when switching back to polling

Telegram will not deliver updates through `getUpdates` while a webhook is configured.
