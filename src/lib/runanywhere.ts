import {
  RunAnywhere,
  SDKEnvironment,
  ModelCategory,
  InferenceFramework,
} from '@runanywhere/web'

import { LlamaCPP } from '@runanywhere/web-llamacpp'

// The ID we load throughout the app. Exported so App.tsx never has to
// hard-code the string.
export const MODEL_ID = 'lfm2-350m-q4_k_m'

// LiquidAI's LFM2-350M — a small (~250MB, 4-bit quantized) chat model that
// runs comfortably in the browser. We point the SDK straight at the GGUF file
// hosted on Hugging Face; the SDK downloads it on first use and caches it.
const MODEL_NAME = 'LFM2 350M Q4_K_M'
const MODEL_URL =
  'https://huggingface.co/LiquidAI/LFM2-350M-GGUF/resolve/main/LFM2-350M-Q4_K_M.gguf'

// initSDK() is memoized: React StrictMode (and generally any accidental
// double-invocation) will only ever trigger one real initialization.
let _initPromise: Promise<void> | null = null

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    // 1. Boot the SDK runtime.
    await RunAnywhere.initialize({
      environment: SDKEnvironment.SDK_ENVIRONMENT_DEVELOPMENT,
    })

    // 2. Register the llama.cpp WASM backend. This is what actually runs the
    //    model — 'auto' picks WebGPU when available, CPU otherwise.
    await LlamaCPP.register({ acceleration: 'auto' })

    // 3. Tell the SDK about our model and where to fetch it from. Nothing
    //    downloads yet — this just adds the entry to the registry.
    RunAnywhere.registerModel(
      MODEL_URL,
      MODEL_NAME,
      InferenceFramework.INFERENCE_FRAMEWORK_LLAMA_CPP,
      {
        id: MODEL_ID,
        modality: ModelCategory.MODEL_CATEGORY_LANGUAGE,
        memoryRequirement: 250_000_000,
      },
    )
  })()
  return _initPromise
}

export { RunAnywhere, ModelCategory, LlamaCPP }
