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
## [ERR-20260324-002] git_clone_github_ssh_host_key_verification

**Logged**: 2026-03-24T06:04:00+08:00
**Priority**: high
**Status**: resolved
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

### Resolution
- **Resolved**: 2026-03-24T06:06:00+08:00
- **Notes**: Added GitHub host keys to `~/.ssh/known_hosts`. SSH still lacked a usable private key, so backup was completed successfully via HTTPS using the existing authenticated `gh`/git credential flow.

---
## [ERR-20260324-GHSSH] git_clone_backup_repo_over_ssh

**Logged**: 2026-03-24T06:09:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Daily backup cron failed when cloning the GitHub backup repo over SSH because no usable SSH key was configured for GitHub.

### Error
```
git@github.com: Permission denied (publickey).
致命错误：无法读取远程仓库。
```

### Context
- Command/operation attempted: daily backup cron clone step
- Input or parameters used: `git clone git@github.com:a23200/openclaw-config-backup.git /tmp/openclaw-daily-backup-repo`
- Environment details if relevant: `gh auth status` shows the active Git operations protocol is HTTPS and the account is logged in successfully.

### Suggested Fix
Use HTTPS for this backup workflow (or configure a GitHub SSH key on this machine). Prefer HTTPS here because `gh` is already authenticated and reliable for unattended backup jobs.

### Metadata
- Reproducible: yes
- Related Files: /Users/mac/.openclaw/workspace/.learnings/ERRORS.md

---
