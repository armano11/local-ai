# Local AI Chat — Running an LLM Entirely in Your Browser

> A chat app where the AI lives on your machine. No cloud, no API keys, no server — the model downloads once and runs on your GPU via WebAssembly. Type a message, and every token is generated locally.

## 🔗 Live Demo

**[https://your-project.vercel.app](https://your-project.vercel.app)** _(replace with your Vercel URL after deploying — see [Deploying](#deploying))_

> Open it in **Chrome or Edge**, click **Load Model**, wait for the ~250MB download once, then chat. After that first download, it works even with your Wi-Fi turned off.

---

## What This Demonstrates

- **100% on-device inference** — the LLM runs inside your browser tab through llama.cpp compiled to WebAssembly. The prompt, the model, and every generated token stay on your device.
- **Zero cloud dependency** — there's no backend, no inference API, and nothing to bill. After the model file is cached, the app makes **no network calls at all**.
- **Privacy by default** — because nothing is sent anywhere, this is a viable pattern for sensitive text (medical notes, legal drafts, internal docs) that can't leave a machine.

---

## Quick Start (3 steps)

```bash
# 1. Clone
git clone https://github.com/<your-username>/local-ai-chat.git
cd local-ai-chat

# 2. Install
npm install

# 3. Run
npm run dev
```

Then open **http://localhost:5173** and click **Load Model**.

> **Use Chrome or Edge.** These browsers ship WebGPU, which the SDK uses to run inference on your GPU. Other browsers still work, but they fall back to CPU (noticeably slower). The app detects this and shows a warning.

---

## How It Works

The entire app is two files: `src/lib/runanywhere.ts` (SDK setup) and `src/App.tsx` (all the UI and chat logic). Here's what each piece of the SDK is doing.

### 1. SDK Initialization

Before you can load a model or generate text, three things have to happen: the SDK runtime boots, the inference backend registers itself, and you tell the SDK which models exist. We do all of this once, memoized behind a promise so React's StrictMode can't trigger it twice.

```typescript
// src/lib/runanywhere.ts
import { RunAnywhere, SDKEnvironment, LLMFramework, ModelCategory } from '@runanywhere/web'
import { LlamaCPP } from '@runanywhere/web-llamacpp'

export async function initSDK(): Promise<void> {
  // 1. Boot the SDK runtime.
  await RunAnywhere.initialize({
    environment: SDKEnvironment.Development,
    debug: true,
  })

  // 2. Register the llama.cpp WASM backend. This is what actually runs the
  //    model, and it auto-picks WebGPU when available, CPU otherwise.
  await LlamaCPP.register()

  // 3. Tell the SDK which models exist and where to fetch them from.
  RunAnywhere.registerModels(MODELS)
}
```

What each call does:

- **`RunAnywhere.initialize(...)`** — spins up the SDK's internal state. `SDKEnvironment.Development` and `debug: true` give you verbose console logging, which is exactly what you want while building.
- **`LlamaCPP.register()`** — loads the llama.cpp WebAssembly backend. This is the engine. Registering it also probes the browser for WebGPU support and configures acceleration accordingly. The WASM binary loads automatically here — you don't manage it yourself.
- **`RunAnywhere.registerModels(MODELS)`** — hands the SDK a catalog of `CompactModelDef` entries. Each entry says "this model ID maps to this GGUF file in this Hugging Face repo, run it with this framework." Nothing downloads yet — this is just the manifest.

Our catalog has one model: [LiquidAI's LFM2-350M](https://huggingface.co/LiquidAI/LFM2-350M-GGUF), a small 4-bit-quantized chat model that's a great fit for the browser.

### 2. Model Loading & Download Progress

The model file (~250MB) downloads the **first time** you call `loadModel`. The SDK caches it in the browser's **IndexedDB**, so the second visit — and every visit after — loads it instantly from disk with no network.

```typescript
// src/App.tsx
await ModelManager.loadModel(MODEL_ID, {
  onProgress: (progress: {
    downloadedBytes: number
    totalBytes: number
    percentage: number
  }) => {
    setDownloadProgress(progress.percentage)
  },
})
```

The `onProgress` callback fires repeatedly as bytes arrive. We pipe `progress.percentage` straight into React state to drive the progress bar:

```tsx
{loadingModel && (
  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-700">
    <div
      className="h-full bg-blue-500 transition-[width]"
      style={{ width: `${downloadProgress}%` }}
    />
  </div>
)}
```

Once `loadModel` resolves, we ask the backend which hardware it settled on:

```typescript
const mode = LlamaCPP.isRegistered ? LlamaCPP.accelerationMode : 'cpu'
// mode is 'webgpu' or 'cpu'
```

…and show `Ready — running on WebGPU`.

### 3. Text Generation

Generation is a single async call. No streaming, no websockets — you `await` the whole response and get back the text plus a rich set of metrics.

```typescript
// src/App.tsx
import { TextGeneration } from '@runanywhere/web'

const result = await TextGeneration.generate(prompt, {
  maxTokens: 256,
  temperature: 0.7,
  systemPrompt: 'You are a helpful assistant. Be concise and clear.',
})
```

**The options** we use:

| Option         | Value                     | What it does                                            |
| -------------- | ------------------------- | ------------------------------------------------------- |
| `maxTokens`    | `256`                     | Caps response length so replies stay snappy.            |
| `temperature`  | `0.7`                     | Balances coherence vs. creativity (0 = deterministic).  |
| `systemPrompt` | `"...Be concise..."`      | Steers the model's persona and style.                   |

Other available options include `topP`, `topK`, `stopSequences`, and `streamingEnabled` — we keep to the essentials here.

**The result** carries everything you need to show the user what just happened:

```typescript
result.text               // the generated reply
result.latencyMs          // total round-trip time in ms
result.tokensPerSecond    // generation speed (higher = faster hardware)
result.timeToFirstTokenMs // how long until the first token appeared
result.responseTokens     // tokens generated
result.hardwareUsed       // 'webgpu' or 'cpu'
result.modelUsed          // the model ID that answered
```

We render the three most meaningful ones under each AI message:

```tsx
<div className="text-xs text-gray-500">
  {result.latencyMs.toFixed(0)}ms · {result.tokensPerSecond.toFixed(1)} tok/s · {hardware}
</div>
// → "412ms · 38.6 tok/s · WebGPU"
```

**Stopping mid-generation.** While a response is streaming out of the model, the Send button becomes a Stop button:

```typescript
TextGeneration.cancel()
// The pending generate() promise rejects with an SDKError
// whose code is GenerationCancelled.
```

We catch that specific rejection and treat it as a no-op — the user chose to stop, so there's no error to show:

```typescript
try {
  const result = await TextGeneration.generate(prompt, options)
  // ...append the assistant message
} catch (err) {
  if (isCancellation(err)) {
    // user pressed Stop — nothing to surface
  } else {
    setError('Generation failed. Try a shorter prompt.')
  }
}
```

### 4. What's Happening Under the Hood

Here's the full flow of a single message. Notice where the network is — and where it isn't.

```
                        ┌─────────────────────────────────────────┐
                        │              Your Browser Tab            │
                        │                                          │
   You type a message   │   ┌──────────────┐                      │
   ───────────────────► │   │   App.tsx    │                      │
                        │   │  (React UI)  │                      │
                        │   └──────┬───────┘                      │
                        │          │ TextGeneration.generate()    │
                        │          ▼                              │
                        │   ┌──────────────────┐                 │
                        │   │  RunAnywhere SDK  │                 │
                        │   └────────┬─────────┘                 │
                        │            │                            │
                        │            ▼                            │
                        │   ┌────────────────────────┐           │
                        │   │  llama.cpp  (WASM)      │           │
                        │   │  + LFM2-350M weights    │           │
                        │   │  (loaded from IndexedDB)│           │
                        │   └───────────┬────────────┘           │
                        │               │ runs on...              │
                        │        ┌──────┴───────┐                 │
                        │        ▼              ▼                 │
                        │   ┌─────────┐    ┌─────────┐            │
                        │   │ WebGPU  │ or │   CPU   │            │
                        │   │  (GPU)  │    │         │            │
                        │   └────┬────┘    └────┬────┘            │
                        │        └──────┬───────┘                 │
                        │               ▼                         │
                        │      generated tokens ──► back to UI    │
                        └─────────────────────────────────────────┘

   The ONLY network request in this entire app is the one-time
   model download. After that, this box is fully self-contained —
   turn off your Wi-Fi and it still answers.
```

The prompt never touches a server. The model weights sit in your browser's IndexedDB. Inference happens in a WASM module running on your GPU (or CPU). The generated text goes straight back to the React state. That's the whole loop.

---

## Project Structure

```
local-ai-chat/
├── index.html              # HTML shell; sets <html class="dark"> and page meta
├── package.json            # Deps: react, @runanywhere/web, @runanywhere/web-llamacpp
├── vite.config.ts          # React plugin + COOP/COEP headers for WASM threads
├── tailwind.config.js      # Tailwind config, dark mode via class
├── postcss.config.js       # Tailwind + Autoprefixer
├── tsconfig.json           # Strict TypeScript, react-jsx
├── vercel.json             # Zero-config Vercel deploy (Vite framework)
└── src/
    ├── main.tsx            # React entry point, mounts <App /> to #root
    ├── index.css           # Tailwind directives + dark scrollbar styles
    ├── App.tsx             # ALL UI + chat logic (state, generation, metrics)
    └── lib/
        └── runanywhere.ts  # SDK init: initialize → register backend → register models
```

---

## Tech Stack

- **[React 18](https://react.dev/)** — UI, all in a single `App.tsx`.
- **[Vite](https://vitejs.dev/)** — dev server and build tool. Fast, zero-fuss.
- **[TypeScript](https://www.typescriptlang.org/)** — strict mode, fully typed.
- **[Tailwind CSS](https://tailwindcss.com/)** — dark, minimal styling.
- **[RunAnywhere Web SDK](https://docs.runanywhere.ai)** — on-device model management and inference.
- **[LFM2-350M](https://huggingface.co/LiquidAI/LFM2-350M-GGUF)** — a small, fast, 4-bit-quantized chat model from LiquidAI.

---

## Deploying

### Vercel (recommended — zero config)

```bash
npm i -g vercel   # if you don't have the CLI
vercel --prod
```

Vercel auto-detects Vite from `vercel.json` and builds with `npm run build`. The `vercel.json` in this repo also sets the **`Cross-Origin-Opener-Policy`** and **`Cross-Origin-Embedder-Policy`** headers in production — these are required for the WASM backend's multi-threaded (`SharedArrayBuffer`) inference, so don't remove them.

### GitHub Pages

Vite is already configured with `base: './'`, so the built app works from a subpath.

```bash
npm run build          # outputs to dist/
npx gh-pages -d dist   # publishes dist/ to the gh-pages branch
```

> **Heads-up on GitHub Pages:** Pages can't set custom response headers, so it may not serve the COOP/COEP headers the WASM threads want. If inference misbehaves there, prefer Vercel (which sets them via `vercel.json`).

---

## About RunAnywhere

[RunAnywhere](https://docs.runanywhere.ai) (YC W26) builds on-device AI infrastructure — SDKs that run large language models locally on the web, iOS, and Android instead of in the cloud. Their Web SDK compiles llama.cpp to WebAssembly so a model can run entirely in a browser tab, with WebGPU acceleration and no server round-trips. Read the docs at **[docs.runanywhere.ai](https://docs.runanywhere.ai)**.

> The Web SDK is in early beta (`v0.1.x`). If `npm install` can't resolve the RunAnywhere packages, check the [official starter app](https://github.com/RunanywhereAI/runanywhere-sdks/tree/main/examples/web/RunAnywhereAI) for the currently published version numbers and update `package.json` accordingly.

---

## License

MIT
