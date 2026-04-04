const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/await page\.mouse\.click\(10, 10\); \/\/ Click away/g, `
            await page.keyboard.press('Escape'); // Press escape to close hashtag dropdown
            await page.waitForTimeout(1000);
            await page.keyboard.press('Escape');
`);

fs.writeFileSync(file, content);
console.log("Fixed 5!");
