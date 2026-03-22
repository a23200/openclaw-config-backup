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
  
  await page.waitForTimeout(2000);
  await page.fill('[placeholder="请输入文章标题，最多不超过30个字"]', "Hello World");
  await page.fill('[placeholder="添加内容摘要或文章精彩部分吸引用户阅读，最多不超过30个字"]', "赛博小弟的自动发布测试");
  
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("Hello World! 赛博小弟的一条纯文本测试内容发布，带封面测试成功。");
  
  // 关键：封面设置，必须传封面
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('点击上传封面图').first().click()
  ]);
  await fileChooser.setFiles('/Users/mac/Desktop/IMG_0649.JPG');
  
  console.log("正在等待图片裁剪弹窗...");
  await page.waitForTimeout(3000); // 弹窗渲染
  
  // 点击弹窗中的 确定/完成
  try {
    await page.getByRole('button', { name: /确定|完成|确认/ }).last().click({timeout: 5000});
  } catch (e) {
    console.log("没找到确定按钮，可能不需要裁剪", e.message);
  }
  
  await page.waitForTimeout(2000);
  
  // 发布
  console.log("点击发布...");
  await page.getByRole("button", { name: "发布", exact: true }).first().click();
  
  await page.waitForTimeout(5000);
  console.log("发布成功！");
  await context.close();
})();
