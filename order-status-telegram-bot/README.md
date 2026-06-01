# Stock Status Telegram Bot

Telegram bot that sends an animated GIF based on an item or stock request status.

Flow:

```text
Item status -> Node.js backend -> Telegram bot -> animated status GIF
```

Statuses:

- `pending_approval` - Pending Approval
- `approved` - Approved
- `merchant_received` - Merchant Received
- `delivery` - Delivery

## Commands

```text
/start
/help
/preview pending_approval
/preview approved
/preview merchant_received
/preview delivery
/setstatus ITEM_ID pending_approval
/setstatus ITEM_ID approved
/setstatus ITEM_ID merchant_received
/setstatus ITEM_ID delivery
/item ITEM_ID
```

Examples:

```text
/preview merchant_received
/setstatus CHICKEN-10KG pending_approval
/item CHICKEN-10KG
```

## External Order Webhook

Your stock/order system can update an item by calling:

```http
POST /orders/:itemId/status
X-API-Key: your_ORDER_WEBHOOK_API_KEY
Content-Type: application/json

{
  "status": "merchant_received",
  "chatId": "123456789"
}
```

If `chatId` is omitted, the bot sends to `TELEGRAM_ALLOWED_CHAT_ID`.

## Local Setup

```bash
npm install
cp .env.example .env
npm start
```

For local testing:

```env
BOT_MODE=polling
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_ALLOWED_CHAT_ID=your_chat_id
PUBLIC_BASE_URL=http://localhost:3000
```

For production on Render/Railway:

```env
BOT_MODE=webhook
WEBHOOK_URL=https://your-app.example.com/telegram/webhook
PUBLIC_BASE_URL=https://your-app.example.com
TELEGRAM_WEBHOOK_SECRET=use_a_long_random_string
ORDER_WEBHOOK_API_KEY=use_another_long_random_string
```

## Generate GIF Assets

The generated GIFs are already included in `public/animations`.

To regenerate them:

```bash
python scripts/generate_order_status_gifs.py
```
