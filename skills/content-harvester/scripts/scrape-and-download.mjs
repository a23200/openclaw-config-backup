#!/usr/bin/env node
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

const XHS_EXPLORE_URL = 'https://www.xiaohongshu.com/explore';
const PROFILE_PATH = '~/.agents/browser-profiles/xhs-profile';
const SESSION_NAME = 'xhs-harvester';
const SNAPSHOT_FILE = 'xhs-snapshot-final.txt';
const OUTPUT_FILE = 'xhs_harvested_data.json';
const DOWNLOAD_DIR = 'xhs_downloads';

// --- Utility Functions ---
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function runSync(command) {
    log(`[EXEC SYNC] ${command}`);
    try {
        return execSync(command, { encoding: 'utf-8', stdio: 'inherit' });
    } catch (e) {
        log(`[ERROR] Command failed: ${command}`);
        throw e;
    }
}

// --- Main Logic ---
async function main() {
    log('--- Starting Xiaohongshu Harvester ---');

    // 1. Cleanup and Setup
    log('Step 1: Cleaning up old sessions and creating download directory...');
    runSync(`pkill -f "agent-browser" || true && sleep 1`);
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR);
    }

    // 2. Get Post List
    log('Step 2: Opening browser to get the list of posts...');
    const browser = exec(`agent-browser --session ${SESSION_NAME} --profile ${PROFILE_PATH}`);
    // Give browser time to launch
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let posts = [];
    try {
        runSync(`agent-browser --session ${SESSION_NAME} open "${XHS_EXPLORE_URL}"`);
        runSync(`agent-browser --session ${SESSION_NAME} wait --load networkidle`);
        runSync(`agent-browser --session ${SESSION_NAME} scroll down 2000`);
        runSync(`agent-browser --session ${SESSION_NAME} wait 5000`);
        runSync(`agent-browser --session ${SESSION_NAME} snapshot -i > ${SNAPSHOT_FILE}`);

        log('Step 2a: Parsing snapshot to extract post URLs...');
        const snapshotContent = fs.readFileSync(SNAPSHOT_FILE, 'utf-8');
        const lines = snapshotContent.split('\n');
        const postEntryRegex = /link "(.{5,})"/; // Heuristic: Titles are longer than 5 chars
        const refRegex = /\[ref=(e\d+)\]/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (postEntryRegex.test(line)) {
                // The actual link is usually the unnamed link element right before the title
                if (i > 0) {
                    const prevLine = lines[i-1];
                    const prevRefMatch = prevLine.match(refRegex);
                    if (prevRefMatch && prevLine.startsWith('link [ref=')) {
                        const postRefId = prevRefMatch[1];
                        const url = runSync(`agent-browser --session ${SESSION_NAME} get attr href @${postRefId}`).trim();
                        const title = (line.match(postEntryRegex) || [])[1] || 'No Title';
                        const author = (lines[i+1]?.match(/link "([^"]+)"/))?.[1] || 'Unknown';
                        
                        if (url.includes('/explore/')) {
                            posts.push({ title, author, url, content: '', images: [] });
                        }
                    }
                }
            }
        }
        log(`Successfully extracted ${posts.length} post URLs.`);

    } catch (error) {
        log('Error during post list extraction. Aborting.');
        runSync(`agent-browser --session ${SESSION_NAME} close`);
        browser.kill();
        return;
    }

    // 3. Scrape Detail Pages
    log('Step 3: Scraping detail page for each post...');
    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        try {
            log(`Scraping post ${i + 1}/${posts.length}: ${post.title}`);
            runSync(`agent-browser --session ${SESSION_NAME} open "${post.url}"`);
            runSync(`agent-browser --session ${SESSION_NAME} wait --load networkidle`);
            
            // Wait for content to be visible. Selectors are based on XHS structure as of March 2026.
            const contentSelector = '#detail-desc'; // The main text content
            const imageSelector = '.swiper-slide img'; // Images in the carousel
            
            runSync(`agent-browser --session ${SESSION_NAME} wait "${contentSelector}"`);

            const content = runSync(`agent-browser --session ${SESSION_NAME} get text --selector "${contentSelector}"`).trim();
            post.content = content;

            // Get all image URLs
            const imageUrls = runSync(`agent-browser --session ${SESSION_NAME} get attr src --selector "${imageSelector}" --all`).trim().split('\n');
            post.images = imageUrls.filter(url => url.startsWith('http'));

            log(` -> Found ${post.images.length} images and content.`);

        } catch (e) {
            log(` -> Failed to scrape details for ${post.title}. Skipping.`);
        }
    }
    
    // 4. Save results
    log(`Step 4: Saving all harvested data to ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(posts, null, 2));

    // 5. Cleanup
    log('Step 5: Closing browser session.');
    runSync(`agent-browser --session ${SESSION_NAME} close`);
    browser.kill();

    log(`✅ Harvesting complete. All data saved. Found ${posts.length} posts.`);
}

main();
