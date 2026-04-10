import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        await page.goto("https://www.douyin.com/jingxuan/search/ai?aid=c7fddc31-c46a-4d3e-81b6-e0d7c1534884&modal_id=7614823892896599339&type=general", wait_until="networkidle")
        await page.wait_for_timeout(5000)
        await page.screenshot(path="douyin_search.png")
        html = await page.content()
        with open("douyin_search.html", "w", encoding="utf-8") as f:
            f.write(html)
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
