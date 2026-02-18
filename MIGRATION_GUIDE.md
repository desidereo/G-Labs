# WordPress to G-Labs Migration Guide

## 0. Accessing Your WordPress Admin
Before you can export, you need to log in. If you have forgotten your password, use **Method B**.

**Method A: Direct Link (Easiest)**
1.  Go to `www.g-labs.software/wp-admin` (or `www.g-labs.software/wp-login.php`).
2.  Enter your username and password.

**Method B: Via Hosting (Namecheap/cPanel)**
1.  Log in to your Namecheap Dashboard.
2.  Go to **Hosting List** -> **Go to cPanel**.
3.  Scroll down to the bottom to **WordPress Manager by Softaculous** (or just "Softaculous Apps Installer").
4.  Click the **WordPress** icon.
5.  Scroll down to "Current Installations".
6.  Click the **"Login"** (Person Icon) next to your website. **This logs you in automatically as Admin without needing a password.**

---

This guide will help you safely extract all your critical data (Products, Customers, Orders) from your existing WordPress/WooCommerce site before you replace it with the new G-Labs platform.

## 1. Export Your Data (Do this immediately)

Since you plan to delete the old site, you must secure your data first.

### A. Export Products (WooCommerce)
1. Log in to your WordPress Dashboard.
2. Go to **Products > All Products**.
3. Click the **Export** button at the top.
4. Select **"Export all columns"** and **"Export all products"**.
5. Click **Generate CSV**.
6. **Save this file** to `Websites/G_Labs/Legacy_Backup/products.csv`.

### B. Export Orders & Subscriptions (CRITICAL)
Data is often split between **Orders** (one-time) and **Subscriptions** (recurring). You need to export **BOTH** to ensure you don't miss any active users.

1. **Install Plugin:** Go to Plugins > Add New > Search for **"Advanced Order Export For WooCommerce"** (free version). Install & Activate.

