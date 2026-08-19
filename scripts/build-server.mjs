/**
 * Bundle @animaku/server (+ workspace shared) to a single Node ESM file.
 * Dev still uses tsx; production / Docker use `node dist/index.js`.
 *
 * Run from apps/server via: pnpm --filter @animaku/server build
 * (esbuild is a server package devDependency)
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const serverRoot = path.join(root, 'apps/server')

function resolvePackageVersion() {
  try {
    const pkgPath = path.resolve(root, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.version) return `v${pkg.version}`
    }
  } catch {}
  return 'v1.1.1'
}

const appVersion = process.env.APP_VERSION || resolvePackageVersion()

// Resolve esbuild from apps/server/node_modules (pnpm workspace layout)
const require = createRequire(path.join(serverRoot, 'package.json'))
const esbuild = require('esbuild')

await esbuild.build({
  entryPoints: [path.join(serverRoot, 'src/index.ts')],
  outfile: path.join(serverRoot, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'bundle',
  minify: true,
  legalComments: 'none',
  define: {
    'process.env.APP_VERSION': JSON.stringify(appVersion),
  },
  // CJS deps (cheerio etc.) call require("buffer"/…) at runtime. ESM output has no
  // require unless we inject createRequire; without this Node throws:
  //   Dynamic require of "buffer" is not supported
  banner: {
    js: "import { createRequire as __animakuCreateRequire } from 'node:module';const require = __animakuCreateRequire(import.meta.url);",
  },
  alias: {
    '@animaku/shared': path.join(root, 'packages/shared/src/index.ts'),
  },
  logLevel: 'info',
  sourcemap: true,
})

console.log('server bundle → apps/server/dist/index.js')
