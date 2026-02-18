import csv
import os
import re
from bs4 import BeautifulSoup

# Define paths
HTML_FILE_TV = 'tradingview.html'
HTML_FILE_MQL5 = 'mql5.html'
CSV_FILE = 'Legacy_Backup/products.csv'

def clean_html_tags(text):
    """Remove HTML tags from description"""
    if not text:
        return ""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text).strip()

def update_product_in_html(soup, product_name, description, price):
    """Finds product by name and updates its description and price"""
    
    # Try to find the product card based on h2 text
    # This assumes h2 contains the product name
    product_card = None
    
    # Iterate all h2 tags
    for h2 in soup.find_all('h2'):
        if product_name.lower() in h2.get_text().lower():
            # Found a potential match
            # Get the parent card (closest div with class product-card or product-highlight)
            card = h2.find_parent('div', class_='product-card') or h2.find_parent('div', class_='product-highlight')
            if card:
                product_card = card
                break
    
    if product_card:
        print(f"✅ Found match for: {product_name}")
        
        # Update Description
        desc_tag = product_card.find('p', class_='card-desc') or product_card.find('p')
        if desc_tag and description:
            # Truncate description if too long for card
            short_desc = (description[:150] + '...') if len(description) > 150 else description
            desc_tag.string = short_desc
            print(f"   Updated Description.")

        # Update Price
        price_tag = product_card.find('div', class_='price-tag') or product_card.find('div', class_='price')
        if price_tag and price:
            # Assuming price is just a number in CSV
            try:
                price_val = float(price)
                formatted_price = f"${price_val:.0f}"
                
                # Check for existing span (strikethrough price)
                old_price_span = price_tag.find('span')
                if old_price_span:
                    # Keep old price span, update new price text
                    # This is tricky with bs4 navigateable strings
                    # We will reconstruct
                    old_price_text = old_price_span.get_text()
                    price_tag.clear()
                    price_tag.append(BeautifulSoup(f"<span>{old_price_text}</span> {formatted_price}", 'html.parser'))
                else:
                    price_tag.string = formatted_price
                
                print(f"   Updated Price to {formatted_price}")
            except ValueError:
                print(f"   Skipping price update (invalid format: {price})")

        return True
    else:
        print(f"❌ No HTML match found for CSV product: {product_name}")
        return False

def main():
    if not os.path.exists(CSV_FILE):
        print(f"Error: {CSV_FILE} not found. Please export your WooCommerce products to this location.")
        return

    print("Starting product import...")
    
    # Load HTML files
    with open(HTML_FILE_TV, 'r', encoding='utf-8') as f:
        soup_tv = BeautifulSoup(f, 'html.parser')
    
    with open(HTML_FILE_MQL5, 'r', encoding='utf-8') as f:
        soup_mql5 = BeautifulSoup(f, 'html.parser')

    # Read CSV
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # Map CSV columns (adjust based on your actual export format)
            # WooCommerce default export headers: 'Name', 'Description', 'Regular price', 'Sale price'
            name = row.get('Name', '').strip()
            description = clean_html_tags(row.get('Description', '') or row.get('Short description', ''))
            price = row.get('Sale price', '') or row.get('Regular price', '')
            
            if not name:
                continue

            # Try updating both files
            updated_tv = update_product_in_html(soup_tv, name, description, price)
            updated_mql5 = update_product_in_html(soup_mql5, name, description, price)

    # Save changes
    with open(HTML_FILE_TV, 'w', encoding='utf-8') as f:
        f.write(str(soup_tv))
    
    with open(HTML_FILE_MQL5, 'w', encoding='utf-8') as f:
        f.write(str(soup_mql5))

    print("\nImport complete! HTML files updated.")

if __name__ == "__main__":
    main()
