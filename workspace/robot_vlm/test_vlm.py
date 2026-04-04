import sys
from executor import execute_plan

plan = {
    "functions": [
        {"name": "vlm_move", "args": {"prompt_text": "指向烟盒"}}
    ],
    "response": "执行测试"
}
execute_plan(plan)
