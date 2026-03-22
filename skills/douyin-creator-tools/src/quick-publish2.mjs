import { chromium } from "playwright";
import path from "path";

(async () => {
  const userDataDir = path.resolve(".playwright/douyin-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome"
  });
  const page = await context.newPage();
  await page.goto("https://creator.douyin.com/creator-micro/content/post/article");
  
  await page.waitForTimeout(3000);
  console.log("填写基本信息...");
  await page.getByPlaceholder(/请输入文章标题/).first().fill("Hello World");
  await page.getByPlaceholder(/添加内容摘要/).first().fill("赛博小弟的自动发布测试");
  
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("Hello World! 赛博小弟的一条纯文本测试内容发布，终于把这破封面搞定了。");
  
  console.log("上传封面图...");
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('点击上传封面图').first().click()
  ]);
  await fileChooser.setFiles('/Users/mac/Desktop/IMG_0649.JPG');
  
  console.log("等待裁剪弹窗...");
  await page.waitForTimeout(3000); // 等弹窗渲染
  
  // 抖音裁剪框里通常叫 "确定"
  console.log("点击裁剪框确定...");
  await page.getByRole('button', { name: "确定" }).last().click();
  
  await page.waitForTimeout(2000);
  
  console.log("发布...");
  await page.getByRole("button", { name: "发布", exact: true }).first().click();
  
  console.log("发布按钮已点击，等待 5 秒保存...");
  await page.waitForTimeout(5000);
  await context.close();
})();
