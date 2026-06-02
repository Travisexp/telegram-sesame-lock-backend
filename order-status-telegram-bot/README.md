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
/myid
/items
/cart
/submit
/request ITEM_NAME
/addstaff CHAT_ID
/approve INVOICE_ID
/reject INVOICE_ID
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
/items
/cart
/submit
/request Chicken Breast 10kg
/approve 1001
/setstatus CHICKEN-10KG pending_approval
/item CHICKEN-10KG
```

## Staff Access

Set the owner and staff Telegram IDs:

```env
TELEGRAM_OWNER_CHAT_ID=your_chat_id
TELEGRAM_STAFF_CHAT_IDS=staff_chat_id_1,staff_chat_id_2
```

Staff can use `/items` to choose stock, pick a quantity, review `/cart`, and send `/submit`. The owner receives the pending approval animation and can reply with `/approve INVOICE_ID` or `/reject INVOICE_ID`.

The cart and approval request include every invoice line as `quantity x item name`.

If a staff member does not know their chat ID, they can send `/myid` to the bot and give that number to the owner.

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
