import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
import time
import os
import subprocess

def remove_tradingview_users():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, "customer_data_export.csv")
    
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

    # 1. Load Data
    print("Loading customer data...")
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return
    
    # Identify users to remove
    remove_list = set()
    
    for index, row in df.iterrows():
        tv_name = str(row.get('TradingView Name', '')).strip()
        if not tv_name or tv_name.lower() == 'nan':
            continue
        remove_list.add(tv_name)
            
    print(f"\n--- ANALYSIS ---")
    print(f"Total Users in CSV: {len(df)}")
    print(f"Users to REMOVE (Found in CSV): {len(remove_list)}")
    
    if not remove_list:
        print("No users found in database to remove.")
        return

    print("\nUsers scheduled for removal:")
    count = 0
    for user in sorted(remove_list):
        print(f"- {user}")
        count += 1
        if count >= 10:
            print(f"... and {len(remove_list) - 10} more.")
            break
        
    print("\nAuto-launching browser in 2 seconds...")
    time.sleep(2)

    def resolve_chrome_path():
        candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe")
        ]
        for path in candidates:
            if path and os.path.exists(path):
                return path
        return None

    # OUTER LOOP - Driver Resurrection (Restarts browser if it crashes)
    while True: 
        driver = None
        try:
            print("\nLaunching Chrome...")
            service = Service(ChromeDriverManager().install())
            try:
                options = webdriver.ChromeOptions()
                options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
                driver = webdriver.Chrome(service=service, options=options)
                print("Connected to existing Chrome on port 9222.")
            except Exception:
                chrome_path = resolve_chrome_path()
                if chrome_path:
                    debug_dir = os.path.join(base_dir, "chrome_debug_profile")
                    try:
                        subprocess.Popen([chrome_path, "--remote-debugging-port=9222", f"--user-data-dir={debug_dir}"])
                        time.sleep(2)
                        options = webdriver.ChromeOptions()
                        options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
                        driver = webdriver.Chrome(service=service, options=options)
                        print("Started new Chrome with remote debugging.")
                    except Exception:
                        driver = None
                if not driver:
                    options = webdriver.ChromeOptions()
                    options.add_argument("--start-maximized")
                    options.add_experimental_option("detach", True)
                    options.add_argument("--disable-blink-features=AutomationControlled")
                    options.add_experimental_option("excludeSwitches", ["enable-automation"])
                    options.add_experimental_option("useAutomationExtension", False)
                    try:
                        driver = webdriver.Chrome(service=service, options=options)
                    except Exception as e:
                        print(f"Failed to launch Chrome: {e}")
                        print("Retrying in 5 seconds...")
                        time.sleep(5)
                        continue

            def is_manage_access_open():
                try:
                    if driver.find_elements(By.XPATH, "//*[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'manage access')]"):
                        return True
                    if driver.find_elements(By.XPATH, "//button[contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'remove') or contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'revoke') or contains(translate(normalize-space(text()), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'delete')]"):
                        return True
                    if driver.find_elements(By.CSS_SELECTOR, "[class*='remove'], [class*='close'], [class*='delete']"):
                        return True
                    sample_names = list(remove_list)[:5]
                    for name in sample_names:
                        if driver.find_elements(By.XPATH, f"//*[normalize-space(text())='{name}']"):
                            return True
                except Exception:
                    return False
                return False

            if not is_manage_access_open():
                print("Navigating to TradingView...")
                try:
                    driver.get("https://www.tradingview.com/")
                except Exception:
                    print("Navigation failed. Continuing with current page...")
                
                print("\nIMPORTANT: Please log in to your TradingView account in the browser window.")
                print("Waiting 5 seconds for initial page load...")
                time.sleep(5)
                
                print("Navigating to Published Scripts...")
                print("Please navigate to the 'Manage Access' dialog for the script you want to clean.")
                print("Script is ARMED and READY. It will start cleaning immediately once you open the list.")
            else:
                print("Manage Access already open. Starting scan.")

            while True:
                start_choice = input("Type 1 and press Enter to start scanning: ").strip()
                if start_choice == "1":
                    break

            print("Starting scan now...")
            
            pass_without_removals = 0

            # CONTINUOUS LOOP - Keeps scanning until no targets remain
            while True:
                try:
                    print("\n--- STARTING SCAN PASS ---")
                    total_removed = 0
                    found_any_targets = False
                    
                    # SCROLLING LOOP
                    max_scrolls = 500
                    scroll_i = 0
                    consecutive_empty_reads = 0
                    
                    while True: # Scan Loop (Inner)
                        if scroll_i > max_scrolls:
                             print("Reached max scrolls limit. Restarting scan from top...")
                             try:
                                 driver.execute_script("window.scrollTo(0, 0);")
                             except Exception:
                                 pass
                             scroll_i = 0
                             consecutive_empty_reads = 0
                             time.sleep(1)
                             continue
                             
                        # 1. Find all potential user elements currently visible
                        users_found_in_pass = 0
                        
                        try:
                            # Safe element finding
                            if not driver: raise Exception("Driver lost")
                            
                            # OPTIMIZATION: Use JS to find targets directly (much faster than finding all elements)
                            # This avoids transferring thousands of WebElements for non-targets
                            print(f"Scanning page for {len(remove_list)} target users...")
                            
                            # Create lowercase set for case-insensitive matching
                            remove_names_lower = list({name.lower() for name in remove_list})
                            
                            js_script = """
                            var remove_names = new Set(arguments[0]);
                            var targets = [];
                            // Broaden selector to ensure we catch everything, including list items
                            var candidates = document.querySelectorAll('*');
                            
                            for (var i = 0; i < candidates.length; i++) {
                                var el = candidates[i];
                                // Use textContent for raw text (faster, includes hidden)
                                var txt = el.textContent || el.innerText || "";
                                txt = txt.trim().toLowerCase();
                                
                                // Partial match check for usernames that might be part of a longer string
                                // or checking if the element text is exactly the username
                                if (txt.length > 0) {
                                   if (remove_names.has(txt)) {
                                       // Exact match
                                       if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
                                            targets.push(el);
                                       }
                                   } else {
                                       // Check if any username is contained in the text (for tricky UI elements)
                                       // This is slower but safer if exact match fails
                                       // Only do this for short text to avoid false positives in long paragraphs
                                       if (txt.length < 50) {
                                            for (let name of remove_names) {
                                                if (txt === name) {
                                                     if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
                                                        targets.push(el);
                                                        break;
                                                     }
                                                }
                                            }
                                       }
                                   }
                                }
                            }
                            return targets;
                            """
                            
                            # Execute JS to get only the matching elements
                            found_elements = driver.execute_script(js_script, remove_names_lower)
                            print(f"JS Scan found {len(found_elements)} matches.")
                            
                            # Fallback/Sanity Check: If JS finds nothing, try a precise XPath for a few users
                            # This handles cases where JS might fail due to context issues
                            if not found_elements and len(remove_list) > 0:
                                print("JS Scan returned 0 results. Trying deep scan (XPath)...")
                                sample_check = list(remove_list)[:5] # Increase sample size
                                for name in sample_check:
                                    try:
                                        # Case-insensitive XPath
                                        xpath = f"//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{name.lower()}')]"
                                        xpath_matches = driver.find_elements(By.XPATH, xpath)
                                        if xpath_matches:
                                            print(f"DEBUG: JS missed '{name}' but XPath found it. Switching to XPath fallback for this pass.")
                                            found_elements.extend(xpath_matches)
                                    except:
                                        pass
                            
                            consecutive_empty_reads = 0
                                
                        except Exception as e:
                            print(f"Error finding elements: {e}")
                            time.sleep(1)
                            # If driver is dead, this will trigger the outer exception
                            if "invalid session" in str(e).lower() or "no such window" in str(e).lower():
                                raise e 
                            continue

                        dom_changed = False
                        targets = []
                        
                        # Identify targets
                        remove_list_lower_set = {name.lower() for name in remove_list}
                        
                        for el in found_elements:
                            try:
                                txt = el.text.strip()
                                if txt and txt.lower() in remove_list_lower_set:
                                    # Highlight the found element for visual confirmation
                                    try:
                                        driver.execute_script("arguments[0].style.border='3px solid red'; arguments[0].style.backgroundColor='yellow'; arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", el)
                                        time.sleep(0.5) # Short pause to see the highlight
                                    except:
                                        pass
                                    targets.append((el, txt))
                            except:
                                continue
                                
                        if targets:
                            found_any_targets = True
                            print(f"Found {len(targets)} targets. Attempting removal...")
                        
                        # Process targets
                        for element, text in reversed(targets):
                            try:
                                # Find remove button
                                ancestor = element
                                clicked = False
                                
                                for _ in range(5): 
                                    try:
                                        ancestor = ancestor.find_element(By.XPATH, "./..")
                                        remove_btns = ancestor.find_elements(By.CSS_SELECTOR, "[class*='remove'], [class*='close'], [class*='delete'], svg, button")
                                        
                                        for btn in remove_btns:
                                            if btn.is_displayed():
                                                try:
                                                    btn.click()
                                                    clicked = True
                                                    print(f"REMOVED: {text}")
                                                    total_removed += 1
                                                    users_found_in_pass += 1
                                                    
                                                    # Handle confirmation
                                                    try:
                                                         confirm_btns = driver.find_elements(By.XPATH, "//button[contains(text(), 'Yes') or contains(text(), 'Remove') or contains(text(), 'Confirm')]")
                                                         for c_btn in confirm_btns:
                                                             if c_btn.is_displayed():
                                                                 c_btn.click()
                                                    except:
                                                        pass

                                                    break 
                                                except Exception:
                                                    continue
                                        if clicked: break
                                    except Exception:
                                        break
                                
                                if not clicked:
                                    pass
                                    
                            except Exception as e:
                                continue
                                
                        if users_found_in_pass > 0:
                             dom_changed = True
                             
                        if dom_changed:
                            print("User removed. Waiting 2 seconds for UI update...")
                            time.sleep(2)
                            scroll_i = 0
                            consecutive_empty_reads = 0
                            try:
                                driver.execute_script("window.scrollTo(0, 0);")
                            except Exception:
                                pass
                            continue
                        
                        # 2. SCROLL DOWN (Only if nothing was removed)
                        try:
                            driver.execute_script("window.scrollBy(0, 700);")
                            time.sleep(0.5)
                            scroll_i += 1
                        except Exception:
                            print("Scrolling failed. Restarting scan...")
                            scroll_i = 0
                            consecutive_empty_reads = 0
                            continue
                    
                    print(f"Scan pass complete. Removed {total_removed} users.")
                    if total_removed == 0 and not found_any_targets:
                        pass_without_removals += 1
                    else:
                        pass_without_removals = 0

                    if pass_without_removals >= 2:
                        print("All target users appear to be removed. Auto-completing.")
                        return

                    print("Scanning for more users or new dialog...")
                    time.sleep(1)

                except Exception as e:
                    err_msg = str(e).lower()
                    print(f"Error during scan pass: {e}")
                    
                    if "no such window" in err_msg or "target window already closed" in err_msg or "invalid session id" in err_msg:
                        print("Browser appears to be closed or crashed. Restarting browser...")
                        break # Break inner loop to trigger outer loop restart
                    
                    print("Recovering in 2 seconds...")
                    time.sleep(2)
                    continue
                    
        except KeyboardInterrupt:
            print("\nStopped by user.")
            if driver: 
                try: driver.quit()
                except: pass
            return
        except Exception as e:
            print(f"Critical error in driver loop: {e}")
            print("Restarting entire process in 5 seconds...")
            if driver:
                try: driver.quit()
                except: pass
            time.sleep(5)
            continue

if __name__ == "__main__":
    remove_tradingview_users()
