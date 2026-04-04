const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

// replace the targetEditor.fill logic
content = content.replace(/await targetEditor\.fill\(description\);/g, `
            // 抖音的 .zone-container 是 contenteditable，fill 可能会失效。
            // 使用 insertText 防止触发回车键导致表单异常提交，同时保证 React 状态更新
            await page.keyboard.insertText(description);
`);

fs.writeFileSync(file, content);
console.log("Fixed!");
