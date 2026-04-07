#!/bin/bash
QUERY="$1"

# 1. Copy to clipboard via our reliable ObjC helper
/Users/mac/.openclaw/workspace-feishu/mac_copy "$QUERY"

# 2. Activate the app first to ensure it's ready
osascript -e 'tell application "汽水音乐" to activate'
sleep 0.5

# 3. Get window position
POS_STR=$(osascript -e 'tell application "System Events" to tell process "汽水音乐" to get position of window "汽水音乐"')
X=$(echo $POS_STR | awk -F', ' '{print $1}')
Y=$(echo $POS_STR | awk -F', ' '{print $2}')

# If window is not found, exit
if [ -z "$X" ] || [ -z "$Y" ]; then
    echo "Error: Could not get position of 汽水音乐 window."
    exit 1
fi

# 4. Click the search bar to focus it.
# Vision analysis placed search bar center at relative offset (845, 76)
SEARCH_X=$((X + 845))
SEARCH_Y=$((Y + 76))
/Users/mac/.openclaw/workspace-feishu/mac_click $SEARCH_X $SEARCH_Y
sleep 0.3

# 5. Keystroke sequence: Select All, Delete, Paste, Enter
osascript -e 'tell application "System Events" to tell process "汽水音乐"' \
-e 'keystroke "a" using {command down}' \
-e 'delay 0.2' \
-e 'key code 51' \
-e 'delay 0.2' \
-e 'keystroke "v" using {command down}' \
-e 'delay 0.5' \
-e 'key code 36' \
-e 'end tell'

# 6. Wait for search results
sleep 2.5

# 7. Calculate and double-click the first result
# Relative offset from vision analysis was (561, 344)
TARGET_X=$((X + 561))
TARGET_Y=$((Y + 344))
/Users/mac/.openclaw/workspace-feishu/mac_click $TARGET_X $TARGET_Y double
