import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  type CompactModelDef,
} from '@runanywhere/web'

import { LlamaCPP } from '@runanywhere/web-llamacpp'

// The ID we load throughout the app. Exported so App.tsx never has to
// hard-code the string.
export const MODEL_ID = 'lfm2-350m-q4_k_m'

// The catalog of models the SDK is allowed to load. We register just one:
// LiquidAI's LFM2-350M, a small (~250MB, 4-bit quantized) chat model that
// runs comfortably in the browser.
const MODELS: CompactModelDef[] = [
  {
    id: MODEL_ID,
    name: 'LFM2 350M Q4_K_M',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
]

// initSDK() is memoized: React StrictMode (and generally any accidental
// double-invocation) will only ever trigger one real initialization.
let _initPromise: Promise<void> | null = null

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    // 1. Boot the SDK runtime.
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: true,
    })
    // 2. Register the llama.cpp WASM backend. This is what actually runs the
    //    model — and it auto-selects WebGPU when available, CPU otherwise.
    await LlamaCPP.register()
    // 3. Tell the SDK which models exist and how to fetch them.
    RunAnywhere.registerModels(MODELS)
  })()
  return _initPromise
}

export { RunAnywhere, ModelManager, ModelCategory, LlamaCPP }
