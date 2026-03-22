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
  
  // 填充正文内容
  console.log("正在填写...");
  await page.fill('[placeholder="请输入文章标题，最多不超过30个字"]', "Hello World");
  await page.fill('[placeholder="添加内容摘要或文章精彩部分吸引用户阅读，最多不超过30个字"]', "赛博小弟的一条纯文本测试");
  
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("Hello World! OpenClaw自动发布，这回连封面一起搞定。");
  
  // 必须上传封面
  console.log("正在上传封面图...");
  const uploadArea = page.getByText(/点击上传封面图|选择封面/).first();
  await uploadArea.scrollIntoViewIfNeeded();
  
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    uploadArea.click({force: true})
  ]);
  await fileChooser.setFiles('/Users/mac/Desktop/IMG_0649.JPG');
  
  // 弹窗里的按钮是 "完成"
  console.log("等待裁剪弹窗点击完成...");
  const finishBtn = page.getByRole("button", { name: "完成" }).first();
  await finishBtn.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(2000);
  await finishBtn.click();
  
  console.log("等待5秒弹窗消失...");
  await page.waitForTimeout(5000);
  
  // 点击发布
  console.log("点击发布...");
  await page.getByRole("button", { name: "发布", exact: true }).first().click({force: true});
  
  console.log("等待发布响应...");
  await page.waitForTimeout(5000);
  await context.close();
})();
