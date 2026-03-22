import { chromium } from "playwright";
import path from "path";

(async () => {
  const userDataDir = path.resolve(".playwright/douyin-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chrome"
  });
  const page = await context.newPage();
  await page.goto("https://creator.douyin.com/creator-micro/content/post/article");
  
  await page.waitForTimeout(3000);
  
  console.log("上传封面图...");
  const uploadArea = page.getByText(/点击上传封面图|选择封面/).first();
  await uploadArea.scrollIntoViewIfNeeded();
  
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    uploadArea.click()
  ]);
  await fileChooser.setFiles('/Users/mac/Desktop/IMG_0649.JPG');
  
  console.log("等待弹窗...");
  await page.waitForTimeout(5000); // 弹窗渲染完毕
  await page.screenshot({ path: "cover_dialog.png" });
  console.log("截图已保存");
  await context.close();
})();
