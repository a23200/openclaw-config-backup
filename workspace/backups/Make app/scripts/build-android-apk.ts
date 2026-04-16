import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildAndroidApk, formatBuildResult } from '../server/apkBuilder'

const defaultForm = {
  appName: '灵动商城',
  prompt:
    '做一个面向年轻人的电商 App，需要首页推荐、商品搜索、商品详情、购物车、订单管理、优惠券、会员中心和消息提醒。',
  platform: 'android' as const,
  palette: 'violet' as const,
}

const result = await buildAndroidApk(defaultForm)
const exportPath = join(process.cwd(), `${result.spec.name}-android-release.apk`)

await copyFile(result.apkPath, exportPath)

console.log(formatBuildResult(result))
console.log(`Release APK ready: ${exportPath}`)
