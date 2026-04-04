
import os
import sys
import re
import argparse
import subprocess
import tempfile
import shutil
import time
from datetime import datetime
from openai import OpenAI
import google.genai as genai
from google.genai import types


def load_env_file(env_path):
    """Load simple KEY=VALUE pairs from a local .env file."""
    if not os.path.exists(env_path):
        return
    with open(env_path, 'r', encoding='utf-8') as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and value and key not in os.environ:
                os.environ[key] = value


def parse_script_file(file_path):
    """Parses the input script file and extracts the different sections."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    config = {
        "scene": "",
        "shots": [],
        "narration": "",
        "bgm_path": ""
    }

    try:
        scene_match = re.search(r"固定场景/角色：(.*?)\n镜头描述：", content, re.DOTALL)
        if scene_match:
            config["scene"] = scene_match.group(1).strip()

        shots_match = re.search(r"镜头描述：(.*?)\n旁白文案：", content, re.DOTALL)
        if shots_match:
            shots_text = shots_match.group(1).strip()
            config["shots"] = [line.strip() for line in shots_text.split('\n') if line.strip()]

        narration_match = re.search(r"旁白文案：(.*?)\n背景音乐：", content, re.DOTALL)
        if narration_match:
            config["narration"] = narration_match.group(1).strip()

        bgm_match = re.search(r"背景音乐：(.*?)$", content, re.DOTALL)
        if bgm_match:
            config["bgm_path"] = bgm_match.group(1).strip()
            
        if not all([config["scene"], config["shots"], config["narration"], config["bgm_path"]]):
            raise ValueError("Script file is missing one or more required sections.")
            
    except Exception as e:
        print(f"Error parsing script file: {e}")
        sys.exit(1)

    return config

def generate_images(openai_client, scene, shots, temp_dir):
    """Generates images using DALL-E 3."""
    print("--- Step 1: Generating images with DALL-E 3 ---")
    image_paths = []
    for i, shot in enumerate(shots):
        prompt = f"{scene}, {shot}"
        print(f"Generating image {i+1}/{len(shots)} for prompt: '{prompt}'")
        try:
            response = openai_client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size="1024x1792",
                quality="standard",
                n=1
            )
            image_url = response.data[0].url
            image_path = os.path.join(temp_dir, f"image_{i+1}.png")
            
            # Download the image
            import requests
            img_data = requests.get(image_url).content
            with open(image_path, 'wb') as handler:
                handler.write(img_data)
                
            image_paths.append(image_path)
            print(f"Successfully saved image to {image_path}")
        except Exception as e:
            print(f"Error generating image {i+1}: {e}")
            sys.exit(1)
    print("--- Image generation complete. ---")
    return image_paths

def split_subtitle_lines(text):
    """Split narration into short subtitle lines."""
    parts = re.split(r'[，,。！？!?.；;：:\n]+', text)
    return [p.strip() for p in parts if p.strip()]


def escape_ass_text(text):
    """Escape text for ASS subtitle format."""
    return text.replace('\\', r'\\').replace('{', r'\{').replace('}', r'\}')


def format_ass_time(seconds):
    """Convert seconds to ASS timestamp format H:MM:SS.CC"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int(round((seconds - int(seconds)) * 100))
    if centis == 100:
        secs += 1
        centis = 0
    if secs == 60:
        minutes += 1
        secs = 0
    if minutes == 60:
        hours += 1
        minutes = 0
    return f"{hours}:{minutes:02d}:{secs:02d}.{centis:02d}"


