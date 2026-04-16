import type { GeneratedApp, PackageTarget } from './appGenerator'

export type BuildPlatform = 'android' | 'ios' | 'all'
export type BuildProfile = 'preview' | 'production'
export type BuildJobStatus = 'queued' | 'preparing' | 'ready'

export interface BuildRequest {
  id: string
  createdAt: number
  target: PackageTarget
  platform: BuildPlatform
  profile: BuildProfile
  appName: string
  slug: string
  summary: string
  artifactName: string
  commands: string[]
  notes: string[]
}

export interface BuildJob extends BuildRequest {
  status: BuildJobStatus
}

export const BUILD_PLATFORM_LABELS: Record<BuildPlatform, string> = {
  android: 'Android',
  ios: 'iOS',
  all: 'Android + iOS',
}

export const BUILD_PROFILE_LABELS: Record<BuildProfile, string> = {
  preview: '预览包',
  production: '生产包',
}

export const BUILD_STATUS_LABELS: Record<BuildJobStatus, string> = {
  queued: '排队中',
  preparing: '构建中',
  ready: '已就绪',
}

export function createBuildRequest(
  spec: GeneratedApp,
  target: PackageTarget,
  platform: BuildPlatform,
  profile: BuildProfile,
): BuildRequest {
  const timestamp = Date.now()

  return {
    id: createRequestId(spec.slug, timestamp),
    createdAt: timestamp,
    target,
    platform,
    profile,
    appName: spec.name,
    slug: spec.slug,
    summary: `${spec.name} · ${BUILD_PLATFORM_LABELS[platform]} · ${BUILD_PROFILE_LABELS[profile]}`,
    artifactName: createArtifactName(spec.slug, target, platform, profile),
    commands: createCommands(target, platform, profile),
    notes: createNotes(spec, target, platform, profile),
  }
}

export function createBuildJob(
  spec: GeneratedApp,
  target: PackageTarget,
  platform: BuildPlatform,
  profile: BuildProfile,
): BuildJob {
  return {
    ...createBuildRequest(spec, target, platform, profile),
    status: 'queued',
  }
}

export function syncBuildJobs(jobs: BuildJob[], now = Date.now()): BuildJob[] {
  return jobs.map((job) => syncBuildJob(job, now))
}

export function syncBuildJob(job: BuildJob, now = Date.now()): BuildJob {
  const age = now - job.createdAt

  if (age >= 4500 && job.status !== 'ready') {
    return { ...job, status: 'ready' }
  }

  if (age >= 1800 && job.status === 'queued') {
    return { ...job, status: 'preparing' }
  }

  return job
}

export function buildRequestToBlob(request: BuildRequest): Blob {
  return new Blob([JSON.stringify(request, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
}

export function buildRequestFilename(request: BuildRequest): string {
  return `${request.slug}-${request.target}-${request.platform}-${request.profile}-request.json`
}

function createRequestId(slug: string, timestamp: number): string {
  return `${slug}-${timestamp.toString(36)}`
}

function createArtifactName(
  slug: string,
  target: PackageTarget,
  platform: BuildPlatform,
  profile: BuildProfile,
): string {
  if (target === 'pwa') {
    return `${slug}-pwa.zip`
  }

  if (platform === 'android') {
    return profile === 'preview' ? `${slug}-preview.apk` : `${slug}-release.aab`
  }

  if (platform === 'ios') {
    return `${slug}-${profile}.ipa`
  }

  const androidArtifact =
    profile === 'preview' ? `${slug}-preview.apk` : `${slug}-release.aab`

  return `${androidArtifact} + ${slug}-${profile}.ipa`
}

function createCommands(
  target: PackageTarget,
  platform: BuildPlatform,
  profile: BuildProfile,
): string[] {
  if (target === 'pwa') {
    return [
      'npm install',
      'npm run build',
      '将 dist/ 部署到 HTTPS 静态托管',
      '手机浏览器打开站点并添加到主屏幕',
    ]
  }

  const commands = ['npm install', 'npx expo start']

  if (platform === 'android' || platform === 'all') {
    commands.push(`npx eas-cli build -p android --profile ${profile}`)
  }

  if (platform === 'ios' || platform === 'all') {
    commands.push(`npx eas-cli build -p ios --profile ${profile}`)
  }

  return commands
}

function createNotes(
  spec: GeneratedApp,
  target: PackageTarget,
  platform: BuildPlatform,
  profile: BuildProfile,
): string[] {
  if (target === 'pwa') {
    return [
      '产物是浏览器可安装网页应用，需要 HTTPS 托管。',
      `推荐场景：${spec.valueProp}。`,
      '用户在手机浏览器中可直接添加到主屏幕。',
    ]
  }

  return [
    '原生工程基于 Expo SDK 55、React Native 0.83。',
    `构建平台：${BUILD_PLATFORM_LABELS[platform]}，档位：${BUILD_PROFILE_LABELS[profile]}。`,
    '继续补充签名、图标、隐私权限和真实接口后即可进入分发或上架流程。',
  ]
}
