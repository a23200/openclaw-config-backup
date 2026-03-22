#!/bin/bash
set -e

XHS_EXPLORE_URL='https://www.xiaohongshu.com/explore'
PROFILE_PATH='~/.agents/browser-profiles/xhs-profile'
SESSION_NAME='xhs-scraper-sh'
SNAPSHOT_FILE='xhs-snapshot-final.txt'
OUTPUT_FILE='xhs_posts.json'

echo "--- Step 1: Forcefully cleaning up previous browser sessions..."
pkill -f "agent-browser" || true
# Give it a moment to release resources
sleep 1

echo "--- Step 2: Starting browser and getting snapshot (will stay open)..."
agent-browser --session ${SESSION_NAME} --profile ${PROFILE_PATH} open "${XHS_EXPLORE_URL}"
agent-browser --session ${SESSION_NAME} wait --load networkidle
agent-browser --session ${SESSION_NAME} scroll down 1500
agent-browser --session ${SESSION_NAME} wait 3000
agent-browser --session ${SESSION_NAME} snapshot -i > ${SNAPSHOT_FILE}

echo "--- Step 3: Parsing snapshot and extracting post data (live session)..."
# Find all the 'ref=' IDs that are on a line with a long title, which indicates a post.
# Then, for each, find the refid of the line *before* it, which is the actual post link container.
POST_REFS=$(grep 'link ".\{5,\}"' ${SNAPSHOT_FILE} | sed -n 's/.*\[ref=\(e[0-9]*\)\].*/\1/p' | while read ref; do
  # Get the line number of the title, then get the line before it.
  LINE_NUM=$(grep -n "$ref" ${SNAPSHOT_FILE} | cut -d: -f1)
  PREV_LINE_NUM=$((LINE_NUM - 1))
  # Extract the ref from the previous line
  PREV_LINE_REF=$(sed -n "${PREV_LINE_NUM}p" ${SNAPSHOT_FILE} | sed -n 's/.*\[ref=\(e[0-9]*\)\].*/\1/p')
  echo $PREV_LINE_REF
done)

POSTS_JSON="[]"
for ref in $POST_REFS; do
  if [ -z "$ref" ]; then continue; fi
  
  echo "Extracting href for @${ref}..."
  HREF=$(agent-browser --session ${SESSION_NAME} get attr href @${ref} | tr -d '\n')
  
  # To get title and author, we need to go back to the snapshot file
  # This is getting complex for a shell script, but let's do it simply
  TITLE_REF_LINE_NUM=$(grep -n "$ref" ${SNAPSHOT_FILE} | cut -d: -f1)
  TITLE_LINE_NUM=$((TITLE_REF_LINE_NUM + 1))
  AUTHOR_LINE_NUM=$((TITLE_REF_LINE_NUM + 2))
  
  TITLE=$(sed -n "${TITLE_LINE_NUM}p" ${SNAPSHOT_FILE} | sed -n 's/.*link "\(.*\)" \[ref=e[0-9]*\].*/\1/p')
  AUTHOR=$(sed -n "${AUTHOR_LINE_NUM}p" ${SNAPSHOT_FILE} | sed -n 's/.*link "\(.*\)" \[ref=e[0-9]*\].*/\1/p')

  # Use jq to safely build the JSON
  POST_JSON=$(jq -n --arg t "$TITLE" --arg a "$AUTHOR" --arg u "$HREF" \
    '{title: $t, author: $a, url: $u}')
  
  POSTS_JSON=$(echo "$POSTS_JSON" | jq ". + [$POST_JSON]")
done

echo "--- Step 4: Saving extracted data..."
echo "$POSTS_JSON" | jq '.' > ${OUTPUT_FILE}

echo "--- Step 5: Closing browser session..."
agent-browser --session ${SESSION_NAME} close

POST_COUNT=$(echo "$POSTS_JSON" | jq '. | length')
echo -e "\n✅ All done. Extracted ${POST_COUNT} posts."
