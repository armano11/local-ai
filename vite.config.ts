import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [react()],
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
