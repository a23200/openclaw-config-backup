#!/usr/bin/env python3
import asyncio
import os

from playwright.async_api import async_playwright


async def main() -> None:
    cdp_url = os.getenv("LOCAL_BROWSER_CDP_URL") or os.getenv("BROWSER_CDP_URL")
    if not cdp_url:
        raise RuntimeError("Missing LOCAL_BROWSER_CDP_URL or BROWSER_CDP_URL")

    print(f"CDP URL: {cdp_url}")

    async with async_playwright() as playwright:
        print("Playwright started")
        browser = await playwright.chromium.connect_over_cdp(cdp_url)
        print("CDP connected")

        if browser.contexts:
            context = browser.contexts[0]
            print(f"Reusing context, pages={len(context.pages)}")
        else:
            context = await browser.new_context()
            print("Created new context")

        if context.pages:
            page = context.pages[0]
            print(f"Using existing page: {page.url}")
        else:
            page = await context.new_page()
            print("Created new page")

        await page.goto("https://www.goofish.com/search?q=iPhone%2017", timeout=30000)
        await page.wait_for_load_state("networkidle", timeout=30000)
        print(f"Final URL: {page.url}")

        body_text = await page.locator("body").inner_text(timeout=10000)
        excerpt = body_text[:1500].replace("\n", " ")
        print(f"Body excerpt: {excerpt}")

        await browser.close()
        print("Done")


if __name__ == "__main__":
    asyncio.run(main())
