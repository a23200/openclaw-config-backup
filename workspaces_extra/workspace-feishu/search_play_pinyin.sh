#!/bin/bash
QUERY="$1"

POS=$(osascript -e 'tell application "System Events" to tell process "汽水音乐" to get position of window 1')
X=$(echo $POS | awk -F', ' '{print $1}')
Y=$(echo $POS | awk -F', ' '{print $2}')

# Activate first
osascript -e 'tell application "汽水音乐" to activate'
sleep 0.5

# Focus search box
SEARCH_X=$((X + 845))
SEARCH_Y=$((Y + 76))
/Users/mac/.openclaw/workspace-feishu/mac_click $SEARCH_X $SEARCH_Y
sleep 0.5

# Select all, delete, type pinyin, enter
osascript -e 'tell application "System Events"' \
-e 'keystroke "a" using command down' \
-e 'delay 0.1' \
-e 'key code 51' \
-e 'delay 0.1' \
-e "keystroke \"$QUERY\"" \
-e 'delay 0.5' \
-e 'key code 36' \
-e 'end tell'

sleep 2.5

TARGET_X=$((X + 561))
TARGET_Y=$((Y + 344))
/Users/mac/.openclaw/workspace-feishu/mac_click $TARGET_X $TARGET_Y double
