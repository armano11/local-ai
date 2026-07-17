import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = dirname(fileURLToPath(import.meta.url))

// The RunAnywhere WASM glue files (racommons*.js) load their `.wasm` binary at
// runtime by BARE, un-hashed filename relative to their own URL — e.g. the glue
// bundled to `dist/assets/racommons-<hash>.js` fetches `/assets/racommons.wasm`.
// Rollup bundles the glue JS but never emits those `.wasm` files, so production
// 404s ("both async and sync fetching of the wasm failed"). This plugin copies
// each `.wasm` into `dist/assets/` under its original name so the glue finds it.
const RUNANYWHERE_WASM = [
  'node_modules/@runanywhere/web/wasm/racommons.wasm',
  'node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp.wasm',
  'node_modules/@runanywhere/web-llamacpp/wasm/racommons-llamacpp-webgpu.wasm',
]

function copyRunAnywhereWasm(): Plugin {
  return {
    name: 'copy-runanywhere-wasm',
    apply: 'build',
    writeBundle(options) {
      const assetsDir = resolve(options.dir ?? resolve(rootDir, 'dist'), 'assets')
      mkdirSync(assetsDir, { recursive: true })
      for (const rel of RUNANYWHERE_WASM) {
        const src = resolve(rootDir, rel)
        const name = rel.slice(rel.lastIndexOf('/') + 1)
        copyFileSync(src, resolve(assetsDir, name))
      }
    },
  }
}

// The RunAnywhere packages ship ESM but depend on the CommonJS
// `@runanywhere/proto-ts`. Each parent has its own nested copy. We resolve
// both absolute paths so we can force-optimize (ESM-ify) just proto-ts while
// leaving the WASM-bearing parents un-bundled.
const protoTsDir = fileURLToPath(
  new URL(
    './node_modules/@runanywhere/web/node_modules/@runanywhere/proto-ts/dist',
    import.meta.url,
  ),
)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyRunAnywhereWasm()],
  resolve: {
    // Both RunAnywhere parents ship their own nested copy of the CommonJS
    // `@runanywhere/proto-ts`. Alias every bare import to a single copy so we
    // can force-optimize (ESM-ify) exactly one module and its named exports
    // (LogLevel, enums, …) resolve correctly at runtime.
    alias: {
      '@runanywhere/proto-ts': protoTsDir,
    },
  },
  // Relative base so the built app works on GitHub Pages (served from a subpath)
  // as well as on Vercel (served from root).
  base: './',
  optimizeDeps: {
    // The RunAnywhere packages locate their WASM binaries at runtime via
    // `new URL('../../wasm/racommons.js', import.meta.url)`. Vite's dependency
    // pre-bundling rewrites `import.meta.url` into `.vite/deps/`, breaking that
    // lookup and making SDK init fail (blank page). So keep the WASM-bearing
    // packages OUT of pre-bundling.
    exclude: ['@runanywhere/web', '@runanywhere/web-llamacpp'],
    // ...but their shared `@runanywhere/proto-ts` dependency is CommonJS. Left
    // as raw CJS, ESM named imports like `import { LogLevel }` throw at runtime.
    // Force-optimizing the aliased proto-ts converts it to ESM so the named
    // exports resolve. Sub-path imports (e.g. proto-ts/model_types) too.
    include: ['@runanywhere/proto-ts', '@runanywhere/proto-ts > *'],
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    // llama.cpp WASM uses SharedArrayBuffer for multi-threaded inference.
    // SharedArrayBuffer is only available in a cross-origin isolated context,
    // which requires BOTH of these headers.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    // Mirror the dev headers so `npm run preview` also stays cross-origin isolated.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
