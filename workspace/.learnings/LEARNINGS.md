
## [LRN-20260319-001] correction

**Logged**: 2026-03-19T22:21:00Z
**Priority**: critical
**Status**: pending
**Area**: browser_automation

### Summary
Failed multiple times to automate Douyin image-text publishing because of incorrect assumptions about the music selection UI.

### Details
The user requested an automated Douyin post. My script repeatedly failed at the "Select Music" step.
- **My Incorrect Assumption:** I assumed clicking "选择音乐" would open a standard modal dialog (`div.semi-modal-content`). The script would time out waiting for this modal to appear because it never did.
- **User's Correction:** The user provided a screenshot showing the correct workflow: clicking the "选择音乐" element (which is a container with text and an icon) opens a **right-hand sidebar panel**, not a modal.

The key learning is to never assume UI behavior. When automation fails, the cause is often a flaky selector or an incorrect assumption about the UI's response to an action (e.g., modal vs. sidebar). The fix is to use more specific selectors and wait for UI elements that are confirmed to appear.

### Suggested Action
Modify the `publish-imagetext.mjs` script to:
1. Use a more precise selector for the music button.
2. Wait for a selector corresponding to the right-hand sidebar to become visible.
3. Then click the first music item within that sidebar.

### Metadata
- Source: user_feedback
- Related Files: `~/.agents/skills/douyin-creator-tools/src/publish-imagetext.mjs`
- Tags: playwright, douyin, selector, flaky_test

---

## [LRN-20260320-001] best_practice

**Logged**: 2026-03-20T09:05:01Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
User instructed to cache successful, complex operations to reduce token consumption on repeated tasks.

### Details
The user stated: "记住重复的操作不需要再调用那么多token，每次执行成功后保存在本地，下次执行优先调用本地已知的操作，不知道的在调用模型" (Remember that repetitive operations don't need to call so many tokens. After each successful execution, save it locally. For the next execution, prioritize calling the locally known operation. If you don't know, then call the model).

This is a best practice to improve efficiency and reduce costs. Instead of re-deriving a solution from scratch every time, I should develop a mechanism to "remember" the successful workflow for complex, multi-step tasks.

### Suggested Action
1.  For complex, multi-step tasks that succeed, I should summarize the successful workflow and save it to a relevant file (e.g., a new `.learnings/WORKFLOWS.md` or as a `best_practice` in `LEARNINGS.md`).
2.  When a new task comes in, perform a `memory_search` or `grep` on my learning files for similar keywords.
3.  If a known-good workflow is found, follow those steps directly instead of starting a new reasoning process.
4.  Only if no local workflow is found should I proceed with a full reasoning cycle.

### Metadata
- Source: user_feedback
- Tags: efficiency, token_reduction, best_practice, workflow_caching

---
