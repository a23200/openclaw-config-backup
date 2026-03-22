#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  gotoPage,
  promptForEnter,
  launchPersistentPage,
  DEFAULT_USER_DATA_DIR,
} from "./douyin-browser.mjs";
import { createSharedCliArgs, consumeSharedCliArg } from "./cli-options.mjs";

const DEFAULT_IMAGETEXT_UPLOAD_URL =
 "https://creator.douyin.com/creator-micro/content/upload?default-tab=3";

function printHelp() {
 console.log(`
Usage:
 npm run imagetext:publish -- imagetext.json

Options:
 --dry-run
 --keep-open
 --profile <path>
 --timeout <ms>
 --headless
 --help
`);
}

function parseArgs(argv) {
 const args = {
 ...createSharedCliArgs(),
 inputFile: "",
 pageUrl: DEFAULT_IMAGETEXT_UPLOAD_URL,
 timeoutMs: 60000,
 profileDir: DEFAULT_USER_DATA_DIR,
 dryRun: false,
 keepOpen: false
 };

 for (let index = 0; index < argv.length; index++) {
 const arg = argv[index];
 const nextIndex = consumeSharedCliArg(args, argv, index);
 if (nextIndex !== null) {
 index = nextIndex;
 continue;
 }

 switch (arg) {
 case "--help":
 args.help = true;
 break;
 case "--dry-run":
 args.dryRun = true;
 break;
 case "--keep-open":
 args.keepOpen = true;
 break;
 default:
 if (!arg.startsWith("-") && !args.inputFile) {
 args.inputFile = path.resolve(arg);
 break;
 }
 throw new Error(`Unknown argument: ${arg}`);
 }
 }

 return args;
}

function readImageTextInput(inputFile) {
 if (!fs.existsSync(inputFile)) {
 throw new Error(`File not found: ${inputFile}`);
 }

 const parsed = JSON.parse(fs.readFileSync(inputFile, "utf8"));
 return {
 description: parsed.description,
 imagePaths: parsed.imagePaths,
 tags: parsed.tags || [],
 inputBaseDir: path.dirname(inputFile)
 };
}

function resolveInputFilePaths(paths, baseDir) {
 return paths.map(p =>
 path.isAbsolute(p) ? p : path.resolve(baseDir, p)
 );
}

async function selectHotMusic(page) {
 console.log("🎵 开始选择最热门音乐 (最终版)...");

 // 1. 点击「选择音乐」 - user-provided final locator
 await page.getByText('选择音乐').nth(1).click();

 // 2. 等右侧面板出现（推荐=热门）- using the wait that we know worked
 await page.locator("text=推荐").first().waitFor({
 state: "visible",
 timeout: 15000
 });
 console.log("✅ 音乐面板已加载");
 await page.waitForTimeout(2000); // Wait for items to render

 // 3. 等待用户提供的“歌曲列表”大容器出现
 const musicListContainer = page.locator('.semi-tabs-pane-motion-overlay');
 await musicListContainer.waitFor({ state: "visible", timeout: 10000 });
 console.log("✅ 歌曲列表容器已加载");

 // 4. 从容器中，找到第一个包含“使用”按钮的div，这就是歌曲行
 const firstMusicItem = musicListContainer.locator('div:has-text("使用")').first();
 await firstMusicItem.waitFor({ state: "visible", timeout: 10000 });
 console.log("找到第一首歌的列表项，正在悬停...");
 await firstMusicItem.hover();
 await page.waitForTimeout(500); // Wait for hover effect

 // 5. 点击该行内的“使用”按钮
 const useButton = firstMusicItem.getByRole('button', { name: '使用' });
 await useButton.click();
 console.log("✅ 已选择最热门音乐 (使用按钮)");

 // 6. 等待选中生效
 await page.waitForTimeout(2000);
}

async function runPublishFlow(page, input, args) {
 console.log("打开页面...");
 await gotoPage(page, args.pageUrl, args.timeoutMs);

 const images = resolveInputFilePaths(
 input.imagePaths,
 input.inputBaseDir
 );

 console.log("上传图片...");
 const [fileChooser] = await Promise.all([
 page.waitForEvent("filechooser"),
 page.getByRole("button", { name: "上传图文" }).click()
 ]);

 await fileChooser.setFiles(images);

 await page.waitForURL(/post\/image/, { timeout: 60000 });
 await page.waitForTimeout(3000);

 console.log("填写描述...");
 const desc = `${input.description}\n\n${input.tags
 .map(t => `#${t}`)
 .join(" ")}`;

 await page.locator(".zone-container").first().click();
 await page.keyboard.type(desc, { delay: 30 });

 // ⭐ 自动选最热门音乐
 await selectHotMusic(page);

 if (args.dryRun) {
 console.log("Dry run结束");
 await promptForEnter("回车退出");
 return;
 }

 console.log("发布中...");
 const publishBtn = page.getByRole("button", { name: "发布", exact: true });
 
 console.log("等待'发布'按钮变为可用状态...");
 await publishBtn.waitFor({ state: 'visible', timeout: 15000 });
 console.log("✅ '发布'按钮已变为可见。");

 await publishBtn.click();

 const confirmPublishBtn = page.getByRole("button", { name: "确认发布" });
 
 console.log("等待'确认发布'按钮变为可用状态...");
 await confirmPublishBtn.waitFor({ state: 'visible', timeout: 15000 });
 console.log("✅ '确认发布'按钮已变为可见。");

 await confirmPublishBtn.click();

 console.log("等待发布成功...");
 await Promise.race([
 page.waitForURL(/manage/, { timeout: 20000 }),
 page.locator("text=发布成功").waitFor({ timeout: 20000 })
 ]);

 console.log("🎉 发布成功！");
}

async function main() {
 const args = parseArgs(process.argv.slice(2));
 if (args.help) return printHelp();

 const input = readImageTextInput(args.inputFile);

 const { context, page } = await launchPersistentPage({
    headless: args.headless,
    userDataDir: args.profileDir,
 });

 try {
 await runPublishFlow(page, input, args);
 } finally {
    if (!args.keepOpen) {
      await context.close();
    }
 }
}

main().catch(err => {
 console.error(err);
 process.exit(1);
});
