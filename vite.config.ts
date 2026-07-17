import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works on GitHub Pages (served from a subpath)
  // as well as on Vercel (served from root).
  base: './',
  // The RunAnywhere packages locate their WASM binaries at runtime via
  // `new URL('../../wasm/racommons.js', import.meta.url)`. Vite's dependency
  // pre-bundling rewrites `import.meta.url` to point inside `.vite/deps/`,
  // which breaks that relative lookup and makes SDK init fail (blank page).
  // Excluding them keeps `import.meta.url` pointed at the real package dir.
  optimizeDeps: {
    exclude: ['@runanywhere/web', '@runanywhere/web-llamacpp'],
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
