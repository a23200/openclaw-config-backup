import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { chromium } from "playwright";

export const DEFAULT_COMMENT_PAGE_URL =
  "https://creator.douyin.com/creator-micro/interactive/comment";
export const DEFAULT_USER_DATA_DIR = path.resolve(".playwright/douyin-profile");

const DEFAULT_VIEWPORT = { width: 1440, height: 1200 };

export async function promptForEnter(message) {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    await terminal.question(`${message}\n`);
  } finally {
    terminal.close();
  }
}

export async function launchPersistentPage(options = {}) {
  const {
    userDataDir = DEFAULT_USER_DATA_DIR,
    headless = false,
    viewport = DEFAULT_VIEWPORT,
    alwaysNewPage = false,
    cdpUrl = "http://127.0.0.1:9222",
    preferAttach = true,
    requireAttach = false
  } = options;

  let context;
  let attached = false;
  let browser = null;

  if (preferAttach || requireAttach) {
    try {
      browser = await chromium.connectOverCDP(cdpUrl);
      context = browser.contexts()[0];
      attached = true;
      console.log(`✅ 已成功连接到本机浏览器调试口: ${cdpUrl}`);
    } catch (err) {
      if (requireAttach) {
        throw new Error(`要求 attach 本地浏览器，但连接失败: ${cdpUrl} :: ${err.message}`);
      }
      console.log("未检测到可连接的真实 Chrome，回退到独立配置模式...");
    }
  }

  if (!context) {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      channel: "chrome",
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      viewport
    });
  }

  const page = (attached || alwaysNewPage)
    ? await context.newPage()
    : context.pages()[0] ?? (await context.newPage());

  await page.bringToFront().catch(() => {});

  return { context, page, attached, browser };
}

export async function gotoPage(page, pageUrl, navigationTimeoutMs = 60000) {
  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeoutMs
  });
  await page.bringToFront().catch(() => {});
}
