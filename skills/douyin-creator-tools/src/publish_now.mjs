import { chromium } from "playwright";
import path from "path";

(async () => {
  const userDataDir = path.resolve(".playwright/douyin-profile");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: "chrome",
    args: ["--window-size=1440,900"]
  });
  const page = await context.newPage();
  await page.goto("https://creator.douyin.com/creator-micro/content/post/article");
  
  await page.waitForTimeout(3000);
  
  await page.fill('[placeholder="请输入文章标题，最多不超过30个字"]', "赛博生活：AI助手如何改变工作方式");
  await page.fill('[placeholder="添加内容摘要或文章精彩部分吸引用户阅读，最多不超过30个字"]', "体验由本地AI接管电脑的赛博生活，告别繁琐操作。");
  
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill("在这个快节奏的时代，时间就是一切。拥有一个能直接操控电脑的赛博小弟，意味着你只需发号施令，它就能自动处理文件、一键发文、甚至批量回评论。AI已不再是干聊的机器，而是真正能跑腿办事的智能代理。彻底释放双手的未来体验，你准备好了吗？");
  
  const uploadArea = page.getByText(/点击上传封面图|选择封面|点击上传图片/).first();
  await uploadArea.scrollIntoViewIfNeeded();
  
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    uploadArea.click({force: true})
  ]);
  await fileChooser.setFiles('/Users/mac/Desktop/IMG_0649.JPG');
  
  const finishBtn = page.getByRole("button", { name: /完成|确定/ }).last();
  await finishBtn.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1000);
  await finishBtn.click({force: true});
  
  await page.waitForTimeout(3000);
  
  await page.getByRole("button", { name: "发布", exact: true }).first().click({force: true});
  
  await page.waitForTimeout(4000);
  await context.close();
  console.log("SUCCESS");
})();
