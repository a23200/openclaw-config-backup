import sys
import os
from executor import execute_plan

plan = {
    "functions": [
        {"name": "back_zero", "args": {}},
    ],
    "response": "test"
}
execute_plan(plan)
