# Stripe Payment System Setup Guide for G-Labs

This guide explains how to configure your Stripe Payment Links to collect the required customer data (TradingView Username) and ensure you receive email notifications for every sale.

## 1. Create Payment Links with Custom Fields

To collect the **TradingView Username** from customers during checkout, you must add a "Custom Field" to each Payment Link you create in Stripe.

### Steps:
1.  Log in to your **Stripe Dashboard**.
2.  Go to your **Product Catalog** and click on the product you just added.
3.  Look for the **"Create payment link"** button (often near the Pricing section).
    *   *Alternative:* Click **Payment Links** in the left sidebar, then click **+ New** and select your product.
4.  **CRITICAL STEP:** In the link editor, look at the options on the left side.
5.  Click **"Advanced options"** (you may need to scroll down).
6.  Find **"Custom fields"** and click **"Add custom field"**.
7.  Select **"Text"**.
8.  In the Label field, type: `TradingView Username`.
9.  Check the box **"Required"** (this is vital for your database).
10. Click **Create link**.
11. **Copy the URL** (starts with `https://buy.stripe.com/...`).

### Update the Website Configuration:
1.  Open the file `payment_config.js` in your website folder.
2.  Find the corresponding product key (e.g., `"magic_lines_single"`).
3.  Paste the new Stripe URL inside the quotes, replacing the placeholder.
    *   *Example:* `"magic_lines_single": "https://buy.stripe.com/test_12345...",`
4.  Save the file.

## 2. Enable Email Notifications for New Sales

To receive an email immediately when someone purchases, you must enable it in your personal notification settings.

**Important:** Stripe sends these emails to the **email address you use to log in**. You cannot simply "type in" a different alert email.

### Option A: Use Your Current Login Email
1.  Click the **Profile icon** (top right corner).
2.  Select **Profile**.
3.  Scroll down to **"Communication preferences"** (or "Email preferences").
4.  Check the box for **"Successful payments"**.
5.  Click **Save**.

### Option B: Send to a Different Email (e.g., info@g-labs.software)
If you want alerts to go to a different address than your login:
1.  Go to **Settings** > **Team**.
2.  Click **+ New Member**.
3.  Enter the email address (e.g., `info@g-labs.software`).
4.  Assign a role (e.g., "Viewer" or "Support Specialist").
5.  **Log out** and log back in as that new user (or open the invite link sent to that email).
6.  Repeat the steps in **Option A** for that new user account.

Now, every time a sale occurs, Stripe will email the users who have this setting enabled.

## 3. Custom Orders Configuration

For the "Custom Order" page:
1.  Create a **"Pay what you want"** link in Stripe (Product price set to "Customer chooses price") OR create specific links for fixed invoice amounts.
2.  Paste that link into `payment_config.js` under `"custom_order_pay"`.

## 4. Accessing Your Payer Database

Stripe automatically builds your database. To view it:
1.  Go to **Payments** in the Stripe Dashboard.
2.  Click **Export** to download a CSV file of all transactions.
3.  The CSV will contain columns for:
    *   Customer Email
    *   Amount
    *   Date
    *   **Custom Fields (TradingView Username)**

This serves as your master database of payers.
