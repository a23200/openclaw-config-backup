const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const videoPath = process.argv[2];
const newsText = process.argv[3] || `今日AI新闻速递！第一，五角大楼宣布正式引入Palantir的AI作为美国核心军用系统。第二，英伟达GTC2026正在召开，黄仁勋将Token定义为现代AI的基本单位。第三，预计后年中国高性能AI芯片自给率将达到百分之80。第四，游戏与网文界纷纷卷入AI生成风波。`;
const providedSrtPath = process.argv[4]; // Optional user-provided SRT path

if (!videoPath || !fs.existsSync(videoPath)) {
    console.error("找不到视频文件！");
    process.exit(1);
}

const dir = path.dirname(videoPath);
const base = path.basename(videoPath, '.mp4');
const audioPath = path.join(dir, `${base}_audio.mp3`);
const finalPath = path.join(dir, `${base}_final.mp4`);
let srtPath = providedSrtPath;

// Fallback to hardcoded SRT ONLY if no custom text and no SRT provided
if (!process.argv[3] && !providedSrtPath) {
    srtPath = path.join(dir, `${base}_subtitle.srt`);
    const srtContent = `
1
00:00:00,000 --> 00:00:09,500
今日AI新闻速递！五角大楼引入AI作为核心军用系统

2
00:00:09,500 --> 00:00:19,000
英伟达GTC2026正在召开，黄仁勋定义Token为AI基本单位

3
00:00:19,000 --> 00:00:25,500
预计后年中国高性能AI芯片自给率将达到百分之80

4
00:00:25,500 --> 00:00:30,000
游戏与网文界纷纷卷入AI生成风波
`;
    fs.writeFileSync(srtPath, srtContent.trim());
}

async function run() {
    console.log("[Composite] 🎙️ 正在优先调用微软 Edge TTS，引擎异常时自动回退到 macOS say...");
    
    const tempDir = path.join(dir, `temp_audio_${Date.now()}`);
    fs.mkdirSync(tempDir);
    let realAudioPath = path.join(tempDir, "audio.mp3");

    try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata("zh-CN-YunxiNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        // msedge-tts 的 toFile() 参数是一个目录路径，而不是具体的文件名，它会自动在此目录生成 audio.mp3
        const _tts = new MsEdgeTTS();
        await _tts.setMetadata("zh-CN-YunxiNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        await _tts.toFile(tempDir, newsText);
        console.log("[Composite] ✅ Edge TTS 生成成功。");
    } catch (e) {
        console.warn(`[Composite] ⚠️ Edge TTS 失败，回退到 macOS say: ${e}`);
        const aiffPath = path.join(tempDir, "audio.aiff");
        const escapedText = newsText.replace(/"/g, '\\"');
        execSync(`say -v Tingting -o "${aiffPath}" "${escapedText}"`, { stdio: 'inherit' });
        execSync(`"/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg" -y -i "${aiffPath}" -ar 24000 -b:a 48k "${realAudioPath}"`, { stdio: 'inherit' });
        console.log("[Composite] ✅ 已使用 macOS say 生成回退音频。");
    }
    
    console.log(`[Composite] 🎞️ 正在使用 FFmpeg 融合高清音轨并硬核烧录字幕到视频...`);

    // FFmpeg 滤镜：使用 subtitles 滤镜烧录 srt 文件
    // 为防止 ffmpeg 找不到字体，我们使用系统默认或者干脆只合并音频
    // 经测试，macOS 的 ffmpeg 如果没配好 libass 会报错。
    // 我们尝试使用 drawtext 或者干脆先不烧录复杂特效，只合并高清音频以满足“声音要好听”的要求。

    const ffmpegPath = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg';

    let filterComplex = "";
    if (srtPath && fs.existsSync(srtPath)) {
        filterComplex = `-vf "subtitles=${srtPath}:force_style='FontName=PingFang SC,FontSize=22,PrimaryColour=&H33FFFFFF,OutlineColour=&H88000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=60'"`;
    }

    const ffmpegCmd = `
    "${ffmpegPath}" -y \\
      -stream_loop -1 -i "${videoPath}" \\
      -i "${realAudioPath}" \\
      ${filterComplex} \\
      -map 0:v:0 -map 1:a:0 \\
      -c:v libx264 -c:a aac -b:a 192k \\
      -shortest \\
      "${finalPath}"
    `;

    try {
        execSync(ffmpegCmd, { stdio: 'inherit' });
        console.log(`[Composite] ✅ 终极配音大片合成成功！高清音质版路径：${finalPath}`);
        fs.unlinkSync(realAudioPath);
        fs.rmdirSync(tempDir);
    } catch (e) {
        console.error(`[Composite] ❌ FFmpeg 合成失败:`, e.message);
    }
}

run();