import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const videoPath = process.argv[2];
const description = process.argv[3] || "【自动发布】赛博生活记录。";

if (!videoPath || !fs.existsSync(videoPath)) {
    console.error(`[Error] 找不到视频文件: ${videoPath}`);
    process.exit(1);
}

console.log(`[Douyin-Pub] 正在独立启动新的发布窗口...`);

(async () => {
    const userDataDir = path.resolve(process.env.HOME, ".agents/skills/douyin-creator-tools/.playwright/douyin-profile");
    
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: "chrome",
      args: ["--window-size=1440,900"]
    });
    const page = await context.newPage();
    
    try {
        console.log(`[Douyin-Pub] 打开抖音视频发布页...`);
        await page.goto("https://creator.douyin.com/creator-micro/content/upload", { waitUntil: "networkidle" });
        
        const fileInput = await page.locator('input[type="file"][accept*="video"]').first();
        await page.waitForTimeout(2000); 
        await fileInput.setInputFiles(videoPath);
        
        console.log(`[Douyin-Pub] 🟢 视频上传中，等待云端解析与封面生成 (20秒)...`);
        await page.waitForTimeout(20000); 

        // 1. 消除烦人的弹窗
        const gotItBtn = page.getByText('我知道了', { exact: true }).first();
        if (await gotItBtn.isVisible()) {
            await gotItBtn.click();
            await page.waitForTimeout(1000);
        }

        // 2. 封面选择与弹窗处理
        console.log(`[Douyin-Pub] 开始处理封面...`);
        const verticalText = page.getByText('竖封面3:4').first();
        if (await verticalText.isVisible()) {
            const box = await verticalText.boundingBox();
            if (box) {
                console.log(`[Douyin-Pub] 唤起封面设置大弹窗...`);
                await page.mouse.click(box.x + box.width / 2, box.y - 60);
                await page.waitForTimeout(3000); 
                
                const finishBtn = page.locator('button:has-text("完成")').filter({ state: 'visible' }).first();
                if (await finishBtn.isVisible()) {
                    await finishBtn.click();
                    console.log(`[Douyin-Pub] ✅ 点击了封面弹窗的“完成”！`);
                } else {
                    const confirmBtn = page.locator('button:has-text("确定")').filter({ state: 'visible' }).first();
                    if (await confirmBtn.isVisible()) await confirmBtn.click();
                }
                
                await page.waitForTimeout(2000); 
                
                const skipBtn = page.locator('button:has-text("暂不设置")').filter({ state: 'visible' }).first();
                if (await skipBtn.isVisible()) {
                    await skipBtn.click();
                    console.log(`[Douyin-Pub] ✅ 成功拦截并点击了“暂不设置”横封面！`);
                }
            }
        } else {
            console.log(`[Douyin-Pub] ⚠️ 没找到竖封面文字，跳过。`);
        }
        await page.waitForTimeout(2000); 

        // 3. 💥 新增功能：一键语音转字幕 💥
        console.log(`[Douyin-Pub] 正在尝试开启“智能字幕”/“语音转字幕”...`);
        // 抖音最新版网页经常把这个功能放在叫“智能字幕”或“自动识别”的地方，并且有很多杂乱节点
        const subtitleBtns = [
            page.locator('text="智能字幕"').filter({ state: 'visible' }).first(),
            page.locator('text="自动识别字幕"').filter({ state: 'visible' }).first(),
            page.locator('text="语音转字幕"').filter({ state: 'visible' }).first(),
            page.getByText('识别字幕', { exact: true }).filter({ state: 'visible' }).first(),
            page.locator('div[title="智能字幕"]').filter({ state: 'visible' }).first()
        ];
        
        let clickedSub = false;
        for (const btn of subtitleBtns) {
            if (await btn.isVisible()) {
                await btn.click({ force: true });
                clickedSub = true;
                console.log(`[Douyin-Pub] ✅ 成功点击了“识别字幕”相关的按钮！`);
                break;
            }
        }
        
        if (clickedSub) {
            await page.waitForTimeout(3000); 
            // 有时候还需要点击“开始识别”
            const confirmSubBtn = page.locator('button:has-text("开始识别"), button:has-text("确定识别")').filter({ state: 'visible' }).first();
            if (await confirmSubBtn.isVisible()) {
                await confirmSubBtn.click();
                console.log(`[Douyin-Pub] ✅ 点击了“开始识别”确认框！`);
            }
            console.log(`[Douyin-Pub] ⏳ 等待云端字幕生成 (15秒)...`);
            await page.waitForTimeout(15000); 
        } else {
            console.log(`[Douyin-Pub] ⚠️ 没找到“智能字幕”相关按钮。可能是被其他元素挡住了。`);
        }
        
        // 4. 终极安全输入法（避免回车误触，优先直接 fill）
        console.log(`[Douyin-Pub] 正在使用纯净模式输入文案...`);
        const primaryEditor = page.locator('.zone-container').first();
        const fallbackEditor = page.getByPlaceholder('添加作品简介').first();
        const targetEditor = await primaryEditor.isVisible() ? primaryEditor : fallbackEditor;

        if (await targetEditor.isVisible()) {
            await targetEditor.click();
            await page.waitForTimeout(500);
            await targetEditor.fill(description);
            console.log(`[Douyin-Pub] ✅ 文案已通过 fill() 直接写入！`);
        } else {
            console.log(`[Douyin-Pub] ⚠️ 未能找到任何可用的文案输入框！`);
        }

        // 5. 最终发布
        console.log(`[Douyin-Pub] 寻找“发布”按钮...`);
        const leaveBtn = page.getByText('暂存离开').first();
        let publishBtn;
        
        if (await leaveBtn.isVisible()) {
            publishBtn = leaveBtn.locator('..').getByText('发布', { exact: true }).first();
        } else {
            publishBtn = page.locator('button, div[role="button"]').filter({ hasText: /^发布$/ }).last();
        }
        
        if (await publishBtn.isVisible() && await publishBtn.isEnabled()) {
            console.log(`[Douyin-Pub] 🚀 找到发布按钮！即将发射！`);
            await publishBtn.click();
        } else {
            console.log(`[Douyin-Pub] ⚠️ 发布按钮不可用。`);
        }
        
        console.log(`\n[Douyin-Pub] 🎉 脚本执行完毕！浏览器保留 5 分钟。`);
        await page.waitForTimeout(300000); 

    } catch(e) {
        console.error(`[Douyin-Pub] ❌ 发生错误:`, e);
        await page.waitForTimeout(300000); 
    }
})();