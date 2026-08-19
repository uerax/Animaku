import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const target = process.argv[2]?.trim()

if (!target) {
  console.error(`
用法:
  pnpm bump <版本号 | patch | minor | major>

示例:
  pnpm bump 1.1.2
  pnpm bump v1.2.0
  pnpm bump patch    # 自动递增修订号 (如 1.1.1 -> 1.1.2)
  pnpm bump minor    # 自动递增次版本号 (如 1.1.1 -> 1.2.0)
  pnpm bump major    # 自动递增主版本号 (如 1.1.1 -> 2.0.0)
`)
  process.exit(1)
}

const rootPkgPath = path.join(rootDir, 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const currentVersion = rootPkg.version || '0.0.0'

function parseSemver(ver) {
  const clean = ver.replace(/^v/, '')
  const parts = clean.split('.').map((p) => parseInt(p, 10))
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null
  }
  return { major: parts[0], minor: parts[1], patch: parts[2] }
}

let nextVersion = ''
if (['patch', 'minor', 'major'].includes(target.toLowerCase())) {
  const sem = parseSemver(currentVersion)
  if (!sem) {
    console.error(`当前版本号 "${currentVersion}" 无法解析为标准 SemVer (x.y.z)`)
    process.exit(1)
  }
  if (target === 'patch') {
    nextVersion = `${sem.major}.${sem.minor}.${sem.patch + 1}`
  } else if (target === 'minor') {
    nextVersion = `${sem.major}.${sem.minor + 1}.0`
  } else if (target === 'major') {
    nextVersion = `${sem.major + 1}.0.0`
  }
} else {
  const clean = target.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(clean)) {
    console.error(`无效的版本号格式: "${target}"，期望格式如 1.1.2 或 1.2.0-beta.1`)
    process.exit(1)
  }
  nextVersion = clean
}

const targetFiles = [
  'package.json',
  'apps/web/package.json',
  'apps/server/package.json',
  'packages/shared/package.json',
]

console.log(`\n📦 正在将项目版本从 v${currentVersion} 升级至 v${nextVersion}...\n`)

// 1. Update all package.json files
for (const relPath of targetFiles) {
  const fullPath = path.join(rootDir, relPath)
  if (existsSync(fullPath)) {
    const raw = readFileSync(fullPath, 'utf8')
    const json = JSON.parse(raw)
    json.version = nextVersion
    writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n', 'utf8')
    console.log(`  ✓ 更新 ${relPath}`)
  }
}

// 2. Update packages/shared/src/version.ts
const versionTsPath = path.join(rootDir, 'packages/shared/src/version.ts')
const versionTsContent = `/**
 * Default fallback application version.
 * Applications dynamically inject/read version from package.json or process.env at build/runtime.
 */
export const DEFAULT_APP_VERSION = 'v${nextVersion}'
export const APP_VERSION = DEFAULT_APP_VERSION
`
writeFileSync(versionTsPath, versionTsContent, 'utf8')
console.log(`  ✓ 更新 packages/shared/src/version.ts`)

console.log(`\n🎉 版本已成功升级为 v${nextVersion}！`)
