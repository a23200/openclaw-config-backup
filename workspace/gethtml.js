const fs = require('fs');
const file = '/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/await page\.screenshot\(\{ path: '\/tmp\/video-build\/error-publish\.png', fullPage: true \}\);/g, `
            await page.screenshot({ path: '/tmp/video-build/error-publish.png', fullPage: true });
            const html = await page.content();
            fs.writeFileSync('/tmp/video-build/error.html', html);
`);

fs.writeFileSync(file, content);
console.log("Fixed 4!");
