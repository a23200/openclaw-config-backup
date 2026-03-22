
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto("https://creator.douyin.com/creator-micro/home")
        
        # Assume user is already logged in or will log in manually
        # Add a wait for the page to load if necessary
        page.wait_for_selector("text=发布", timeout=60000) 

        # Click the "发布" button
        # This locator targets a button with the exact text "发布"
        page.get_by_role("button", name="发布", exact=True).click()

        # Keep the browser open for inspection after clicking
        page.pause() 
        browser.close()

if __name__ == "__main__":
    run()
