import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import JSZip from 'jszip'
import {
  buildPwaPackage,
  generateAppSpec,
  type GeneratedApp,
  type GeneratorFormData,
  type PaletteId,
} from '../src/lib/appGenerator'

const execFileAsync = promisify(execFile)
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDir = join(rootDir, 'android-shell-www')
const androidDir = join(rootDir, 'android')
const generatedDownloadDir = join(rootDir, 'public', 'downloads', 'generated')
const releaseApkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
const releaseKeystoreDir = join(androidDir, 'keystore')
const releaseKeystorePath = join(releaseKeystoreDir, 'make-app-release.jks')
const keystorePropertiesPath = join(androidDir, 'keystore.properties')
const releaseKeyAlias = 'makeapprelease'

export interface BuildAndroidApkResult {
  spec: GeneratedApp
  apkPath: string
  downloadUrl: string
  filename: string
  size: number
}

export async function buildAndroidApk(
  rawForm: Partial<GeneratorFormData>,
): Promise<BuildAndroidApkResult> {
  const form = normalizeForm(rawForm)
  const spec = generateAppSpec(form)
  const applicationId = createApplicationId(spec.slug)
  const versionInfo = createVersionInfo()

  await ensureReleaseSigning()
  await exportWebApp(spec)
  await runCommand('npx', ['cap', 'sync', 'android'], rootDir)
  await updateAndroidLabels(spec, applicationId)
  await updateCapacitorRuntimeConfig(spec, applicationId)
  await runCommand(
    './gradlew',
    [
      'assembleRelease',
      `-PmakeAppApplicationId=${applicationId}`,
      `-PmakeAppVersionCode=${versionInfo.code}`,
      `-PmakeAppVersionName=${versionInfo.name}`,
    ],
    androidDir,
  )

  const filename = `${spec.slug}-android-release.apk`
  const apkPath = join(generatedDownloadDir, filename)

  await mkdir(generatedDownloadDir, { recursive: true })
  await copyFile(releaseApkPath, apkPath)

  const apkStat = await stat(apkPath)

  return {
    spec,
    apkPath,
    downloadUrl: `/downloads/generated/${filename}`,
    filename,
    size: apkStat.size,
  }
}

function normalizeForm(rawForm: Partial<GeneratorFormData>): GeneratorFormData {
  return {
    appName: typeof rawForm.appName === 'string' ? rawForm.appName : '安卓应用',
    prompt: typeof rawForm.prompt === 'string' ? rawForm.prompt : '',
    platform: 'android',
    palette: normalizePalette(rawForm.palette),
  }
}

function normalizePalette(palette: unknown): PaletteId {
  if (
    palette === 'violet' ||
    palette === 'ocean' ||
    palette === 'emerald' ||
    palette === 'sunset'
  ) {
    return palette
  }

  return 'violet'
}

async function exportWebApp(spec: GeneratedApp): Promise<void> {
  const blob = await buildPwaPackage(spec)
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())

  await rm(webDir, { recursive: true, force: true })
  await mkdir(webDir, { recursive: true })

  for (const [filePath, file] of Object.entries(zip.files)) {
    if (file.dir) {
      continue
    }

    const [, ...withoutRoot] = filePath.split('/')
    const targetRelativePath = withoutRoot.join('/')

    if (!targetRelativePath) {
      continue
    }

    const targetPath = join(webDir, targetRelativePath)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, Buffer.from(await file.async('arraybuffer')))
  }
}

