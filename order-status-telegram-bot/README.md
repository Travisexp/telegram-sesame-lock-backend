# Order Status Telegram Bot

Telegram bot that sends an animated GIF based on an order status.

Flow:

```text
Order status -> Node.js backend -> Telegram bot -> animated status GIF
```

Statuses:

- `pending` - Item Pending
- `approval` - Pending Approval
- `merchant` - Order Sent to Merchant
- `delivery` - Delivery

## Commands

```text
/start
/help
/preview pending
/preview approval
/preview merchant
/preview delivery
/setstatus ORDER_ID pending
/setstatus ORDER_ID approval
/setstatus ORDER_ID merchant
/setstatus ORDER_ID delivery
/order ORDER_ID
```

Examples:

```text
/preview merchant
/setstatus 1001 approval
/order 1001
```

## External Order Webhook

Your ordering system can update an order by calling:

```http
POST /orders/:orderId/status
X-API-Key: your_ORDER_WEBHOOK_API_KEY
Content-Type: application/json

{
  "status": "merchant",
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
