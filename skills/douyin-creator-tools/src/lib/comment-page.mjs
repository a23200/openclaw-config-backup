import { promptForEnter } from "../douyin-browser.mjs";
import { getEffectiveTimeout } from "./common.mjs";

export async function ensureCommentPageReady(page, pageUrl, options) {
  const navigationTimeoutMs = getEffectiveTimeout(options, options.navigationTimeoutMs);
  const uiTimeoutMs = getEffectiveTimeout(options, options.uiTimeoutMs);
  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: navigationTimeoutMs
  });

  const selectWorkButton = page
    .locator('button:has-text("选择作品"), [role="button"]:has-text("选择作品")')
    .first();

  try {
    await selectWorkButton.waitFor({ state: "visible", timeout: uiTimeoutMs });
    return;
  } catch (error) {
    console.log(
      "未检测到创作者评论页入口，请先运行 npm run auth，或在当前浏览器中完成登录。"
    );
  }

  await promptForEnter("完成登录并进入创作者中心评论页后，按 Enter 继续");
  const retryNavigationTimeoutMs = getEffectiveTimeout(options, options.navigationTimeoutMs);
  const retryUiTimeoutMs = getEffectiveTimeout(options, options.uiTimeoutMs);
  await page.goto(pageUrl, {
    waitUntil: "domcontentloaded",
    timeout: retryNavigationTimeoutMs
  });
  await selectWorkButton.waitFor({ state: "visible", timeout: retryUiTimeoutMs });
}
