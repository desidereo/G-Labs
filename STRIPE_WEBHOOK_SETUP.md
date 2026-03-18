# Stripe → TradingView auto-access: what you need to do

This guide tells you what to set up so that when a customer pays on Stripe, they are automatically added to your TradingView script(s).

---

## 1. Create a test product in Stripe (test mode)

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com) and **switch to Test mode** (toggle in the sidebar).
2. Go to **Product catalog** → **Add product**.
3. Name it e.g. "Test TV access", add a price (e.g. £1 one-time for testing).
4. Click **Save**, then create a **Payment Link** for this product.
5. In the Payment Link settings, open **Advanced options** → **Custom fields** → **Add custom field**:
   - Type: **Text**
   - Label: **TradingView Username**
   - Check **Required**
6. Create the link and copy the Payment Link URL (you can use this to test checkout; the webhook does not use the URL directly).

---

## 2. Get your Stripe Price ID and Webhook Secret

- **Price ID**: In Stripe Dashboard, open the test product you created. Under **Pricing**, you’ll see the price with an ID like `price_1ABC123...`. Copy that **Price ID**.
- **Webhook secret**: In Stripe Dashboard go to **Developers** → **Webhooks** → **Add endpoint** (you’ll do this in step 4). After you add the endpoint, Stripe shows a **Signing secret** (`whsec_...`). Copy that and keep it safe.

---

## 3. Get your TradingView script pine_id (test script)

1. Open the **invite-only script** you want to use for testing (or create a test one).
2. Click **Manage access** (or open the script page).
3. Open browser **Developer Tools** (F12) → **Network** tab.
4. Clear the list, then click **Manage access** (or add a user) so a request is sent.
5. Find a request to `list_users` or `add` or `remove`; open it and look at the **Payload** (or **Request** tab). Find the parameter **pine_id** — it looks like `PUB;xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Copy that value.

---

## 4. Expose the webhook and get your endpoint URL

The webhook must be reachable by Stripe over **HTTPS**. Two options:

**Option A – Run the webhook on your PC and use a tunnel (easiest for testing)**  
1. Install dependencies and run the webhook:
   ```bash
   cd C:\Users\Windows10\Desktop\TechLocal_Grant_Application\Websites\G_Labs
   pip install -r requirements_webhook.txt
   python stripe_webhook.py
   ```
   The server runs at `http://127.0.0.1:5000`.  
2. Use a tunnel so Stripe can reach it, e.g. [ngrok](https://ngrok.com): run `ngrok http 5000` and copy the **HTTPS** URL (e.g. `https://abc123.ngrok.io`).  
3. Your **webhook URL** is: `https://YOUR_TUNNEL_URL/webhook` (e.g. `https://abc123.ngrok.io/webhook`).

**Option B – Run the webhook on your website server**  
If your G_Labs site is on a host that can run Python (e.g. a VPS or a host that allows long-running processes), run `stripe_webhook.py` there and use your domain, e.g. `https://yourdomain.com/webhook` (you’ll need to configure your server so that path is handled by this app).

---

## 5. Add the webhook in Stripe and set environment variables

1. In Stripe Dashboard: **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: use the URL from step 4 (e.g. `https://abc123.ngrok.io/webhook`).
3. **Events to send**: select at least:
   - `checkout.session.completed`
   - `invoice.paid` (for subscriptions)
   - `customer.subscription.deleted` (for subscriptions)
4. Click **Add endpoint**. Open the new endpoint and copy the **Signing secret** (`whsec_...`).

Set these environment variables where you run `stripe_webhook.py` (or in a `.env` file if you use one):

- **STRIPE_SECRET_KEY** – In Stripe Dashboard: **Developers** → **API keys** → **Secret key** (use the **Test** key for testing).
- **STRIPE_WEBHOOK_SECRET** – The **Signing secret** from the webhook you just created (`whsec_...`).

On Windows (PowerShell), before running the script you can do:

```powershell
$env:STRIPE_SECRET_KEY = "sk_test_..."
$env:STRIPE_WEBHOOK_SECRET = "whsec_..."
python stripe_webhook.py
```

---

## 6. Configure products (use the CSV template)

**Easiest:** open **stripe_tv_products.csv** in Excel or a text editor. Each row = one product.

| Column | What to put |
|--------|-------------|
| product_name | Any name for you (e.g. Test TV access) |
| stripe_price_id | From Stripe: the Price ID (e.g. price_1ABC123...) |
| pine_ids | From TradingView: one `PUB;xxx` or several comma-separated `PUB;a,PUB;b` |
| duration | `1L` = lifetime, `1M` = 1 month |
| type | `one_time` or `subscription` |

- Fill **stripe_price_id** and **pine_ids** for your test row (and leave others blank until you’re ready).
- Save as CSV (Excel: “Save as” → CSV UTF-8). See **STRIPE_TV_PRODUCTS_README.txt** for more detail.

The webhook reads this CSV first. If you prefer JSON, you can still use **stripe_tv_config.json** (same format as before); the webhook uses the CSV when it exists.

---

## 7. TradingView session_id in config.json

Your `config.json` already has a `session_id` for TradingView. The webhook uses it to call TradingView. If the session has expired, run `tv_manager.py` once, choose **Update Session ID**, and paste a fresh session ID (from your browser cookies on tradingview.com after logging in).

---

## 8. Test the flow

1. Start the webhook (and ngrok if you’re using it), with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set.
2. Use the **test** Payment Link for your test product. At checkout, enter a **TradingView username** (yours or a test account) and pay with card `4242 4242 4242 4242`.
3. In Stripe Dashboard → **Developers** → **Webhooks** → your endpoint → **Recent events**, you should see `checkout.session.completed` with a green tick.
4. Check your TradingView script: **Manage access** — the username you entered should appear with access.

If the webhook returns an error, check the terminal where `stripe_webhook.py` is running for the error message. Common issues:

- **No TradingView username**: the custom field in the Payment Link must be exactly "TradingView Username" (or match what Stripe sends in `custom_fields`).
- **unknown price_id**: the key in `stripe_tv_config.json` must match the Price ID of the product that was purchased (from the first line item).
- **No TradingView session_id** or **Session expired**: update `session_id` in `config.json` as in step 7.

---

## 9. Add your real products

When the test works, add a **new row** in **stripe_tv_products.csv** for each product:

- **One script**: put one pine_id in the pine_ids column (e.g. `PUB;xxx`).
- **All scripts (e.g. BTMM lifetime)**: put multiple comma-separated (e.g. `PUB;a,PUB;b,PUB;c`).
- **Lifetime**: duration `1L`, type `one_time`.
- **Monthly subscription**: duration `1M`, type `subscription`.

Get each product’s **Price ID** from Stripe (Dashboard → Product → copy the Price ID). Save the CSV. For **live** mode, add a live webhook in Stripe and use your live secret key and signing secret when running the webhook.

---

## Files created/used

| File | Purpose |
|------|--------|
| **stripe_tv_products.csv** | **Template: one row per product.** Fill stripe_price_id, pine_ids, duration, type. The webhook reads this first. |
| STRIPE_TV_PRODUCTS_README.txt | Short guide for filling the CSV. |
| `tv_manager.py` | Has `add_access()` so the webhook can add users. |
| `stripe_webhook.py` | Webhook server: receives Stripe events, calls TradingView add/remove. |
| `stripe_tv_config.json` | Optional; same mapping as CSV if you prefer JSON. |
| `stripe_grants.json` | Created automatically for subscription cancellations. |
| `config.json` | Your TradingView `session_id`. |
| `requirements_webhook.txt` | Python deps: `pip install -r requirements_webhook.txt` |