3. **Export 1: Standard Orders**
   - **Step 3a: Find your Field Name**
     - Open a new tab and go to **WooCommerce > Checkout Form** (or wherever you manage your checkout fields).
     - Find your "TradingView ID" field.
     - Look for the **"Name"** column (e.g., `billing_tradingview_id` or `tradingview_id`). **Copy this name.**
   
   - **Step 3b: TROUBLESHOOTING (If it's missing from the CSV)**
      - The field name might be hidden or slightly different (e.g., starting with an underscore `_`).
      - **Find the REAL Database Name:**
        1. Go to **WooCommerce > Orders** and open an order that *definitely* has a TradingView ID.
        2. Click **Screen Options** (top right corner) -> Check the box for **"Custom Fields"**.
        3. Scroll to the very bottom of the order page.
        4. Look for the TradingView ID in the "Value" column.
        5. The text in the **"Name"** column next to it is the *Key* you need (e.g., `_billing_tradingview_id`).
      - **Check "Order Item" Data:**
        - Sometimes the ID is attached to the *product*, not the order.
        - In the Export plugin, look for the **"Order Items"** section (instead of "Billing").
        - Drag **"Item Metadata"** or **"Item Custom Fields"** into your export list.

    - **Step 3c: Export**
      - Go back to **WooCommerce > Export Orders**.
      - Drag the field with the *exact name* you found in the Troubleshooting step.
      - Click **Export**.

3. **Export 2: Subscriptions (Recurring Payments)**
   - **Check the "Post Type" Dropdown:** At the very top of the "Export Now" tab, look for a dropdown labeled "Post Type" (it usually says "Orders" by default).
   - Click it and look for **"Subscriptions"**.
   - **If you select "Subscriptions":**
     - Ensure you still drag your **TradingView ID** custom field into the export list (it resets when you change post types!).
     - Click **Export** and save as `subscriptions.csv`.
   - **If you DO NOT see "Subscriptions":**
     - You might be using a different plugin or just have them mixed in with Orders.
     - In this case, your `orders.csv` from Step 3 likely contains everything. Just double-check that file!

4. **Move Files:** Place both `orders.csv` and `subscriptions.csv` into `Websites/G_Labs/Legacy_Backup/`.

### C. Export Customers (WooCommerce)
1. Go to **Users > All Users** (or use the Order Export plugin above).
2. Export your customer list (Name, Email, Billing Address).
3. **Save this file** to `Websites/G_Labs/Legacy_Backup/customers.csv`.
   * *You will need this list to import into Mailchimp/ConvertKit for future marketing.*

### D. Download Media Library (Optional but Recommended)
1. Use an FTP client (like FileZilla) or a file manager plugin.
2. Download the folder `/wp-content/uploads/`.
3. Save it locally. This ensures you keep all your original product images and banners.

---

## 2. Extracting TradingView Usernames (New Script)

I have created a special script called `extract_usernames.py` to help you find your users.

**How to use it:**
1. Ensure your detailed `orders.csv` (from Step 1B) is in the `Legacy_Backup` folder.
2. Run the script: `python extract_usernames.py`
3. The script will show you the column names it found.
4. **Type the number** of the column that contains the TradingView ID.
5. It will generate a clean list called `customer_access_list.csv` containing just: **Email, Name, TradingView ID, Products**.

This list is exactly what you need to manually grant access or move them to a new system.

---

## 3. The "Nuclear" Option: XML Export (Best for missing data)

If the CSV export is confusing or missing fields, use this method. It dumps **everything** from your database, and I can extract the hidden ID for you.

1.  **Go to Tools > Export.**
2.  Select **"All content"**.
3.  Click **Download Export File**.
4.  It will save as an `.xml` file (e.g., `g-labs-software.wordpress.2023-10-27.xml`).
5.  **Move this file** to `Websites/G_Labs/Legacy_Backup/`.

### Running the Extractor:
I have created a script called `extract_from_xml.py` that reads this backup file.

1.  Open your terminal in `Websites/G_Labs/`.
2.  Run: `python extract_from_xml.py`
3.  It will scan your backup and list all possible field names (like `_billing_tradingview_id` or `custom_checkout_field`).
4.  **Type the number** of the correct field.
5.  It will save a clean list to `customer_access_list_from_xml.csv`.

---

## 5. The Point of No Return: Deleting & Switching

**STOP!** Before you delete anything:
1.  **Move your XML file** into the `Legacy_Backup` folder.
2.  **Run** `python extract_from_xml.py`.
3.  **Open** the generated CSV and check if the "TradingView ID" column has data.
4.  **If yes:** You are safe. Proceed below.

### A. Uninstall WordPress (The Clean Sweep)
1.  Log in to **cPanel** (via Namecheap).
2.  Go to **WordPress Manager by Softaculous**.
3.  Find your `g-labs.software` installation.
4.  Click the **Down Arrow** (or "Uninstall" trash can icon).
5.  **Check the box** to "Remove Directory", "Remove Database", "Remove Database User".
6.  Click **Remove Installation**.
7.  *Your site is now gone.*

### B. Upload the New Site
1.  **Prepare your files:**
    - On your computer, go to `Websites/G_Labs/`.
    - Select: `index.html`, `mql5.html`, `tradingview.html`, `privacy.html`, `assets`, and `css`.
    - **Right-click > Send to > Compressed (zipped) folder**. Name it `upload.zip`.

2.  **Upload to Server:**
    - In cPanel, go to **File Manager**.
    - Open the `public_html` folder (or the specific folder for `g-labs.software`).
    - Click **Upload** (top bar).
    - Drag your `upload.zip` in.
    - Go back to File Manager.
    - **Right-click `upload.zip` > Extract**.
    - (Optional) Delete the zip file.

3.  **Go Live:**
    - Visit `www.g-labs.software`.
    - You should see your new site immediately!

## 4. Switching the Domain (Go Live)

Once you have your data backed up and the new site is ready:

1. **Upload the New Site:**
   - Upload the contents of `Websites/G_Labs/` to your hosting server (public_html).
   - *Ensure you delete or rename the old `wp-config.php` and `index.php` first.*

2. **Test:**
   - Visit `www.g-labs.software`.
   - Verify all links and images work.
   - Verify the Stripe payment links (once added).

3. **Cancel Old Hosting (Optional):**
   - Only cancel the WordPress hosting plan *after* you have confirmed the new site is working and you have all your backups secure.
