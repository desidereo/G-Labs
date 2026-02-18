import xml.etree.ElementTree as ET
import os

def list_post_types():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    xml_path = os.path.join(base_dir, "Legacy_Backup", "g-labs.WordPress.2026-02-17.xml")
    
    types = set()
    try:
        context = ET.iterparse(xml_path, events=('end',))
        for event, elem in context:
            if elem.tag.endswith('post_type') and elem.text:
                types.add(elem.text)
                elem.clear()
    except Exception as e:
        print(f"Error: {e}")
        
    print("Found Post Types:")
    for t in sorted(types):
        print(f"- {t}")

if __name__ == "__main__":
    list_post_types()
