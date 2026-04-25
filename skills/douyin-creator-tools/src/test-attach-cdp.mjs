#!/usr/bin/env node
import { chromium } from 'playwright';

const cdpUrl = process.argv[2] || 'http://127.0.0.1:9222';
const targetUrl = process.argv[3] || 'https://creator.douyin.com/creator-micro/content/upload';

const browser = await chromium.connectOverCDP(cdpUrl);
const contexts = browser.contexts();
if (!contexts.length) {
  throw new Error('No browser contexts available after CDP attach');
}
const context = contexts[0];
const page = await context.newPage();
await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.bringToFront().catch(() => {});
console.log(JSON.stringify({ ok: true, cdpUrl, url: page.url(), title: await page.title() }, null, 2));
