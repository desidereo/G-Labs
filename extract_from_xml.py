import xml.etree.ElementTree as ET
import csv
import os

def extract_from_xml():
    # 1. Find the XML file
    folder_path = "Legacy_Backup"
    xml_file = None
    
    # Look for any .xml file in the backup folder
    if os.path.exists(folder_path):
        for f in os.listdir(folder_path):
            if f.endswith(".xml"):
                xml_file = os.path.join(folder_path, f)
                break
    
    if not xml_file:
        print(f"Error: No .xml file found in {folder_path}/")
        print("Please go to WordPress -> Tools -> Export -> All Content -> Download Export File")
        print("And save it as 'backup.xml' in the Legacy_Backup folder.")
        return

    print(f"Reading {xml_file}...")
    
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
    except Exception as e:
        print(f"Error parsing XML: {e}")
        return

    # Namespace map (WordPress XMLs use namespaces)
    ns = {
        'wp': 'http://wordpress.org/export/1.2/',
        'content': 'http://purl.org/rss/1.0/modules/content/'
    }

    # 2. Scan for Orders and Collect ALL Meta Keys
    print("Scanning for Orders and Custom Fields...")
    
    orders = []
    all_meta_keys = set()
    
    # The XML structure is typically rss -> channel -> item
    channel = root.find('channel')
    if channel is None:
        channel = root # Sometimes it's just root

    count = 0
    for item in channel.findall('item'):
        post_type = item.find('wp:post_type', ns)
        if post_type is not None and post_type.text in ['shop_order', 'shop_subscription']:
            count += 1
            order_data = {}
            order_data['Order ID'] = item.find('title').text
            
            # Extract all meta data
            for meta in item.findall('wp:postmeta', ns):
                key = meta.find('wp:meta_key', ns).text
                val = meta.find('wp:meta_value', ns).text
                
                if key:
                    all_meta_keys.add(key)
                    # We store it if it looks interesting (skip internal WP stuff usually starting with _)
                    # But for now, we store everything to help the user find the hidden one
                    order_data[key] = val
            
            orders.append(order_data)

    print(f"Found {count} orders/subscriptions.")
    
    if count == 0:
        print("No orders found in this XML. Did you export 'All Content'?")
        return

    # 3. Help the user find the right key
    print("\n------------------------------------------------")
    print("Potential TradingView Field Names found in your database:")
    print("------------------------------------------------")
    
    potential_matches = [k for k in all_meta_keys if 'trading' in k.lower() or 'view' in k.lower() or 'user' in k.lower() or 'id' in k.lower()]
    
    for i, key in enumerate(potential_matches):
        print(f"{i}: {key}")
        
    print("\n(If you don't see it above, press Enter to search manually)")
    
    selection = input("Enter the number of the correct field (or press Enter): ")
    
    target_key = None
    if selection.isdigit() and int(selection) < len(potential_matches):
        target_key = potential_matches[int(selection)]
    else:
        target_key = input("Type the exact field name to search for: ")

    if not target_key:
        print("No field selected. Exiting.")
        return

    # 4. Export to CSV
    output_file = "customer_access_list_from_xml.csv"
    print(f"\nExtracting '{target_key}' to {output_file}...")
    
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Order ID', 'TradingView ID (Found)', 'Full Meta Data (Debug)'])
        
        found_count = 0
        for order in orders:
            tv_id = order.get(target_key, '')
            if tv_id:
                found_count += 1
                writer.writerow([order['Order ID'], tv_id, str(order)])
            
    print(f"Done! Found {found_count} users with IDs.")
    print(f"Open '{output_file}' to see your list.")

if __name__ == "__main__":
    extract_from_xml()
