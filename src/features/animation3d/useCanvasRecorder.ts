import { useRef, useState } from 'react'

export interface RecorderState {
  recording: boolean
  durationMs: number
}

/**
 * Records a stream from a <canvas> element via MediaRecorder API.
 *
 * Use case in Web2Print: capture the Fabric canvas (which also receives the
 * Three.js overlay composited via the browser compositor) into a WebM file
 * the user can download or send to the HyperFrames render pipeline.
 *
 * Browser support: Chrome/Edge support canvas.captureStream() + MediaRecorder
 * with codecs="vp9" or "vp8". Safari supports MediaRecorder since 14.1.
 */
export function useCanvasRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef<number>(0)
  const [state, setState] = useState<RecorderState>({ recording: false, durationMs: 0 })

  /**
   * Start recording the given canvas at the requested framerate.
   * @returns the MediaRecorder instance or null on failure.
   */
  const start = (canvas: HTMLCanvasElement, fps = 30, bitsPerSecond = 8_000_000): MediaRecorder | null => {
    if (recorderRef.current) return recorderRef.current
    const stream = (canvas as any).captureStream?.(fps) as MediaStream | undefined
    if (!stream) {
      console.warn('[CanvasRecorder] canvas.captureStream not supported')
      return null
    }

    // Prefer VP9 (better quality at same bitrate); fall back to VP8 if needed
    let mimeType = 'video/webm;codecs=vp9'
    if (typeof MediaRecorder === 'undefined') return null
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8'
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      console.warn('[CanvasRecorder] No supported WebM MIME type found')
      return null
    }

    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond })
    } catch (e) {
      console.error('[CanvasRecorder] Failed to construct MediaRecorder:', e)
      return null
    }

    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.start(100)
    recorderRef.current = recorder
    startedAtRef.current = performance.now()
    setState({ recording: true, durationMs: 0 })

    // Tick to update durationMs in state
    const tick = () => {
      if (!recorderRef.current) return
      setState((s) => ({ recording: true, durationMs: performance.now() - startedAtRef.current }))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    return recorder
  }

  /**
   * Stop recording and resolve with a Blob (WebM) when assembly is complete.
   * Returns null if no recording was in progress.
   */
  const stop = (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    if (!recorder) return Promise.resolve(null)
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        chunksRef.current = []
        recorderRef.current = null
        setState({ recording: false, durationMs: 0 })
        resolve(blob)
      }
      recorder.stop()
    })
  }

  /**
   * Convenience: stop and trigger a browser download.
   */
  const stopAndDownload = async (filename = 'web2print-animation.webm') => {
    const blob = await stop()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return { ...state, start, stop, stopAndDownload }
}
