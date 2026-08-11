// functions/src/priceWatch/textsSnapshot.ts
// ⚠ COPIE de src/features/priceWatch/ops/textsSnapshot.ts (bundles séparés : `functions/`
// est hermétique, `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textsSnapshotParity.test.ts.
// Ce qu'un passage de textes publie de lui-même. PUR.
import { detectLanguage } from '../textEnrich/detectLang'
import { langBreakdown } from './langBreakdown'
import type { EnrichUnit } from '../textEnrich/pass'
import type { EnrichKind } from '../textEnrich/revision'
import type { TextsProgress } from './opsProgress'

export interface TextsSnapshotInput {
  units: EnrichUnit[]
  considered: number
  alreadyDone: number
  done: number
  startedAt: number
  now: number
  origin: 'client' | 'server'
  /** Jamais traité / source modifiée depuis. Le mode PIM ne le rend pas : on l'omet
   *  plutôt que d'écrire deux zéros, qui se liraient comme « rien à faire ». */
  reasons?: { fresh: number; stale: number }
  /** Ce qui a fait rendre la main au passage : son budget, son temps imparti, ou la borne
   *  du nombre de champs. Omis tant que le passage tourne. */
  stoppedBy?: 'spend' | 'deadline' | 'units'
  /** Natures des vagues suivantes — connues d'avance, chiffrables seulement plus tard. */
  queued?: EnrichKind[]
}

export function textsSnapshot(input: TextsSnapshotInput): TextsProgress {
  const pending: TextsProgress['pending'] = {}
  for (const u of input.units) {
    const k = u.plan.kind
    pending[k] = (pending[k] ?? 0) + 1
  }
  // ⚠ Langues des seules unités à TRADUIRE : ailleurs la langue ne décide de rien, et la
  // calculer sur des centaines de milliers de champs serait du travail perdu.
  const toTranslate = input.units.filter((u) => u.plan.kind === 'translate')
  const byLang = toTranslate.length
    ? langBreakdown(toTranslate.map((u) => detectLanguage(u.text).lang ?? null))
    : undefined

  return {
    considered: input.considered,
    alreadyDone: input.alreadyDone,
    pending,
    ...(byLang ? { byLang } : {}),
    ...(input.reasons ? { reasons: input.reasons } : {}),
    ...(input.stoppedBy ? { stoppedBy: input.stoppedBy } : {}),
    ...(input.queued?.length ? { queued: input.queued } : {}),
    done: input.done,
    total: input.units.length,
    startedAt: input.startedAt,
    beatAt: input.now,
    origin: input.origin,
  }
}
