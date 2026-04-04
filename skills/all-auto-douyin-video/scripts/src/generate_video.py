# auto-douyin-video/scripts/src/generate_video.py
import sys
import os
import torch
from diffusers import StableVideoDiffusionPipeline
from diffusers.utils import load_image, export_to_video
from PIL import Image

def image_to_video(image_path, output_path, steps=25, fps=7):
    """
    Generates a short video from a single image using Stable Video Diffusion.
    """
    try:
        print("Initializing Stable Video Diffusion pipeline...")
        # 1. Setup device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        print(f"Using device: {device} with dtype: {dtype}")

        # 2. Load the SVD pipeline
        pipe = StableVideoDiffusionPipeline.from_pretrained(
            "stabilityai/stable-video-diffusion-img2vid-xt",
            torch_dtype=dtype,
            variant="fp16" if device == "cuda" else "fp32"
        )
        if device == "cuda":
            pipe.enable_model_cpu_offload()
        else:
            pipe.to(device)


        print(f"Loading base image from: {image_path}")
        # 3. Load the initial image
        image = load_image(image_path)
        # SVD model expects 1024x576, so we resize
        image = image.resize((1024, 576))

        # 4. Generate frames
        print(f"Generating video frames (this may take a while)...")
        # The number of frames is fixed by the model architecture
        frames = pipe(image, num_inference_steps=steps, decode_chunk_size=8).frames[0]

        # 5. Export frames to a video file
        print(f"Exporting frames to video: {output_path}")
        export_to_video(frames, output_path, fps=fps)

        print(f"Successfully generated silent video at {output_path}")
        return True

    except Exception as e:
        print(f"An error occurred during video generation: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 generate_video.py <input_image_path> <output_mp4_path>", file=sys.stderr)
        sys.exit(1)

    input_image = sys.argv[1]
    output_video = sys.argv[2]

    if not os.path.exists(input_image):
        print(f"Error: Input image not found at {input_image}", file=sys.stderr)
        sys.exit(1)

    # Ensure the output directory exists
    output_dir = os.path.dirname(output_video)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    if not image_to_video(input_image, output_video):
        sys.exit(1)
