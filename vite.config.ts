import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works on GitHub Pages (served from a subpath)
  // as well as on Vercel (served from root).
  base: './',
  optimizeDeps: {
    // The RunAnywhere packages ship WASM + workers; pre-bundling them keeps
    // dev-server startup fast and avoids duplicate module instances.
    include: ['@runanywhere/web', '@runanywhere/web-llamacpp'],
  },
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
