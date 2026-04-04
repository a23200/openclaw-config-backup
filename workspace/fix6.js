const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/await page\.keyboard\.press\('Escape'\);\s*\/\/ Press escape to close hashtag dropdown\s*await page\.waitForTimeout\(1000\);\s*await page\.keyboard\.press\('Escape'\);\s*to close any hashtag popups\s*await page\.waitForTimeout\(1000\);/g, `
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);
`);

fs.writeFileSync(file, content);
console.log("Fixed 6!");