def get_media_duration(path):
    """Get media duration in seconds via ffprobe."""
    result = subprocess.run(
        [
            'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1', path
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    return float(result.stdout.strip())


def write_ass_subtitles(narration, total_duration, output_path):
    """Create a simple ASS subtitle file by evenly distributing narration lines."""
    lines = split_subtitle_lines(narration)
    if not lines:
        return False

    min_per_line = 1.8
    effective_duration = max(total_duration, min_per_line * len(lines))
    segment = effective_duration / len(lines)

    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,PingFang SC,72,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,2,80,80,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(header)
        for i, line in enumerate(lines):
            start = i * segment
            end = min((i + 1) * segment, total_duration)
            if end <= start:
                end = start + min_per_line
            f.write(
                f"Dialogue: 0,{format_ass_time(start)},{format_ass_time(end)},Default,,0,0,0,,{escape_ass_text(line)}\n"
            )
    return True


def generate_video_segments(genai_client, shots, image_paths, temp_dir):
    """Generates video segments using Google Veo with retry/backoff and resume-safe saved segments."""
    print("\n--- Step 2: Generating video segments with Google Veo ---")
    video_paths = []
    max_retries = 3
    retry_wait_seconds = 60

    for i, (shot, image_path) in enumerate(zip(shots, image_paths)):
        video_path = os.path.join(temp_dir, f"segment_{i+1}.mp4")

        if os.path.exists(video_path) and os.path.getsize(video_path) > 0:
            print(f"Skipping video segment {i+1}/{len(shots)} because it already exists: {video_path}")
            video_paths.append(video_path)
            continue

        for attempt in range(1, max_retries + 1):
            print(f"Generating video segment {i+1}/{len(shots)} for shot: '{shot}' (attempt {attempt}/{max_retries})")
            try:
                with open(image_path, "rb") as f:
                    image_bytes = f.read()

                img_obj = types.Image(imageBytes=image_bytes, mimeType="image/png")
                source_obj = types.GenerateVideosSource(prompt=shot, image=img_obj)
                config_obj = types.GenerateVideosConfig(aspect_ratio="9:16")

                video_generation_op = genai_client.models.generate_videos(
                    model='veo-2.0-generate-001',
                    source=source_obj,
                    config=config_obj
                )

                print(f"  > Polling operation status for video {i+1}...")
                while not video_generation_op.done:
                    time.sleep(10)
                    video_generation_op = genai_client.operations.get(operation=video_generation_op)

                if video_generation_op.error:
                    raise Exception(f"Video generation failed: {video_generation_op.error}")

                video_obj = video_generation_op.result.generated_videos[0].video

                print(f"DEBUG: videoBytes type: {type(video_obj.video_bytes)}, length: {len(video_obj.video_bytes) if video_obj.video_bytes else 'N/A'}")
                print(f"DEBUG: uri: {video_obj.uri}")
                if video_obj.video_bytes:
                    with open(video_path, 'wb') as f:
                        f.write(video_obj.video_bytes)
                elif video_obj.uri:
                    import requests
                    headers = {"x-goog-api-key": os.environ.get("GOOGLE_API_KEY")}
                    response = requests.get(video_obj.uri, headers=headers)
                    if response.status_code == 200:
                        with open(video_path, 'wb') as f:
                            f.write(response.content)
                    else:
                        raise Exception(f"Failed to download video: {response.status_code} - {response.text}")
                else:
                    raise Exception("No video bytes or URI returned in the response.")

                video_paths.append(video_path)
                print(f"  > Successfully downloaded video segment to {video_path}")
                break

            except Exception as e:
                error_text = str(e)
                print(f"Error generating video segment {i+1} on attempt {attempt}: {error_text}")
                is_quota_error = "429" in error_text or "RESOURCE_EXHAUSTED" in error_text
                if attempt < max_retries and is_quota_error:
                    print(f"  > Quota/rate issue detected. Waiting {retry_wait_seconds} seconds before retrying segment {i+1}...")
                    time.sleep(retry_wait_seconds)
                    continue
                sys.exit(1)

    print("--- Video segment generation complete. ---")
    return video_paths
    
def run_ffmpeg_command(command, error_message, cwd=None):
    """Helper function to run an ffmpeg command."""
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd)
    except subprocess.CalledProcessError as e:
        print(f"{error_message}:\n{e.stderr.decode('utf-8')}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Generate a Douyin video from a script file using OpenAI and Google Veo.")
    parser.add_argument("script_file", help="Path to the script file.")
    args = parser.parse_args()

    # 0. Load local env file first
    load_env_file("/Users/mac/.openclaw/workspace/.env.local")

    # 1. Check for API Keys
    openai_api_key = os.getenv("OPENAI_API_KEY")
    google_api_key = os.getenv("GOOGLE_API_KEY")

    if not openai_api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        sys.exit(1)
    if not google_api_key:
        print("Error: GOOGLE_API_KEY environment variable not set.")
        sys.exit(1)
        
    # Initialize clients
    openai_client = OpenAI(api_key=openai_api_key)
    genai_client = genai.Client(api_key=google_api_key)


    # 2. Read script file
    config = parse_script_file(args.script_file)

    # Create a temporary directory for intermediate files
    temp_dir = tempfile.mkdtemp()
    print(f"Created temporary directory: {temp_dir}")

    try:
        # 3. Step 1: Text-to-Image
        image_paths = generate_images(openai_client, config["scene"], config["shots"], temp_dir)

        # 4. Step 2: Image-to-Video
        video_segment_paths = generate_video_segments(genai_client, config["shots"], image_paths, temp_dir)
        
        # 5. Step 3: Combine Video
        print("\n--- Step 3: Combining video segments ---")
        silent_video_path = os.path.join(temp_dir, "silent_video.mp4")
        file_list_path = os.path.join(temp_dir, "filelist.txt")
        with open(file_list_path, 'w') as f:
            for path in video_segment_paths:
                f.write(f"file '{os.path.basename(path)}'\n")
        
        concat_command = [
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', file_list_path,
            '-c', 'copy', silent_video_path
        ]
        run_ffmpeg_command(concat_command, "Error combining video segments")
        print("--- Video segments combined successfully. ---")

        # 6. Step 4: Audio Generation
        print("\n--- Step 4: Generating voiceover audio ---")
        voiceover_path = os.path.join(temp_dir, "voiceover.mp3")
        try:
            response = openai_client.audio.speech.create(
                model="tts-1-hd",
                voice="nova",
                input=config["narration"]
            )
            response.stream_to_file(voiceover_path)
            print(f"Voiceover saved to {voiceover_path}")
        except Exception as e:
            print(f"Error generating voiceover: {e}")
            sys.exit(1)
        print("--- Voiceover generation complete. ---")


        # 7. Step 5: Audio Mix
        print("\n--- Step 5: Mixing voiceover and background music ---")
        final_audio_path = os.path.join(temp_dir, "final_audio.mp3")
        mix_command = [
            'ffmpeg', '-y', '-i', voiceover_path, '-i', config["bgm_path"],
            '-filter_complex', '[1:a]volume=0.3[bg];[0:a][bg]amix=inputs=2:duration=longest',
            final_audio_path
        ]
        run_ffmpeg_command(mix_command, "Error mixing audio")
        print("--- Audio mixing complete. ---")


        # 8. Step 6: Final Assembly with burned-in subtitles
        print("\n--- Step 6: Assembling final video with subtitles ---")
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        final_video_path = os.path.join(os.getcwd(), f"douyin_video_{timestamp}.mp4")
        
        # Call Whisper to generate synced subtitles
        print("Running Whisper to generate synced subtitles...")
        import platform
        env = os.environ.copy()
        if platform.system() == "Darwin":
            env["KMP_DUPLICATE_LIB_OK"] = "TRUE"
        
        whisper_cmd = [
            "whisper", final_audio_path,
            "--model", "base",
            "--language", "zh",
            "--output_dir", temp_dir,
            "--output_format", "srt"
        ]
        
        try:
            subprocess.run(whisper_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            has_subtitles = True
            # Whisper outputs to <original_filename>.srt in the output_dir
            audio_basename = os.path.splitext(os.path.basename(final_audio_path))[0]
            subtitle_path = os.path.join(temp_dir, f"{audio_basename}.srt")
        except subprocess.CalledProcessError as e:
            print(f"Whisper failed, falling back to basic subtitles:\n{e.stderr.decode('utf-8')}")
            subtitle_path = os.path.join(temp_dir, "subtitles.ass")
            total_duration = get_media_duration(final_audio_path)
            has_subtitles = write_ass_subtitles(config["narration"], total_duration, subtitle_path)

        ffmpeg_bin = '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg'
        rel_subtitle_path = os.path.basename(subtitle_path)

        if has_subtitles:
            subtitle_filter = f"subtitles=filename={rel_subtitle_path}"
            assembly_command = [
                ffmpeg_bin, '-y', '-i', silent_video_path, '-i', final_audio_path,
                '-vf', subtitle_filter,
                '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
                '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0',
                '-shortest', final_video_path
            ]
        else:
            assembly_command = [
                ffmpeg_bin, '-y', '-i', silent_video_path, '-i', final_audio_path,
                '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0',
                '-shortest', final_video_path
            ]

        run_ffmpeg_command(assembly_command, "Error during final assembly", cwd=temp_dir)
        print("--- Final assembly complete. ---")
        
        print(f"\\n\\n🚀🚀🚀 Video generation successful! 🚀🚀🚀")
        print(f"Final video saved to: {final_video_path}")

    finally:
        # 9. Cleanup
        print(f"\\n--- Cleaning up temporary directory: {temp_dir} ---")
        shutil.rmtree(temp_dir)
        print("--- Cleanup complete. ---")


if __name__ == "__main__":
    main()
