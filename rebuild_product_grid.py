import csv
import re
import os

def clean_html(raw_html):
    """Remove HTML tags and truncate description."""
    if not raw_html:
        return ""
    cleanr = re.compile('<.*?>', re.DOTALL)
    cleantext = re.sub(cleanr, '', raw_html)
    # Decode HTML entities if needed (basic ones)
    cleantext = cleantext.replace('&nbsp;', ' ').replace('&amp;', '&')
    # Replace explicit newlines and tabs with space
    cleantext = cleantext.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
    # Replace literal \n string if present (common in some exports)
    cleantext = cleantext.replace('\\n', ' ')
    # Remove excessive whitespace
    cleantext = " ".join(cleantext.split())
    # Truncate to ~120 chars
    if len(cleantext) > 120:
        return cleantext[:117] + "..."
    return cleantext

def rebuild_grid():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "Legacy_Backup", "products.csv")
    html_path = os.path.join(base_dir, "tradingview.html")
    
    print(f"Reading CSV from: {csv_path}")
    
    products = []
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Only process published products
                if row.get('Published') == '0':
                    continue
                
                # Get description (prefer short, fall back to full)
                desc = row.get('Short description', '')
                if not desc:
                    desc = row.get('Description', '')
                
                products.append({
                    'name': row.get('Name', 'Untitled').replace('Title: ', ''),
                    'desc': clean_html(desc),
                    'price': row.get('Regular price', ''),
                    'sale_price': row.get('Sale price', ''),
                    'images': row.get('Images', '')
                })
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    print(f"Found {len(products)} products.")

    # Generate HTML grid
    grid_html = '\n'
    for p in products:
        # Price logic
        if p['sale_price']:
            price_display = f'<div class="price-tag"><span>${p["price"]}</span> ${p["sale_price"]}</div>'
        elif p['price']:
            price_display = f'<div class="price-tag">${p["price"]}</div>'
        else:
            price_display = '<div class="price-tag">Free</div>'

        # Image logic - use first image or placeholder
        # Simplify image for now - just use placeholder or first image if available
        # The SVG placeholder is cleaner for now as the image URLs might be old WP paths
        img_html = '''<svg fill="none" height="64" stroke="currentColor" stroke-width="1.5" viewbox="0 0 24 24" width="64"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'''
        
        card = f'''    <!-- {p['name']} -->
    <div class="product-card">
        <div class="card-img">
            {img_html}
        </div>
        <div class="card-content">
            <h2 class="card-title">{p['name']}</h2>
            <p class="card-desc">{p['desc']}</p>
            <div class="price-row">
                {price_display}
                <button class="btn-stripe" onclick="alert('Stripe Link Not Configured')">Buy Now</button>
            </div>
        </div>
    </div>
'''
        grid_html += card

    # Read existing HTML
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Reassemble HTML
    start_marker = '<div class="product-grid">'
    footer_marker = '<footer'
    
    start_idx = content.find(start_marker)
    footer_idx = content.find(footer_marker)
    
    if start_idx == -1 or footer_idx == -1:
        print("Error: Could not find markers in HTML file.")
        return

    # Keep the start marker, inject new grid, then close the div before footer
    header = content[:start_idx + len(start_marker)]
    
    footer_part = content[footer_idx:]
    
    # Construct final HTML
    # We need to close the product-grid div AND the container div
    final_html = header + grid_html + '\n</div>\n</div>\n' + footer_part
    
    # Write back
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(final_html)
        
    print("Successfully updated tradingview.html with CSV data.")

if __name__ == "__main__":
    rebuild_grid()
