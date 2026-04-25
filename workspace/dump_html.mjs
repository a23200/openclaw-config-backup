import { chromium } from "playwright";
import path from "path";
(async () => {
  const userDataDir = path.resolve(".playwright/douyin-profile");
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await context.newPage();
  await page.goto("https://creator.douyin.com/creator-micro/content/upload");
  await page.waitForTimeout(5000);
  const html = await page.content();
  console.log(html.substring(0, 5000)); // just a snippet
  await context.close();
})();
