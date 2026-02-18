import xml.etree.ElementTree as ET
import pandas as pd
import os
import csv
from datetime import datetime

def get_status_priority(status):
    status = status.lower()
    if 'active' in status:
        return 5
    if 'on-hold' in status:
        return 4
    if 'pending' in status:
        return 3
    if 'cancelled' in status:
        return 2
    if 'expired' in status:
        return 1
    return 0

def parse_xml_for_meta(xml_path):
    """
    Parses XML to extract TradingView usernames and Subscription statuses mapped by email.
    """
    print(f"Parsing XML: {xml_path}")
    
    email_to_tv = {}
    email_to_sub_status = {}
    
    try:
        context = ET.iterparse(xml_path, events=('end',))
        
        for event, elem in context:
            # Check if tag is 'item' (ignoring namespace)
            if elem.tag.endswith('item'):
                post_type = None
                status = None
                billing_email = None
                tv_username = None
                wps_sub_status = None
                
                # Iterate children directly
                for child in elem:
                    tag = child.tag
                    text = child.text
                    
                    if tag.endswith('post_type') and text:
                        post_type = text
                    elif tag.endswith('status') and text:
                        status = text
                    elif tag.endswith('postmeta'):
                        # Iterate postmeta children
                        key = None
                        val = None
                        for meta_child in child:
                            if meta_child.tag.endswith('meta_key') and meta_child.text:
                                key = meta_child.text
                            elif meta_child.tag.endswith('meta_value') and meta_child.text:
                                val = meta_child.text
                        
                        if key == '_billing_email' and val:
                            billing_email = val.strip()
                        elif key == 'trading_view_username' and val:
                            tv_username = val.strip()
                        elif key == 'wps_subscription_status' and val:
                            wps_sub_status = val.strip()
                            
                # Logic to store data
                if billing_email:
                    # Save TV username if found
                    if tv_username:
                        email_to_tv[billing_email] = tv_username
                    
                    new_status = None
                    
                    # Check for WPS Subscriptions status meta first
                    if post_type == 'wps_subscriptions':
                        if wps_sub_status:
                            new_status = wps_sub_status.replace('wc-', '').replace('_', ' ').title()
                        elif status:
                            new_status = status.replace('wc-', '').replace('_', ' ').title()
                    
                    # Fallback for standard WooCommerce Subscriptions
                    elif post_type == 'shop_subscription' and status:
                        new_status = status.replace('wc-', '').capitalize()
                    
                    if new_status:
                        # Check priority if exists
                        if billing_email in email_to_sub_status:
                            current_priority = get_status_priority(email_to_sub_status[billing_email])
                            new_priority = get_status_priority(new_status)
                            if new_priority > current_priority:
                                email_to_sub_status[billing_email] = new_status
                        else:
                            email_to_sub_status[billing_email] = new_status
                
                # Clear element to save memory
                elem.clear()
                
    except Exception as e:
        print(f"Error parsing XML: {e}")
        
    return email_to_tv, email_to_sub_status

def extract_customer_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    xml_path = os.path.join(base_dir, "Legacy_Backup", "g-labs.WordPress.2026-02-17.xml")
    xlsx_path = os.path.join(base_dir, "Legacy_Backup", "orders-2026-02-17-12-52-33.xlsx")
    output_path = os.path.join(base_dir, "customer_data_export.csv")
    
    # 1. Parse XML for TradingView names and Subscription Status
    tv_map, sub_status_map = parse_xml_for_meta(xml_path)
    print(f"Found {len(tv_map)} TradingView usernames in XML.")
    print(f"Found {len(sub_status_map)} Subscriptions in XML.")
    
    # 2. Parse XLSX for Orders
    print(f"Reading XLSX: {xlsx_path}")
    try:
        df = pd.read_excel(xlsx_path)
    except Exception as e:
        print(f"Failed to read XLSX: {e}")
        return

    # 3. Process Orders to get Customer Info
    customers = {}
    
    # Check if 'Order Date' exists
    if 'Order Date' not in df.columns:
        print("Error: 'Order Date' column not found in XLSX")
        return

    # Convert 'Order Date' to datetime, coerce errors
    df['Order Date'] = pd.to_datetime(df['Order Date'], errors='coerce')
    
    # Sort by date ascending so latest overwrites previous
    df = df.sort_values(by='Order Date', ascending=True)
    
    for index, row in df.iterrows():
        email = row.get('Email (Billing)')
        if pd.isna(email) or not email:
            continue
            
        email = str(email).strip()
        
        first_name = row.get('First Name (Billing)', '')
        last_name = row.get('Last Name (Billing)', '')
        full_name = f"{first_name} {last_name}".strip()
        
        item_name = row.get('Item Name', '')
        order_date = row.get('Order Date')
        
        # Determine Status
        status = sub_status_map.get(email, 'One-time Purchase')
        
        # Get TradingView Name
        tv_name = tv_map.get(email, '')
        
        # Format Date
        date_str = order_date.strftime('%Y-%m-%d') if not pd.isna(order_date) else 'N/A'
        
        # Update customer record
        # Since we sorted by date ascending, this will always update with the latest order info
        # But we want to preserve the BEST status if we found one earlier?
        # No, status comes from XML which is independent of this loop.
        # We just look it up.
        
        customers[email] = {
            'Name': full_name,
            'Email': email,
            'TradingView Name': tv_name,
            'Last Purchase': item_name,
            'Status': status,
            'Date of Last Payment': date_str
        }
    
    if not customers:
        print("No customers found!")
        return

    # 4. Convert to DataFrame and Export
    export_data = list(customers.values())
    export_df = pd.DataFrame(export_data)
    
    # Reorder columns
    cols = ['Name', 'TradingView Name', 'Email', 'Last Purchase', 'Status', 'Date of Last Payment']
    
    # Ensure columns exist
    for c in cols:
        if c not in export_df.columns:
            export_df[c] = ''
            
    export_df = export_df[cols]
    
    print(f"Exporting {len(export_df)} unique customers to {output_path}")
    export_df.to_csv(output_path, index=False)
    print("Done.")

if __name__ == "__main__":
    extract_customer_data()
