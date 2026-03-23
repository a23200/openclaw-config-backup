## [ERR-20260324-001] publish-video.mjs duplicate editor declaration

**Logged**: 2026-03-24T05:58:00+08:00
**Priority**: high
**Status**: resolved
**Area**: config

### Summary
Douyin video publish script failed to start because `editor` was declared twice in the same scope.

### Error
```text
SyntaxError: Identifier 'editor' has already been declared
```

### Context
- Command attempted:
  `node /Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs "<final_video_path>" "<caption>"`
- Script path: `/Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs`
- Failure happened before Playwright launch completed.

### Suggested Fix
Remove the duplicate declaration and use a single primary/fallback editor selection. Prefer `fill(description)` over keyboard typing for the caption box to reduce accidental key-triggered UI bugs.

### Metadata
- Reproducible: yes
- Related Files: /Users/mac/.agents/skills/auto-douyin-video/scripts/publish-video.mjs

### Resolution
- **Resolved**: 2026-03-24T05:58:00+08:00
- **Notes**: Removed duplicate `const editor`, renamed to `primaryEditor`, and switched caption insertion to `fill(description)`.

---
## [ERR-20260324-001] git_clone_github_ssh_host_key_verification

**Logged**: 2026-03-24T06:04:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
Daily backup cron failed on first clone because GitHub SSH host key was not trusted on this machine.

### Error
```
Host key verification failed.
fatal: Could not read from remote repository.
```

### Context
- Command/operation attempted: `git clone git@github.com:a23200/openclaw-config-backup.git /tmp/openclaw-daily-backup-repo`
- Environment: OpenClaw cron task on macOS
- Follow-up: seed `~/.ssh/known_hosts` for github.com, then retry

### Suggested Fix
Add GitHub host keys to `~/.ssh/known_hosts` before SSH-based git clone, then rerun backup.

### Metadata
- Reproducible: yes
- Related Files: /Users/mac/.openclaw/workspace/.learnings/ERRORS.md

---
