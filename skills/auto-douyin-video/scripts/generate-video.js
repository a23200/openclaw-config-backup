const fs = require('fs');
const path = require('path');

const prompt = process.argv[2] || "A beautiful sunset";

// 老板的专属 API Key (通过环境变量读取，或直接填写在下面)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const VEO3_API_KEY = (process.env.VEO3_API_KEY || "YOUR_API_KEY_HERE").trim();

async function generateVideo() {
    try {
        console.log(`[Video-Gen] 🚀 正在呼叫 Google Veo 3.1 接口生成视频...`);
        console.log(`[Video-Gen] 📝 提示词: ${prompt}`);

        // 1. 发起视频生成请求 (Long Running Operation)
        const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning`;
        const genRes = await fetch(generateUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-goog-api-key': VEO3_API_KEY
            },
            body: JSON.stringify({
                instances: [{ prompt: prompt }],
                parameters: { aspectRatio: "9:16" } // 强制竖屏，适配抖音
            })
        });

        if (!genRes.ok) {
            const errText = await genRes.text();
            throw new Error(`API 请求失败: ${genRes.status} ${errText}`);
        }

        const genData = await genRes.json();
        const operationName = genData.name;
        if (!operationName) throw new Error("未收到云端任务 ID (operation_name)");

        console.log(`[Video-Gen] ⏳ 云端任务已下发! 任务号: ${operationName}`);
        console.log(`[Video-Gen] 🔄 开始等待云端渲染 (Veo 渲染大约需要 1~3 分钟)...`);

        // 2. 轮询任务结果
        const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}`;
        let downloadUri = null;

        while (true) {
            await new Promise(r => setTimeout(r, 10000)); // 每 10 秒查询一次进度
            const pollRes = await fetch(pollUrl, {
                headers: { 'x-goog-api-key': VEO3_API_KEY }
            });
            const pollData = await pollRes.json();

            if (pollData.done) {
                if (pollData.error) {
                    throw new Error(`生成报错: ${JSON.stringify(pollData.error)}`);
                }
                downloadUri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
                if (!downloadUri) throw new Error("生成成功，但未找到视频文件链接！");
                break;
            } else {
                process.stdout.write(`.`); // 打印进度点
            }
        }

        console.log(`\n[Video-Gen] 🎉 渲染完成！开始将视频下载到本地...`);

        // 3. 下载生成的视频
        const finalDownloadUrl = downloadUri.includes('?') 
            ? `${downloadUri}&key=${VEO3_API_KEY}` 
            : `${downloadUri}?alt=media&key=${VEO3_API_KEY}`;

        const dlRes = await fetch(finalDownloadUrl);
        if (!dlRes.ok) throw new Error(`下载失败: 状态码 ${dlRes.status}`);

        const arrayBuffer = await dlRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const outputPath = path.resolve(__dirname, `../output_video_${Date.now()}.mp4`);
        fs.writeFileSync(outputPath, buffer);

        console.log(`[Video-Gen] ✅ 视频已成功保存！本地路径: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error(`\n[Video-Gen] ❌ 生成失败:`, error.message);
        process.exit(1);
    }
}

generateVideo();