// Un visuel du module, monté sur un jeu d'exemple. C'est l'illustration de la documentation
// — celle de l'aide intégrée comme celle du PDF, qui la photographie.
//
// ⚠⚠ Le composant RÉEL est monté, jamais une image ni un schéma : une documentation
// illustrée de captures figées décrit une application qui a peut-être changé depuis, et
// vieillit sans prévenir. Ici, un visuel qui change change son illustration.
import { TileVisual } from '../components/TileVisual'
import { SAMPLES, type SampleId } from './biDocSamples'
import type { Tile } from '../types'

const NO_TOOLTIPS: ReadonlySet<string> = new Set()
const noop = () => {}

export function BiVisualSample({ id, height = 230 }: { id: SampleId; height?: number }) {
  const sample = SAMPLES.find((s) => s.id === id)
  if (!sample) return null
  const tile: Tile = {
    id: `help-${id}`, kind: sample.kind, title: sample.name, options: sample.options,
    query: { source: 'watch.summary', measures: [{ id: 'x' }], dimensions: [], filters: [] },
  }
  return (
    <div data-shot={id} className="rounded-lg border border-white/10 bg-surface p-3"
      style={{ height: sample.height ?? height }}>
      <div style={{ height: (sample.height ?? height) - 24 }}>
        <TileVisual
          tile={tile} result={sample.result} accent="#6366f1"
          tooltipKeys={NO_TOOLTIPS} onPick={noop} onDrill={noop}
        />
      </div>
    </div>
  )
}
