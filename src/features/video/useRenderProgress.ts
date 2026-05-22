import { useEffect, useState } from 'react'
import type { GenerateVideoStep } from './useGenerateVideo'
import type { StepInfo } from './RenderProgress'

const PENDING: StepInfo = { status: 'pending' }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function aspectLabel(a: GenerateVideoStep['aspect']): string {
  if (a === 'portrait') return '1080×1920 · 9:16'
  if (a === 'landscape') return '1920×1080 · 16:9'
  return '1080×1080 · 1:1'
}

export function useRenderProgress() {
  const [capture, setCapture] = useState<StepInfo>(PENDING)
  const [extract, setExtract] = useState<StepInfo>(PENDING)
  const [compose, setCompose] = useState<StepInfo>(PENDING)
  const [render, setRender] = useState<StepInfo>(PENDING)
  const [logs, setLogs] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())

  const ticking =
    capture.status === 'active' ||
    extract.status === 'active' ||
    compose.status === 'active' ||
    render.status === 'active'

  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [ticking])

  const reset = () => {
    setCapture(PENDING)
    setExtract(PENDING)
    setCompose(PENDING)
    setRender(PENDING)
    setLogs([])
  }

  const update = (s: GenerateVideoStep) => {
    const ts = Date.now()
    if (s.step === 'capturing') {
      setCapture({ status: 'active', startedAt: ts })
      setLogs(['→ Export SVG du canvas Fabric (toSVG + embed images)'])
    } else if (s.step === 'composing') {
      setCompose({ status: 'active', startedAt: ts })
      // Mode standalone multi-scene : log différencié selon présence de la composition.
      if (s.composition) {
        const sceneCount = s.composition.scenes.length
        const types = s.composition.scenes.map((sc) => sc.type).join(' → ')
        setLogs((l) => [...l, `✓ Composition générée : ${sceneCount} scènes (${types})`])
      } else {
        setLogs((l) => [...l, '→ Composition de la séquence multi-scènes'])
      }
    } else if (s.step === 'extracting') {
      setCapture((c) => (c.status === 'active' ? { ...c, status: 'done', finishedAt: ts } : c))
      setExtract({ status: 'active', startedAt: ts })
      const count = s.filesCount ?? 0
      setLogs((l) => [
        ...l,
        `⟳ Gemini multimodal lit ${count} fichier${count > 1 ? 's' : ''} → contexte brief`,
      ])
    } else if (s.step === 'interpreting') {
      setExtract((e) => (e.status === 'active' ? { ...e, status: 'done', finishedAt: ts } : e))
      if (s.fileContext) {
        const preview = s.fileContext.replace(/\s+/g, ' ').slice(0, 120)
        setLogs((l) => [...l, `✓ Contexte extrait : "${preview}${s.fileContext!.length > 120 ? '…' : ''}"`])
      }
      if (s.skippedFiles?.length) {
        setLogs((l) => [
          ...l,
          ...s.skippedFiles!.map((sk) => `⚠ ${sk.name} ignoré : ${sk.reason}`),
        ])
      }
      setLogs((l) => [...l, '⟳ Gemini interprète le brief → composition multi-scènes'])
    } else if (s.step === 'rendering') {
      setCapture((c) => (c.status === 'active' ? { ...c, status: 'done', finishedAt: ts } : c))
      setExtract((e) => (e.status === 'active' ? { ...e, status: 'done', finishedAt: ts } : e))
      setCompose((co) => (co.status === 'active' ? { ...co, status: 'done', finishedAt: ts } : co))
      setRender({ status: 'active', startedAt: ts })

      const isMultiScene = !!s.composition
      const template = isMultiScene
        ? `multi-scene-${s.aspect ?? 'auto'}`
        : `design-reveal-${s.aspect ?? 'auto'}`

      const extraLogs: string[] = []
      if (s.bytes) extraLogs.push(`✓ SVG uploadé vers Storage (${formatBytes(s.bytes)})`)
      if (s.styleConfig) {
        extraLogs.push(
          `✓ styleConfig : pace=${s.styleConfig.pace} · ${s.styleConfig.palette.bg}/${s.styleConfig.palette.accent}`,
        )
      }
      if (s.composition) {
        const total = s.composition.scenes.reduce((acc, sc) => acc + sc.duration, 0)
        extraLogs.push(
          `✓ palette ${s.composition.palette.bg}/${s.composition.palette.accent} · ${total.toFixed(1)}s total`,
        )
      }

      setLogs((l) => [
        ...l,
        ...extraLogs,
        `→ POST /render → ${template}`,
        `⟳ Annimation render — ${aspectLabel(s.aspect)} · 24fps · draft`,
        isMultiScene
          ? '⟳ GSAP enchaîne les scènes avec fade-in/fade-out par segment'
          : '⟳ GSAP anime <text> / <image> / <path> par phase',
      ])
    } else if (s.step === 'done') {
      setRender((r) => (r.startedAt ? { ...r, status: 'done', finishedAt: ts } : r))
      setLogs((l) => [...l, '✓ MP4 encodé + URL signée (valable 7j)'])
    } else if (s.step === 'error') {
      setRender((r) => (r.status === 'active' ? { ...r, status: 'error', finishedAt: ts } : r))
      setCompose((co) => (co.status === 'active' ? { ...co, status: 'error', finishedAt: ts } : co))
      setExtract((e) => (e.status === 'active' ? { ...e, status: 'error', finishedAt: ts } : e))
      setCapture((c) => (c.status === 'active' ? { ...c, status: 'error', finishedAt: ts } : c))
      setLogs((l) => [...l, '✗ Échec du rendu'])
    }
  }

  return { capture, extract, compose, render, logs, now, reset, update }
}
