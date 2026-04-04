# FINAL SCRIPT - Re-engineered with Google Veo for Video Generation (Corrected)

import re
import os
import subprocess
import requests
import openai
import time
from google import genai
from google.genai import types
from dotenv import load_dotenv

# --- Load API Keys from .env file ---
dotenv_path = '/Users/mac/.openclaw/workspace/all-auto-douyin-video/googlek.env'
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
    print(f"Loaded API keys from {dotenv_path}")
else:
    print(f"⚠️ Warning: .env file not found at {dotenv_path}. Relying on system environment variables.")

# --- API Keys ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    print("⚠️ Warning: OpenAI API Key is not set. TTS will run in simulation mode.")
    OPENAI_API_KEY = "SIMULATE"
else:
    openai.api_key = OPENAI_API_KEY

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    # This is now handled by genai.Client() which automatically uses the env var
    pass
else:
    print("⚠️ Warning: Google API Key is not set. Video generation will fail.")

def parse_input_text(text_block):
    config = { "base_prompt": "", "variations": [], "narration": "", "bgm_path": "" }
    patterns = {
        "base_prompt": r"固定场景/角色：\s*(.*?)\s*镜头描述：",
        "variations": r"镜头描述：\s*(.*?)\s*旁白文案：",
        "narration": r"旁白文案：\s*(.*?)\s*背景音乐：",
        "bgm_path": r"背景音乐：\s*(.*)"
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text_block, re.DOTALL)
        if match:
            if key == "variations":
                variations_text = match.group(1).strip()
                config[key] = [line.strip().split(" ", 1)[1] for line in variations_text.split('\n') if line.strip()]
            else:
                config[key] = match.group(1).strip()
    if not all(config.values()):
        raise ValueError("Input text block is missing one or more required sections.")
    return config

def create_video_segments(config, work_dir):
    print("--- Starting Step 1 & 2: AI Video Segment Generation (using Google Veo) ---")
    if not GOOGLE_API_KEY:
        raise ValueError("GOOGLE_API_KEY not found in environment or .env file. Cannot generate AI video.")
    
    try:
        client = genai.Client()
    except Exception as e:
        print(f"Failed to initialize Google AI Client. Check API Key and permissions. Error: {e}")
        raise

    segment_paths = []
    if not os.path.exists(work_dir): os.makedirs(work_dir)
    
    for i, variation in enumerate(config["variations"]):
        full_prompt = f"{config['base_prompt']}, {variation}"
        segment_path = os.path.join(work_dir, f"segment_{i+1}.mp4")
        print(f"Generating video segment {i+1}/{len(config['variations'])}...")

        try:
            operation = client.models.generate_videos(
                model="models/veo-3.0-generate-001",
                prompt=full_prompt,
                config=types.GenerateVideosConfig(
                    aspect_ratio="9:16",
                ),
            )

            print(f"Waiting for operation to complete for segment {i+1}...")
            while not operation.done:
                time.sleep(20)
                operation = client.operations.get(operation)
            
            # --- ROBUSTNESS CHECK ---
            # Check if the API returned a result and if that result contains any videos.
            # This handles cases where the model refuses to generate content due to safety policies.
            if not operation.result or not operation.result.generated_videos:
                raise ValueError("API returned no video data. The prompt may have been blocked by the content safety filter.")
            
            generated_video = operation.result.generated_videos[0]
            
            # --- FINAL ROBUSTNESS CHECK ---
            # Also check that the video object and its byte data actually exist.
            if not generated_video.video or not generated_video.video.video_bytes:
                raise ValueError("API returned a video structure but it contains no video data. The prompt for this segment may have been blocked or failed.")

            video_data = generated_video.video.video_bytes
            with open(segment_path, "wb") as f:
                f.write(video_data)
            
            print(f"Successfully generated video segment to {segment_path}")
            segment_paths.append(segment_path)
        except Exception as e:
            print(f"An error occurred during video generation for segment {i+1}: {e}")
            raise 
            
    print("--- AI video segment generation complete ---")
    return segment_paths

def concatenate_videos(segment_paths, work_dir):
    print("--- Starting Step 3: Video Concatenation ---")
    silent_video_path = os.path.join(work_dir, "silent_video.mp4")
    file_list_path = os.path.join(work_dir, "file_list.txt")
    with open(file_list_path, 'w') as f:
        for path in segment_paths: f.write(f"file '{os.path.basename(path)}'\n")
    command = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', file_list_path, '-c', 'copy', silent_video_path]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return silent_video_path
    except subprocess.CalledProcessError as e:
        print(f"Error during video concatenation:\n{e.stderr}")
        raise

def generate_and_mix_audio(config, work_dir):
    print("--- Starting Step 4: Audio Generation and Mixing (using OpenAI TTS) ---")
    voiceover_path = os.path.join(work_dir, "voiceover.mp3")
    final_audio_path = os.path.join(work_dir, "final_audio.mp3")

    print("Generating narration using OpenAI TTS...")
    try:
        if OPENAI_API_KEY == "SIMULATE":
            command = ['ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '20', voiceover_path]
            subprocess.run(command, check=True, capture_output=True, text=True)
            print(f"SIMULATED: Created silent placeholder voiceover at {voiceover_path}")
        else:
            response = openai.audio.speech.create(model="tts-1", voice="nova", input=config["narration"])
            response.stream_to_file(voiceover_path)
    except Exception as e:
        print(f"Error generating narration: {e}")
        raise

    if not os.path.exists(config['bgm_path']):
        raise FileNotFoundError(f"BGM file not found at {config['bgm_path']}")
    command = ['ffmpeg', '-y', '-i', voiceover_path, '-i', config['bgm_path'], '-filter_complex', "[1:a]volume=0.3[bg];[0:a][bg]amix=inputs=2:duration=first", final_audio_path]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return final_audio_path
    except subprocess.CalledProcessError as e:
        print(f"Error during audio mixing:\n{e.stderr}")
        raise

def final_assembly(silent_video_path, final_audio_path, work_dir):
    print("--- Starting Step 5: Final Assembly ---")
    final_video_path = os.path.join(os.getcwd(), f"douyin_video_{os.path.basename(work_dir)}.mp4")
    command = ['ffmpeg', '-y', '-i', silent_video_path, '-i', final_audio_path, '-c:v', 'copy', '-c:a', 'aac', '-map', '0:v:0', '-map', '1:a:0', '-shortest', final_video_path]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return final_video_path
    except subprocess.CalledProcessError as e:
        print(f"Error during final assembly:\n{e.stderr}")
        raise

def main():
    import sys
    user_input = sys.stdin.read()
    
    work_dir = f"temp_video_project_{os.urandom(4).hex()}"
    try:
        config = parse_input_text(user_input)
        segment_paths = create_video_segments(config, work_dir)
        silent_video_path = concatenate_videos(segment_paths, work_dir)
        final_audio_path = generate_and_mix_audio(config, work_dir)
        final_video_path = final_assembly(silent_video_path, final_audio_path, work_dir)
        print(f"\n\n🚀🚀🚀 All Done! Your video is ready at: {final_video_path} 🚀🚀🚀")
    except Exception as e:
        print(f"A critical error occurred: {e}")
    finally:
        pass

if __name__ == "__main__":
    main()
