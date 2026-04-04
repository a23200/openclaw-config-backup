import os
from pathlib import Path
from dotenv import load_dotenv

WORKSPACE_ENV = Path(__file__).resolve().parents[1] / '.env.local'

def load_keys():
    """从 workspace 根目录自动加载 API Keys"""
    if WORKSPACE_ENV.exists():
        load_dotenv(WORKSPACE_ENV)
    
    return {
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY")
    }

if __name__ == "__main__":
    keys = load_keys()
    print("Keys loaded:", {k: "SET" if v else "NOT_SET" for k, v in keys.items()})