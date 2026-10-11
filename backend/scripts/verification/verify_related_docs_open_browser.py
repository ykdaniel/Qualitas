"""Real-browser check for RELATED-DOCS-OPEN-2026-001 against the isolated stack (port 3292).

Usage: python verify_related_docs_open_browser.py <screenshot-dir>
Prints PASS/FAIL per scenario; exit code 1 if any fails.
"""
import sys, re
from pathlib import Path
from playwright.sync_api import sync_playwright

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
BASE = "http://127.0.0.1:3292"
ITP_B, ITP_A, NOI = "QTS-RKS-RRV-ITP-000002", "QTS-RKS-RRV-ITP-000001", "QTS-RKS-RRV-NOI-000001"
results = []


def check(name, ok, detail):
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name + " | " + detail, flush=True)


def open_ref(page):
    """Reference no. of the record whose edit window is open (read-only Reference no. input), else None."""
    for ref in (ITP_A, ITP_B, NOI):
        if page.locator(f"input[value='{ref}']").count() > 0:
            return ref
    return None


def related_card(page, ref):
    return page.locator("button, [role=button], div").filter(has_text=re.compile(rf"^\s*\w+\s*{re.escape(ref)}")).last


with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(15000)
    page.add_init_script("localStorage.setItem('language','en')")
    page.goto(f"{BASE}/login")
    page.fill("#email", "related_review")
    page.fill("#password", "Accept-Test-1234")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u)

    # 1. NOI window -> Related Documents (upstream ITP) -> that ITP's window opens; close -> back on NOI page.
    page.goto(f"{BASE}/noi")
    page.get_by_text(NOI, exact=True).first.click()
    page.wait_for_timeout(1200)
    check("1a NOI window open", open_ref(page) == NOI, f"open={open_ref(page)}")
    page.get_by_text("Related Documents").scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    page.screenshot(path=str(out / "1-noi-related.png"))
    page.get_by_text(ITP_B, exact=True).last.click()
    page.wait_for_url(re.compile(r"/itp"))
    page.wait_for_timeout(1500)
    check("1b clicking related ITP opens that ITP", open_ref(page) == ITP_B, f"url={page.url} open={open_ref(page)}")
    check("1c openId removed from URL", "openId" not in page.url, page.url)
    page.screenshot(path=str(out / "2-itp-opened.png"))
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(1200)
    check("1d closing returns to the NOI page", "/noi" in page.url, page.url)

    # 2. ITP window -> Related Documents (downstream NOI) -> that NOI's window opens.
    page.goto(f"{BASE}/itp")
    page.get_by_text(ITP_B, exact=True).first.click()
    page.wait_for_timeout(1200)
    page.get_by_text("Related Documents").scroll_into_view_if_needed()
    page.wait_for_timeout(800)
    page.get_by_text(NOI, exact=True).last.click()
    page.wait_for_url(re.compile(r"/noi"))
    page.wait_for_timeout(1500)
    check("2a clicking related NOI opens that NOI", open_ref(page) == NOI, f"url={page.url} open={open_ref(page)}")
    page.screenshot(path=str(out / "3-noi-opened.png"))
    page.get_by_role("button", name="Cancel").first.click()
    page.wait_for_timeout(1200)
    check("2b closing returns to the ITP page", page.url.rstrip("/").endswith("/itp"), page.url)

    # 3. Regression: sidebar navigation to a module still shows the plain list, nothing opened.
    page.goto(f"{BASE}/itp")
    page.wait_for_timeout(1200)
    check("3 plain /itp opens no window", open_ref(page) is None, f"open={open_ref(page)}")
    browser.close()

sys.exit(0 if all(results) else 1)
