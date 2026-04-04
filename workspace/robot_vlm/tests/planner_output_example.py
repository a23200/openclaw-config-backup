import json

EXAMPLE_OUTPUT = {
    "functions": [
        {"name": "vlm_move", "args": {"prompt_text": "指一下画面里的那个烟盒"}}
    ],
    "response": "收到，我马上指出烟盒的位置。"
}

if __name__ == '__main__':
    print(json.dumps(EXAMPLE_OUTPUT, ensure_ascii=False, indent=2))
