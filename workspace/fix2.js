const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/await page\.keyboard\.insertText\(description\);/, `
            await page.keyboard.insertText(description);
            await page.waitForTimeout(2000); // Wait for React state to settle
            await page.mouse.click(10, 10); // Click away to close any hashtag popups
            await page.waitForTimeout(1000);
`);

fs.writeFileSync(file, content);
console.log("Fixed 2!");
