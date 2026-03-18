# Create a test product in Stripe (step by step)

Do this in **Test mode** so your live products are not affected.

---

## Step 1: Switch to Test mode

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and log in.
2. In the **left sidebar** (or top of the page), find the **Test mode** toggle.
3. Turn it **ON**. The UI usually shows “Test mode” or a test icon when it’s on.  
   Your live products and payments are in Live mode and stay unchanged.

---

## Step 2: Create the product

1. In the left sidebar, click **Product catalog** (or **Products**).
2. Click **+ Add product**.
3. **Name**: e.g. `Test TV Webhook`.
4. **Description**: optional (e.g. `Test product for Stripe → TradingView webhook`).
5. **Image**: optional.
6. Under **Pricing**:
   - **Standard pricing**.
   - **One time** (not recurring).
   - **Price**: e.g. `1` and currency **GBP** (or your currency).
7. Click **Save product**.

---

## Step 3: Create a Payment Link with TradingView Username

1. On the product page you just created, find **Payment links** (or go to **Payment links** in the sidebar and click **+ New**).
2. If you’re on the product page, click **Create payment link** for this product.
3. In the payment link setup:
   - **Product**: your test product (usually pre-selected).
   - **Price**: the one-time price you set (e.g. £1).
4. Open **Additional options** or **Advanced options** (often at the bottom).
5. Find **Custom fields** → **Add custom field**.
   - **Type**: **Text**.
   - **Label**: `TradingView Username` (exactly this so the webhook can find it).
   - **Required**: turn **ON**.
6. Click **Create link**.
7. Copy the link URL (starts with `https://buy.stripe.com/...`). You’ll use this to do a test payment later.

---

## Step 4: Get the Price ID (for your CSV)

1. Go back to **Product catalog** (left sidebar).
2. Click your **test product** (e.g. “Test TV Webhook”).
3. Under **Pricing**, you’ll see the price (e.g. £1.00 one time).
4. Click that price (or the three dots next to it) so the price details open.
5. Copy the **Price ID**. It looks like `price_1ABC2def3GHI4jkl...` (starts with `price_`).  
   You need this for **stripe_tv_products.csv**.

---

## Step 5: Put the Price ID in your CSV

1. Open **stripe_tv_products.csv** in the G_Labs folder (Excel or a text editor).
2. Find the first data row (the one that already has the test pine_id: `PUB;3077300b684b4479817e6b7d8bb459bb`).
3. In the **stripe_price_id** column for that row, paste the Price ID you copied (e.g. `price_1ABC2def3GHI4jkl...`).
4. Save the file.

---

## Step 6: What’s next (webhook + test payment)

After the CSV is saved:

1. **Run the webhook** on your PC:  
   `pip install -r requirements_webhook.txt` then `python stripe_webhook.py`
2. **Expose it** with ngrok: `ngrok http 5000` → copy the HTTPS URL.
3. **Add the webhook in Stripe**: Developers → Webhooks → Add endpoint → URL = `https://YOUR_NGROK_URL/webhook`, events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted` → copy the **Signing secret**.
4. **Set env vars**: `STRIPE_SECRET_KEY` (test key) and `STRIPE_WEBHOOK_SECRET` (the signing secret).
5. **Test payment**: open the Payment Link from Step 3, enter a TradingView username, pay with test card `4242 4242 4242 4242` → then check that the user appears in TradingView under Manage access for your test script.

Full details are in **STRIPE_WEBHOOK_SETUP.md**.
