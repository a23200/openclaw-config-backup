import { chromium } from "playwright";
import path from "path";
(async () => {
  const userDataDir = path.resolve(".playwright/douyin-profile");
  const context = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await context.newPage();
  await page.goto("https://creator.douyin.com/creator-micro/content/upload");
  await page.waitForTimeout(5000);
  
  const uploadInput = page.locator('input[type="file"]');
  const count = await uploadInput.count();
  console.log(`Found ${count} input[type=file] elements`);
  
  const html = await page.content();
  console.log("HTML:", html.substring(0, 1000));
  await context.close();
})();
