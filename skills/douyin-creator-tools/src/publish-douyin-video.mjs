#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  gotoPage,
  promptForEnter,
  launchPersistentPage,
  DEFAULT_USER_DATA_DIR
} from "./douyin-browser.mjs";
import { createSharedCliArgs, consumeSharedCliArg } from "./cli-options.mjs";

const DEFAULT_VIDEO_UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/upload";

function printHelp() {
  console.log(`
Usage:
  node publish-douyin-video.mjs publish-video.json

Options:
  --dry-run
  --keep-open
  --profile <path>
  --timeout <ms>
  --headless
  --attach
  --require-attach
  --cdp-url <url>
  --help
`);
}

function parseArgs(argv) {
  const args = {
    ...createSharedCliArgs(),
    inputFile: "",
    pageUrl: DEFAULT_VIDEO_UPLOAD_URL,
    timeoutMs: 120000,
    profileDir: DEFAULT_USER_DATA_DIR,
    dryRun: false,
    keepOpen: false,
    help: false,
    attach: false,
    requireAttach: false,
    cdpUrl: "http://127.0.0.1:9222"
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
      case "--attach":
        args.attach = true;
        break;
      case "--require-attach":
        args.attach = true;
        args.requireAttach = true;
        break;
      case "--cdp-url":
        index += 1;
        if (index >= argv.length) {
          throw new Error("Missing value for --cdp-url");
        }
        args.cdpUrl = argv[index];
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

function readVideoPublishInput(inputFile) {
  if (!fs.existsSync(inputFile)) {
    throw new Error(`File not found: ${inputFile}`);
  }

  const parsed = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  return {
    videoPath: parsed.videoPath,
    title: parsed.title || "",
    description: parsed.description || "",
    tags: parsed.tags || [],
    coverPath: parsed.coverPath || "",
    inputBaseDir: path.dirname(inputFile)
  };
}

function resolveInputPath(filePath, baseDir) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(baseDir, filePath);
}

async function uploadVideo(page, input) {
  const videoPath = resolveInputPath(input.videoPath, input.inputBaseDir);

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  console.log("打开视频发布页...");
  await page.waitForTimeout(3000);

  console.log("正在上传视频...");
  try {
    // 最强方案：强制将所有隐藏的 input[type="file"] 显示出来并塞文件
    await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      inputs.forEach(input => {
        input.style.display = 'block';
        input.style.opacity = '1';
        input.style.visibility = 'visible';
        input.style.width = '100px';
        input.style.height = '100px';
      });
    });
    console.log("强制显示隐藏 input 完成，尝试塞文件...");
    
    // 直接操作第一个 input file，无视是否可见
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(videoPath, { timeout: 10000 });
    console.log("成功通过原生 input 注入文件！");
  } catch (err) {
    console.log("底层 input 注入还是失败，尝试通过监听拖拽事件...", err.message);
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 15000 }),
        page.locator('body').evaluate(body => {
           // 暴力模拟一个点击以打开选择器
           const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('上传'));
           if(btn) btn.click();
        })
      ]);
      await fileChooser.setFiles(videoPath);
    } catch (err2) {
      throw new Error(`彻底找不到上传入口，错误细节：${err2.message}`);
    }
  }

  console.log("等待视频上传与解析 (可能需要较长时间)...");
  await page.waitForTimeout(20000); 
  
  return { videoPath };
}

async function fillPublishForm(page, input) {
  const tagsText = input.tags.map(tag => `#${tag}`).join(" ");
  const finalDescription = [input.description, tagsText].filter(Boolean).join(" ");

  console.log("正在填写文案/描述...");
  try {
    const editor = page.locator('.zone-container').first();
    await editor.click();
    await page.keyboard.type(finalDescription, { delay: 50 });
  } catch (err) {
    console.log("常规富文本框定位失败，尝试备用定位...", err.message);
    try {
      await page.locator('[contenteditable="true"]').first().fill(finalDescription);
    } catch (e) {
      console.log("文案填写失败:", e.message);
    }
  }

  if (input.coverPath) {
    const coverPath = resolveInputPath(input.coverPath, input.inputBaseDir);
    if (fs.existsSync(coverPath)) {
      console.log("尝试设置自定义封面...");
      try {
        const [fileChooser] = await Promise.all([
          page.waitForEvent("filechooser"),
          page.getByText(/上传封面|选择封面|更换封面|编辑封面/).first().click()
        ]);
        await fileChooser.setFiles(coverPath);
        await page.waitForTimeout(3000);
        
        // 点击完成或确定
        const finishBtn = page.getByRole("button", { name: /完成|确定|确认/ }).last();
        if (await finishBtn.isVisible()) {
            await finishBtn.click({ force: true });
        }
      } catch (error) {
        console.log("封面设置跳过或报错:", error.message);
      }
    }
  }
}

async function submitPublish(page, args) {
  if (args.dryRun) {
    console.log("👉 Dry run (测试模式) 结束，未实际点击发布。");
    await promptForEnter("检查页面确认没问题后，按回车退出...");
    return;
  }

  console.log("准备点击发布 (滚动到页面底部)...");
  // 强制往下滚一下，确保底部的按钮渲染出来
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // 精确定位仅为“发布”二字的按钮
  const publishBtn = page.getByRole("button", { name: "发布", exact: true }).first();
  await publishBtn.scrollIntoViewIfNeeded();
  await publishBtn.waitFor({ state: "visible", timeout: 30000 });
  await publishBtn.click({ force: true });

  console.log("等待发布结果响应...");
  await page.waitForTimeout(8000);
  console.log("🎉 发布流程已提交完成！");
}

async function runPublishFlow(page, input, args) {
  await gotoPage(page, args.pageUrl, args.timeoutMs);
  await uploadVideo(page, input);
  await fillPublishForm(page, input);
  await submitPublish(page, args);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.inputFile) {
    throw new Error("Missing input JSON file.");
  }

  const input = readVideoPublishInput(args.inputFile);

  const { context, page, attached } = await launchPersistentPage({
    headless: args.headless,
    userDataDir: args.profileDir,
    viewport: { width: 1440, height: 900 },
    preferAttach: args.attach,
    requireAttach: args.requireAttach,
    cdpUrl: args.cdpUrl,
    alwaysNewPage: args.attach
  });

  if (attached) {
    console.log("ℹ️ 当前模式：attach 到本地已登录浏览器，并新开标签页执行发布");
  }

  try {
    await runPublishFlow(page, input, args);
  } finally {
    if (!args.keepOpen) {
      if (attached) {
        await page.close().catch(() => {});
      } else {
        await context.close();
      }
    }
  }
}

main().catch(error => {
  console.error("执行发生错误:", error);
  process.exit(1);
});
