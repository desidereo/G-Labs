import csv
import os

ORDERS_FILE = 'Legacy_Backup/orders.csv'
SUBS_FILE = 'Legacy_Backup/subscriptions.csv'
OUTPUT_FILE = 'Legacy_Backup/customer_access_list.csv'

def get_input_file():
    files = []
    if os.path.exists(ORDERS_FILE): files.append(ORDERS_FILE)
    if os.path.exists(SUBS_FILE): files.append(SUBS_FILE)
    
    if not files:
        print(f"Error: Neither {ORDERS_FILE} nor {SUBS_FILE} found.")
        print("Please export your orders/subscriptions to these locations.")
        print("Refer to MIGRATION_GUIDE.md Step 1B.")
        return None
        
    print("Found files:")
    for i, f in enumerate(files):
        print(f"{i+1}: {f}")
        
    sel = input("Which file do you want to extract from? (Enter number): ")
    try:
        idx = int(sel) - 1
        if 0 <= idx < len(files):
            return files[idx]
    except:
        pass
    print("Invalid selection.")
    return None

def main():
    INPUT_FILE = get_input_file()
    if not INPUT_FILE: return

    print(f"Reading {INPUT_FILE}...")
    
    # Using utf-8-sig to handle Excel BOM if present
    try:
        f = open(INPUT_FILE, 'r', encoding='utf-8-sig')
        reader = csv.DictReader(f)
        headers = reader.fieldnames
    except UnicodeDecodeError:
        # Fallback for some windows exports
        f = open(INPUT_FILE, 'r', encoding='cp1252')
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        
    if not headers:
        print("Error: The CSV file appears to be empty or invalid.")
        return

    print("\n------------------------------------------------")
    print("Found these columns in your CSV:")
    for i, h in enumerate(headers):
        print(f"{i}: {h}")
        
    print("\n------------------------------------------------")
    print("Look at the list above. Which column number contains the TradingView Username?")
    print("(Common names might be: 'TradingView ID', 'checkout_field_1', 'order_notes', 'Customer Note', '_billing_woocmr_custom_field')")
    
    col_input = input("Enter the NUMBER of the column (e.g., 5): ")
    
    try:
        col_index = int(col_input)
        target_col = headers[col_index]
    except (ValueError, IndexError):
        print("Invalid selection. Please run the script again and enter a valid number.")
        return

    print(f"\nExtracting data using column: '{target_col}'...")
    
    # Reset file reading
    f.seek(0)
    reader = csv.DictReader(f)
    
    extracted_count = 0
    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as out_f:
        writer = csv.writer(out_f)
        writer.writerow(['Email', 'Name', 'TradingView_ID', 'Product(s)', 'Order_Date', 'Order_Total'])
        
        for row in reader:
            tv_id = row.get(target_col, '').strip()
            
            # Some exports might have the ID in "Customer Note" or "Order Notes" if not a custom field
            # So we extract whatever is in the target column
            
            if tv_id:
                # Basic cleanup of typical email/name fields
                # Adjust these keys if your CSV uses different headers (WooCommerce usually uses these)
                email = row.get('Billing Email', '') or row.get('Email', '') or row.get('Customer Email', '')
                
                first_name = row.get('Billing First Name', '') or row.get('First Name', '')
                last_name = row.get('Billing Last Name', '') or row.get('Last Name', '')
                name = f"{first_name} {last_name}".strip()
                
                products = row.get('Order Items', '') or row.get('Product Name', '') or row.get('Item Name', '')
                date = row.get('Order Date', '') or row.get('Date', '')
                total = row.get('Order Total', '') or row.get('Total', '')
                
                writer.writerow([email, name, tv_id, products, date, total])
                extracted_count += 1
    
    f.close()
    
    print(f"\nSuccess! Extracted {extracted_count} records.")
    print(f"File saved to: {OUTPUT_FILE}")
    print("You can now open this file in Excel to see a clean list of users to grant access to.")

if __name__ == "__main__":
    main()
