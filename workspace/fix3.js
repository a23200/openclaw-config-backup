const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console.log\(`\[Douyin-Pub\] ⚠️ 发布按钮不可用。`\);/g, `
            console.log(\`[Douyin-Pub] ⚠️ 发布按钮不可用。截图保存为 error-publish.png\`);
            await page.screenshot({ path: '/tmp/video-build/error-publish.png', fullPage: true });
`);

fs.writeFileSync(file, content);
console.log("Fixed 3!");