async function ensureReleaseSigning(): Promise<void> {
  const keystoreExists = await fileExists(releaseKeystorePath)
  const propertiesExist = await fileExists(keystorePropertiesPath)
  const signingProperties = propertiesExist
    ? await readSigningProperties(keystorePropertiesPath)
    : null

  if (
    keystoreExists &&
    propertiesExist &&
    signingProperties?.storePassword &&
    signingProperties.keyPassword === signingProperties.storePassword &&
    signingProperties.keyAlias === releaseKeyAlias
  ) {
    return
  }

  await mkdir(releaseKeystoreDir, { recursive: true })
  await rm(releaseKeystorePath, { force: true })

  const storePassword = createSecret()
  const keyPassword = storePassword

  await runCommand(
    join(resolveJavaHome(), 'bin', 'keytool'),
    [
      '-genkeypair',
      '-keystore',
      releaseKeystorePath,
      '-storetype',
      'PKCS12',
      '-storepass',
      storePassword,
      '-alias',
      releaseKeyAlias,
      '-keypass',
      keyPassword,
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '36500',
      '-dname',
      'CN=Make App, OU=App Generator, O=Make App, L=Shanghai, ST=Shanghai, C=CN',
    ],
    rootDir,
  )

  await writeFile(
    keystorePropertiesPath,
    [
      `storeFile=${toPosixPath(relative(androidDir, releaseKeystorePath))}`,
      `storePassword=${storePassword}`,
      `keyAlias=${releaseKeyAlias}`,
      `keyPassword=${keyPassword}`,
      '',
    ].join('\n'),
  )
}

function createApplicationId(slug: string): string {
  const compact = slug.replace(/[^a-z0-9]+/g, '')
  const suffix = compact.slice(0, 24) || 'generatedapp'
  const safeSuffix = /^[a-z]/.test(suffix) ? suffix : `app${suffix}`

  return `com.makeapp.generated.${safeSuffix}`
}

function createVersionInfo(): { code: number; name: string } {
  const now = new Date()
  const yy = String(now.getFullYear() % 100).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')

  return {
    code: Number(`${yy}${month}${day}${hour}`),
    name: `${now.getFullYear()}.${month}.${day}.${hour}`,
  }
}

async function updateAndroidLabels(
  spec: GeneratedApp,
  applicationId: string,
): Promise<void> {
  const stringsPath = join(androidDir, 'app', 'src', 'main', 'res', 'values', 'strings.xml')
  const appName = xmlEscape(spec.name.slice(0, 24) || '安卓应用')
  const packageName = applicationId

  await writeFile(
    stringsPath,
    `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">${appName}</string>
    <string name="title_activity_main">${appName}</string>
    <string name="package_name">${packageName}</string>
    <string name="custom_url_scheme">${packageName}</string>
</resources>
`,
  )
}

async function updateCapacitorRuntimeConfig(
  spec: GeneratedApp,
  applicationId: string,
): Promise<void> {
  const configPath = join(androidDir, 'app', 'src', 'main', 'assets', 'capacitor.config.json')

  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        appId: applicationId,
        appName: spec.name,
        webDir: 'android-shell-www',
        server: {
          androidScheme: 'https',
        },
      },
      null,
      '\t',
    )}
`,
  )
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  try {
    const javaHome = resolveJavaHome()

    await execFileAsync(command, args, {
      cwd,
      env: {
        ...process.env,
        JAVA_HOME: javaHome,
        PATH: `${join(javaHome, 'bin')}:${process.env.PATH ?? ''}`,
        ANDROID_HOME:
          process.env.ANDROID_HOME ?? join(process.env.HOME ?? '', 'Library', 'Android', 'sdk'),
        ANDROID_SDK_ROOT:
          process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME ?? '', 'Library', 'Android', 'sdk'),
      },
      maxBuffer: 1024 * 1024 * 12,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${detail}`)
  }
}

function resolveJavaHome(): string {
  return (
    process.env.JAVA_HOME ??
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
  )
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readSigningProperties(
  path: string,
): Promise<Record<string, string>> {
  const content = await readFile(path, 'utf8')
  const entries = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [key, ...value] = line.split('=')
      return [key, value.join('=')] as const
    })

  return Object.fromEntries(entries)
}

function createSecret(): string {
  return randomBytes(12).toString('base64url')
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatBuildResult(result: BuildAndroidApkResult): string {
  return `Built ${result.filename} (${result.size} bytes) at ${relative(rootDir, result.apkPath)}`
}
