import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { buildPwaPackage, generateAppSpec, type GeneratorFormData } from '../src/lib/appGenerator'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(rootDir, 'android-shell-www')

const form: GeneratorFormData = {
  appName: '灵动商城',
  prompt:
    '做一个面向年轻人的电商 App，需要首页推荐、商品搜索、商品详情、购物车、订单管理、优惠券、会员中心和消息提醒。',
  platform: 'android',
  palette: 'sunset',
}

const spec = generateAppSpec(form)
const blob = await buildPwaPackage(spec)
const zip = await JSZip.loadAsync(await blob.arrayBuffer())

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

for (const [filePath, file] of Object.entries(zip.files)) {
  if (file.dir) {
    continue
  }

  const [, ...withoutRoot] = filePath.split('/')
  const targetRelativePath = withoutRoot.join('/')

  if (!targetRelativePath) {
    continue
  }

  const targetPath = join(outputDir, targetRelativePath)
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, Buffer.from(await file.async('arraybuffer')))
}

console.log(`Exported ${spec.name} Android shell to ${relative(rootDir, outputDir)}`)
