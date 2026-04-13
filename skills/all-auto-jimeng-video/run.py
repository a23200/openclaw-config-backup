import os
import sys
import json
import time
import subprocess
import re
from pathlib import Path
import urllib.request

try:
    from dotenv import load_dotenv
    load_dotenv("/Users/mac/.openclaw/workspace/.env")
    load_dotenv("/Users/mac/.openclaw/workspace/mcp_servers/laodi-mcp-server/.env")
except ImportError:
    pass

try:
    from openai import OpenAI
except ImportError:
    print("Please install openai: pip install openai")
    sys.exit(1)

def get_hot_topic():
    # Simplified hot topic fetch (using DuckDuckGo or a known API)
    # For now, just return a default hot topic or you can pass one as argument
    return "努力工作不如享受生活"

def generate_script(topic):
    client = OpenAI()
    sys_prompt = """你是一个顶级的国际电影大片导演和视觉特效大师。请根据用户提供的话题，生成一个包含1个超长分镜头的剧本。
返回格式必须严格如下，且每个提示词必须极其详尽，包含丰富的画面细节、光影、材质、环境氛围以及摄影机运镜技巧：

固定场景：
[详细的背景设定，例如：一个被赛博朋克霓虹灯笼罩的废墟城市，雨水冲刷着断壁残垣，远处巨大的全息广告牌在浓烟中若隐若现，空气中弥漫着压抑的金属生锈气味与战火的硝烟。]

镜头1：
首帧提示词：[极其详细的首帧画面描述。必须包括：主体外貌细节表情、衣着材质、具体动作姿态、周围细微环境、光影方向（如丁达尔效应、逆光）、景别（如特写、中景）及画质词（电影级光影，8K，虚幻引擎5渲染，极致细节）。]
尾帧提示词：[极其详细的尾帧画面描述。主体人物特征必须与首帧完全一致，仅动作和背景角度改变。包括：主体的新动作姿态、表情变化、环境的互动变化、光影的流转、景别及画质词。]
过渡提示词：[极其详细的运镜和动作过渡描述。例如：镜头从低角度缓慢向上推移（Push in）并伴随轻微环绕，主角缓慢站起，眼神从迷茫转为极其锐利，雨水顺着脸颊滑落，背景的爆炸火光瞬间照亮整个屏幕，动作平滑且充满史诗感。]

旁白文案：
[不超过30个字的充满哲理与史诗感的文案，连贯对应画面]

背景音乐：
/Users/mac/Downloads/penguinmusic-space-chillout-14194.mp3
"""
    print(f"[{topic}] 生成剧本中...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": f"话题：{topic}"}
        ]
    )
    content = response.choices[0].message.content
    print(f"生成的剧本：\n{content}\n")
    return content

def parse_generated_script(content):
    scene_match = re.search(r'固定场景：\s*\n(.*?)(?=\n\n镜头)', content, re.DOTALL)
    narration_match = re.search(r'旁白文案：\s*\n(.*?)(?=\n\n背景音乐)', content, re.DOTALL)
    bgm_match = re.search(r'背景音乐：\s*\n(.*)', content, re.DOTALL)

    scene = scene_match.group(1).strip().strip('[]') if scene_match else ""
    narration = narration_match.group(1).strip().strip('[]') if narration_match else ""
    bgm = bgm_match.group(1).strip().strip('[]') if bgm_match else ""

    shots = []
    # Extract each shot's first, last, and video prompts (Testing: 1 shot only)
    for i in range(1, 2):
        shot_block = re.search(rf'镜头{i}：\s*\n(.*?)(?=\n\n镜头|\n\n旁白文案)', content, re.DOTALL)
        if shot_block:
            s_text = shot_block.group(1)
            first_match = re.search(r'首帧提示词：(.*)', s_text)
            last_match = re.search(r'尾帧提示词：(.*)', s_text)
            trans_match = re.search(r'过渡提示词：(.*)', s_text)
            if first_match and last_match and trans_match:
                first = first_match.group(1).strip().strip('[]')
                last = last_match.group(1).strip().strip('[]')
                trans = trans_match.group(1).strip().strip('[]')
                shots.append({
                    "first": f"{scene}。{first}。电影级高画质，细节丰富。",
                    "last": f"{scene}。{last}。电影级高画质，细节丰富。",
                    "trans": trans
                })
    return scene, shots, narration, bgm

