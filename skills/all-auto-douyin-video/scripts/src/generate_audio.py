# auto-douyin-video/scripts/src/generate_audio.py
import sys
from gtts import gTTS
import os

def text_to_speech(text, output_path):
    """
    Converts text to an MP3 audio file using gTTS.
    """
    try:
        print(f"Generating audio for text: '{text}'")
        # Language is set to Chinese (zh-cn) as a sensible default for Douyin
        tts = gTTS(text=text, lang='zh-cn', slow=False)
        tts.save(output_path)
        print(f"Successfully saved audio to {output_path}")
        return True
    except Exception as e:
        print(f"Error generating audio: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 generate_audio.py <text_to_speak> <output_mp3_path>", file=sys.stderr)
        sys.exit(1)

    text_input = sys.argv[1]
    output_file = sys.argv[2]

    # Ensure the output directory exists
    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    if not text_to_speech(text_input, output_file):
        sys.exit(1)
