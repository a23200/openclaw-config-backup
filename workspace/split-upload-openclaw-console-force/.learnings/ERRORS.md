## [ERR-20260412-001] npm-install-r3f

**Logged**: 2026-04-12T11:27:19Z
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
Attempting to install latest `@react-three/fiber` failed because current app uses React 18 while `@react-three/fiber@9.x` requires React 19.

### Error
```
npm error peer react@">=19 <19.3" from @react-three/fiber@9.5.0
```

### Context
- Command attempted: `npm install three @react-three/fiber @react-three/drei`
- Current project React version: `18.3.1`
- Need a React 18 compatible `three/fiber/drei` version set

### Suggested Fix
Install a React 18 compatible `@react-three/fiber` 8.x and matching `@react-three/drei`/`three` versions instead of latest.

### Metadata
- Reproducible: yes
- Related Files: `/Users/mac/openclaw-console/package.json`

### Resolution
- **Resolved**: 2026-04-12T11:38:00Z
- **Commit/PR**: n/a
- **Notes**: Switched to React 18 compatible versions: `three@0.160.0`, `@react-three/fiber@8.17.10`, `@react-three/drei@9.108.3`.

---
