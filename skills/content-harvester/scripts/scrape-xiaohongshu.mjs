#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';

const XHS_EXPLORE_URL = 'https://www.xiaohongshu.com/explore';
const PROFILE_PATH = '~/.agents/browser-profiles/xhs-profile';
const SESSION_NAME = 'xhs-scraper-final';
const SNAPSHOT_FILE = 'xhs-snapshot-final.txt';
const OUTPUT_FILE = 'xhs_posts.json';

function run(command) {
    console.log(`[EXEC] ${command}`);
    return execSync(command, { encoding: 'utf-8' });
}

console.log('--- Step 1: Forcefully cleaning up previous browser sessions...');
run(`pkill -f "agent-browser" || true`);

console.log(`--- Step 2: Running browser to get snapshot...`);
run(`
    agent-browser --session ${SESSION_NAME} --profile ${PROFILE_PATH} open '${XHS_EXPLORE_URL}' && \
    agent-browser --session ${SESSION_NAME} wait --load networkidle && \
    agent-browser --session ${SESSION_NAME} scroll down 1500 && \
    agent-browser --session ${SESSION_NAME} wait 3000 && \
    agent-browser --session ${SESSION_NAME} snapshot -i > ${SNAPSHOT_FILE}
`);

console.log(`--- Step 3: Parsing snapshot and extracting post data...`);
const snapshotContent = fs.readFileSync(SNAPSHOT_FILE, 'utf-8');
const lines = snapshotContent.split('\n');

const posts = [];
let currentPost = {};

// Regex to find lines with post titles, which are typically longer and not just emojis or single words.
// This is a heuristic and might need refinement.
const titleRegex = /link "(.{5,})"/; 
// Regex to find the ref ID
const refRegex = /\[ref=(e\d+)\]/;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const titleMatch = line.match(titleRegex);
    const refMatch = line.match(refRegex);

    if (titleMatch && refMatch) {
        const title = titleMatch[1];
        const refId = refMatch[1];
        
        // Assumption: The preceding unnamed link is the main link to the post. Let's grab its ref.
        if (i > 0) {
            const prevLine = lines[i-1];
            const prevRefMatch = prevLine.match(/link \[ref=(e\d+)\]/);
            if (prevRefMatch) {
                const postRefId = prevRefMatch[1];
                try {
                    const href = run(`agent-browser --session ${SESSION_NAME} get attr href @${postRefId}`).trim();
                    const authorLine = lines[i+1] || '';
                    const authorMatch = authorLine.match(/link "([^"]+)"/);
                    const author = authorMatch ? authorMatch[1] : 'Unknown';

                    posts.push({
                        title: title,
                        author: author,
                        url: href
                    });
                    console.log(`[SUCCESS] Extracted: ${title}`);
                } catch (e) {
                    console.error(`[FAIL] Could not get href for ${refId}. Error: ${e.message}`);
                }
            }
        }
    }
}

console.log(`--- Step 4: Saving extracted data to ${OUTPUT_FILE}...`);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2));

console.log(`--- Step 5: Closing browser session...`);
run(`agent-browser --session ${SESSION_NAME} close`);

console.log(`\n✅ All done. Extracted ${posts.length} posts.`);
