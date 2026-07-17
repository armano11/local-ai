import { useEffect, useRef, useState } from 'react'
import { initSDK, RunAnywhere, LlamaCPP, MODEL_ID } from './lib/runanywhere'

// ---- Types -----------------------------------------------------------------

interface Metrics {
  latencyMs: number
  tokensPerSecond: number
  hardwareUsed: string
}

interface Message {
  role: 'user' | 'assistant'
  text: string
  metrics?: Metrics
}

// A cancelled generation surfaces as either a rejected promise or a resolved
// result whose finishReason is "cancelled". We detect both structurally so we
// never show a scary error when the user simply pressed "Stop".
function isCancellation(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  const haystack = `${v.code ?? ''} ${v.message ?? ''} ${v.finishReason ?? ''}`
  return /cancel/i.test(haystack)
}

// ---- Component --------------------------------------------------------------

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sdkReady, setSdkReady] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hardware, setHardware] = useState<string | null>(null)

  // WebGPU availability is a static browser capability — checked once.
  const [webgpuAvailable] = useState<boolean>(
    () => typeof navigator !== 'undefined' && 'gpu' in navigator,
  )

  const scrollRef = useRef<HTMLDivElement>(null)

  // Initialize the SDK once, on mount.
  useEffect(() => {
    let cancelled = false
    initSDK()
      .then(() => {
        if (!cancelled) setSdkReady(true)
      })
      .catch((err) => {
        console.error('SDK init failed:', err)
        if (!cancelled) {
          setError(
            'Your browser may not support WebAssembly. Try Chrome or Edge.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Keep the message list pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, generating])

  // ---- Actions --------------------------------------------------------------

  async function handleLoadModel() {
    setError(null)
    setLoadingModel(true)
    setDownloadProgress(0)
    try {
      // Download the model file (~250MB) — cached in OPFS after the first run.
      await RunAnywhere.downloadModel({
        modelId: MODEL_ID,
        onProgress: (progress) => {
          const pct =
            progress.totalBytes > 0
              ? (progress.bytesDownloaded / progress.totalBytes) * 100
              : progress.stageProgress * 100
          setDownloadProgress(Math.min(100, Math.max(0, pct)))
        },
      })

      // Load the downloaded weights into the inference backend.
      await RunAnywhere.loadModel({
        modelId: MODEL_ID,
        forceReload: false,
        validateAvailability: true,
      })

      // Report which backend the WASM runtime chose.
      const mode = LlamaCPP.isRegistered
        ? LlamaCPP.accelerationMode
        : webgpuAvailable
          ? 'webgpu'
          : 'cpu'
      setHardware(mode)
      setModelLoaded(true)
      setDownloadProgress(100)
    } catch (err) {
      console.error('Model load failed:', err)
      setError('Failed to download model. Check connection.')
    } finally {
      setLoadingModel(false)
    }
  }

  async function handleSend() {
    const prompt = input.trim()
    if (!prompt || generating || !modelLoaded) return

    setError(null)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text: prompt }])
    setGenerating(true)

    try {
      const result = await RunAnywhere.generate({
        prompt,
        maxTokens: 256,
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant. Be concise and clear.',
      })

      // The user may have pressed Stop; the backend can return a partial
      // result flagged with finishReason "cancelled".
      if (isCancellation(result)) {
        console.info('Generation cancelled by user.')
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result.text,
          metrics: {
            latencyMs: result.generationTimeMs,
            tokensPerSecond: result.tokensPerSecond,
            hardwareUsed: hardware ?? result.framework ?? 'cpu',
          },
        },
      ])
    } catch (err) {
      if (isCancellation(err)) {
        console.info('Generation cancelled by user.')
      } else {
        console.error('Generation failed:', err)
        setError('Generation failed. Try a shorter prompt.')
      }
    } finally {
      setGenerating(false)
    }
  }

  function handleStop() {
    RunAnywhere.cancelGeneration()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---- Derived UI state -----------------------------------------------------

  const statusText = !sdkReady
    ? 'Initializing SDK…'
    : modelLoaded
      ? `Ready — running on ${hardware === 'webgpu' ? 'WebGPU' : 'CPU'}`
      : loadingModel
        ? `Downloading model… ${downloadProgress.toFixed(0)}%`
        : 'SDK ready — load the model to begin'

  // ---- Render ---------------------------------------------------------------

  return (
    <div className="flex h-screen w-full flex-col bg-gray-900 text-gray-100">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4">
        {/* Header */}
        <header className="pt-6 pb-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Local AI Chat
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Powered by RunAnywhere — runs entirely in your browser
          </p>
        </header>

        {/* Status bar */}
        <section className="mb-3 rounded-lg border border-gray-800 bg-gray-800/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm text-gray-300">
              <span
                className={
                  'inline-block h-2 w-2 rounded-full ' +
                  (modelLoaded
                    ? 'bg-green-500'
                    : loadingModel
                      ? 'bg-yellow-400 animate-pulse'
                      : sdkReady
                        ? 'bg-blue-400'
                        : 'bg-gray-500 animate-pulse')
                }
              />
              {statusText}
            </span>

            {sdkReady && !modelLoaded && !loadingModel && (
              <button
                onClick={handleLoadModel}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                Load Model
              </button>
            )}
          </div>

          {/* Download progress bar */}
          {loadingModel && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-500 transition-[width] duration-200 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}

          {/* WebGPU warning */}
          {sdkReady && !webgpuAvailable && (
            <p className="mt-2 text-xs text-yellow-400">
              WebGPU not detected — inference will run on CPU (slower). For best
              performance, use Chrome or Edge.
            </p>
          )}
        </section>

        {/* Message list */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto py-2">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">
              {modelLoaded
                ? 'Say hello — your message never leaves this device.'
                : 'Load the model, then start chatting.'}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={
                'flex flex-col ' +
                (m.role === 'user' ? 'items-end' : 'items-start')
              }
            >
              <div
                className={
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ' +
                  (m.role === 'user'
                    ? 'rounded-br-sm bg-blue-600 text-white'
                    : 'rounded-bl-sm bg-gray-800 text-gray-100')
                }
              >
                {m.text}
              </div>
              {m.metrics && (
                <div className="mt-1 px-1 text-xs text-gray-500">
                  {m.metrics.latencyMs.toFixed(0)}ms ·{' '}
                  {m.metrics.tokensPerSecond.toFixed(1)} tok/s ·{' '}
                  {m.metrics.hardwareUsed === 'webgpu' ? 'WebGPU' : 'CPU'}
                </div>
              )}
            </div>
          ))}

          {generating && (
            <div className="flex items-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-gray-800 px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-gray-500" />
              </div>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="shrink-0 rounded px-2 text-red-400 hover:text-red-200"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="mb-5 mt-1 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!modelLoaded || generating}
            placeholder={
              modelLoaded ? 'Type a message…' : 'Load the model first…'
            }
            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {generating ? (
            <button
              onClick={handleStop}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!modelLoaded || !input.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
