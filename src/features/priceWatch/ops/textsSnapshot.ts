// Ce qu'un passage de textes publie de lui-même. PUR.
import { detectLanguage } from '@/features/textEnrich/detectLang'
import { langBreakdown } from '../textEnrich/langBreakdown'
import type { EnrichUnit } from '@/features/textEnrich/pass'
import type { TextsProgress } from './opsTypes'

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
    done: input.done,
    total: input.units.length,
    startedAt: input.startedAt,
    beatAt: input.now,
    origin: input.origin,
  }
}
