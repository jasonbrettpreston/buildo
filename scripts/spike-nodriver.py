"""
Nodriver WAF Bypass Spike — test if CDP-based automation bypasses City of Toronto's WAF.

Usage: python scripts/spike-nodriver.py
"""

import asyncio
import json
import nodriver as uc


AIC_BASE = "https://secure.toronto.ca/ApplicationStatus"
TEST_YEAR = "26"
TEST_SEQUENCE = "131337"


async def main():
    print("=== Nodriver WAF Bypass Spike ===\n")

    print("1. Launching Chrome via CDP...")
    browser = await uc.start()
    page = await browser.get("about:blank")
    print("   OK\n")

    print("2. Warm bootstrap: toronto.ca...")
    try:
        page = await browser.get("https://www.toronto.ca", new_tab=False)
        await page.sleep(2)
        print("   OK\n")
    except Exception as e:
        print(f"   WARN — {e}\n")

    print("3. AIC portal...")
    page = await browser.get(f"{AIC_BASE}/setup.do?action=init", new_tab=False)
    await page.sleep(2)
    print("   OK\n")

    # Step-by-step API calls using separate evaluations to handle async properly
    print("4. Step 1: Search properties...")
    try:
        step1 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/properties', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
                body: JSON.stringify({{
                    ward: '', folderYear: '{TEST_YEAR}', folderSequence: '{TEST_SEQUENCE}',
                    folderSection: '', folderRevision: '', folderType: '',
                    address: '', searchType: '0',
                    mapX: null, mapY: null,
                    propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
                }})
            }}).then(r => r.text())
        """, await_promise=True)

        if step1 and step1.strip().startswith('<'):
            print(f"   WAF BLOCKED (HTML response)")
            print(f"\n=== VERDICT: WAF still blocking ===")
            browser.stop()
            return

        props = json.loads(step1)
        if not props or len(props) == 0:
            print(f"   No properties found")
            print(f"\n=== VERDICT: No data (but WAF bypassed) ===")
            browser.stop()
            return

        print(f"   OK — found property: {props[0].get('address', props[0].get('street', 'N/A'))}")
        property_rsn = str(props[0]['propertyRsn'])

    except Exception as e:
        print(f"   ERROR: {e}")
        print(f"\n=== VERDICT: Failed ===")
        browser.stop()
        return

    print("5. Step 2: Get folders...")
    try:
        step2 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/folders', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json', Accept: 'application/json' }},
                body: JSON.stringify({{
                    ward: '', folderYear: '{TEST_YEAR}', folderSequence: '{TEST_SEQUENCE}',
                    folderSection: '', folderRevision: '', folderType: '',
                    address: '', searchType: '0', propertyRsn: '{property_rsn}',
                    mapX: null, mapY: null,
                    propX_min: '0', propX_max: '0', propY_min: '0', propY_max: '0'
                }})
            }}).then(r => r.text())
        """, await_promise=True)

        if step2 and step2.strip().startswith('<'):
            print(f"   WAF BLOCKED (HTML response)")
            print(f"\n=== VERDICT: WAF blocks at folders endpoint ===")
            browser.stop()
            return

        folders = json.loads(step2)
        bld = next((f for f in folders if f.get('folderSection') == 'BLD'), None)
        print(f"   OK — {len(folders)} folders, BLD status: {bld['statusDesc'] if bld else 'N/A'}")

    except Exception as e:
        print(f"   ERROR: {e}")
        print(f"\n=== VERDICT: Failed at folders ===")
        browser.stop()
        return

    if not bld:
        print(f"\n=== VERDICT: WAF bypassed but no BLD folder ===")
        browser.stop()
        return

    print("6. Step 3: Get detail...")
    try:
        step3 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/detail/{bld['folderRsn']}', {{
                method: 'GET',
                headers: {{ Accept: 'application/json' }}
            }}).then(r => r.text())
        """, await_promise=True)

        detail = json.loads(step3)
        processes = detail.get('inspectionProcesses', [])
        print(f"   OK — {len(processes)} inspection processes, showStatus: {detail.get('showStatus')}")

    except Exception as e:
        print(f"   ERROR: {e}")
        print(f"\n=== VERDICT: Failed at detail ===")
        browser.stop()
        return

    if not processes:
        print(f"\n=== VERDICT: WAF BYPASSED — full 3-step chain works (no stages yet) ===")
        browser.stop()
        return

    print("7. Step 4: Get inspection stages...")
    try:
        proc = processes[0]
        step4 = await page.evaluate(f"""
            fetch('{AIC_BASE}/jaxrs/search/status/{bld['folderRsn']}/{proc['processRsn']}', {{
                method: 'GET',
                headers: {{ Accept: 'application/json' }}
            }}).then(r => r.text())
        """, await_promise=True)

        status_data = json.loads(step4)
        stages = status_data.get('stages', [])
        print(f"   OK — {len(stages)} inspection stages")
        for s in stages[:3]:
            print(f"     - {s.get('desc')}: {s.get('status')}")
        if len(stages) > 3:
            print(f"     ... and {len(stages) - 3} more")

    except Exception as e:
        print(f"   ERROR: {e}")
        print(f"\n=== VERDICT: Failed at stages ===")
        browser.stop()
        return

    print(f"\n=== VERDICT: WAF BYPASSED — full 4-step API chain works with nodriver ===")
    print(f"    Property: {props[0].get('address', props[0].get('street', 'N/A'))}")
    print(f"    Folders: {len(folders)}, Stages: {len(stages)}")

    browser.stop()


if __name__ == "__main__":
    asyncio.run(main())
