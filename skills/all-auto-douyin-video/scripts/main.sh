#!/bin/bash
# This script acts as a wrapper to execute the main Python script in its virtual environment.
# It reads the "script" text from standard input and pipes it to the Python process.

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

VENV_PYTHON="$DIR/../venv/bin/python"
MAIN_PY_SCRIPT="$DIR/../run.py"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "Error: Python virtual environment not found at $VENV_PYTHON"
    exit 1
fi

if [ ! -f "$MAIN_PY_SCRIPT" ]; then
    echo "Error: Main python script not found at $MAIN_PY_SCRIPT"
    exit 1
fi

# Read from stdin and execute the python script
"$VENV_PYTHON" "$MAIN_PY_SCRIPT"