def generate_jimeng_image(prompt, output_path):
    print(f"[Jimeng] Generating image (5.0): {prompt[:30]}...")
    cmd = [
        "dreamina", "text2image",
        f"--prompt={prompt}",
        "--ratio=9:16",
        "--resolution_type=2k",
        "--model_version=5.0",
        "--poll=300"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        json_str = result.stdout[result.stdout.find('{'):]
        data = json.loads(json_str)
        
        image_url = data.get("result", {}).get("image_url") or data.get("image_url")
        if not image_url:
            urls = re.findall(r'https?://[^\s"\'}]+', json_str)
            for u in urls:
                if any(ext in u for ext in ['.png', '.jpg', '.jpeg', '.webp']):
                    image_url = u
                    break
        
        if image_url:
            urllib.request.urlretrieve(image_url, output_path)
            return True
        return False
    except Exception as e:
        print(f"[Jimeng] Error generating image: {e}")
        return False

def generate_jimeng_image2image(image_path, prompt, output_path):
    print(f"[Jimeng] Generating image2image (5.0): {prompt[:30]}...")
    cmd = [
        "dreamina", "image2image",
        f"--images={image_path}",
        f"--prompt={prompt}",
        "--ratio=9:16",
        "--resolution_type=2k",
        "--model_version=5.0",
        "--poll=300"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        json_str = result.stdout[result.stdout.find('{'):]
        data = json.loads(json_str)
        
        image_url = data.get("result", {}).get("image_url") or data.get("image_url")
        if not image_url:
            urls = re.findall(r'https?://[^\s"\'}]+', json_str)
            for u in urls:
                if any(ext in u for ext in ['.png', '.jpg', '.jpeg', '.webp']):
                    image_url = u
                    break
        
        if image_url:
            urllib.request.urlretrieve(image_url, output_path)
            return True
        return False
    except Exception as e:
        print(f"[Jimeng] Error generating image2image: {e}")
        return False

def generate_jimeng_frames2video(first_img, last_img, prompt, output_path):
    print(f"[Jimeng] Generating frames2video: {prompt[:30]}...")
    cmd = [
        "dreamina", "frames2video",
        f"--first={first_img}",
        f"--last={last_img}",
        f"--prompt={prompt}",
        "--duration=15",
        "--model_version=seedance2.0fast",
        "--poll=600"
    ]
    for attempt in range(3):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            json_str = result.stdout[result.stdout.find('{'):]
            data = json.loads(json_str)
            
            video_url = data.get("result", {}).get("video_url") or data.get("video_url")
            if not video_url:
                urls = re.findall(r'https?://[^\s"\'}]+', json_str)
                for u in urls:
                    if '.mp4' in u:
                        video_url = u
                        break
            
            if video_url:
                urllib.request.urlretrieve(video_url, output_path)
                return True
            else:
                print(f"[Jimeng] Error: Could not find video URL in output: {json_str}")
                return False
        except subprocess.CalledProcessError as e:
            print(f"[Jimeng] Error generating video (attempt {attempt+1}): {e.stderr}")
            time.sleep(10)
        except Exception as e:
            print(f"[Jimeng] Parsing error (attempt {attempt+1}): {e}")
            time.sleep(10)
    return False

def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else get_hot_topic()
    
    script_content = generate_script(topic)
    scene, shots, narration, bgm = parse_generated_script(script_content)
    
    # Override bgm if provided as second argument
    if len(sys.argv) > 2:
        bgm = sys.argv[2]
    
    if not shots:
        print("Failed to parse script.")
        sys.exit(1)
        
    timestamp = int(time.time())
    work_dir = Path.cwd()
    video_files = []
    
    print("\n--- 1. Generating Assets with Jimeng ---")
    for i, shot in enumerate(shots):
        first_img = work_dir / f"first_{timestamp}_{i}.jpg"
        last_img = work_dir / f"last_{timestamp}_{i}.jpg"
        out_clip = work_dir / f"clip_{timestamp}_{i}.mp4"
        
        print(f"\n[Shot {i+1}] 1A: First Frame text2image")
        if not generate_jimeng_image(shot["first"], str(first_img)):
            sys.exit(1)
            
        print(f"[Shot {i+1}] 1B: Last Frame image2image (Ensuring character consistency)")
        if not generate_jimeng_image2image(str(first_img), shot["last"], str(last_img)):
            sys.exit(1)
            
        print(f"[Shot {i+1}] 1C: frames2video")
        if not generate_jimeng_frames2video(str(first_img), str(last_img), shot["trans"], str(out_clip)):
            sys.exit(1)
            
        video_files.append(out_clip)

    print("\n--- 2. Concatenating Videos ---")
    concat_list = work_dir / f"concat_list_{timestamp}.txt"
    with open(concat_list, "w") as f:
        for vf in video_files:
            f.write(f"file '{vf}'\n")
    
    concat_video = work_dir / f"concat_{timestamp}.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(concat_video)], check=True)
    
    print("\n--- 3. Generating Voiceover ---")
    client = OpenAI()
    tts_audio = work_dir / f"tts_{timestamp}.mp3"
    client.audio.speech.create(model="tts-1-hd", voice="nova", input=narration).stream_to_file(tts_audio)
    
    print("\n--- 4. Mixing Final Audio & Video ---")
    mixed_video = work_dir / f"mixed_{timestamp}.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(concat_video), "-i", str(tts_audio), "-i", bgm, "-filter_complex", "[1:a]volume=1.5[a1];[2:a]volume=0.3[a2];[a1][a2]amix=inputs=2:duration=longest[aout]", "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-shortest", str(mixed_video)], check=True)
    
    print("\n--- 5. Generating Subtitles ---")
    srt_file = work_dir / f"subs_{timestamp}.srt"
    os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
    subprocess.run(["whisper", str(tts_audio), "--model", "base", "--language", "zh", "--output_format", "srt", "--output_dir", str(work_dir)], check=True)
    generated_srt = work_dir / f"tts_{timestamp}.srt"
    if generated_srt.exists():
        generated_srt.rename(srt_file)
        
    print("\n--- 6. Burning Subtitles ---")
    final_video = work_dir / f"final_jimeng_video_{timestamp}.mp4"
    style = "FontName=PingFang SC,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=35,Alignment=2"
    subprocess.run(["ffmpeg", "-y", "-i", str(mixed_video), "-vf", f"subtitles={srt_file.name}:force_style='{style}'", "-c:a", "copy", str(final_video)], check=True)
    
    print(f"\n🚀🚀🚀 Pipeline Complete! Final video: {final_video}")

if __name__ == "__main__":
    main()