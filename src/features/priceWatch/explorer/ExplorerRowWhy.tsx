// Le POURQUOI de l'indice, lu à même la ligne — et non caché derrière une infobulle.
//
// L'infobulle du badge dit déjà tout, mais elle ne se lit qu'une ligne à la fois, en
// visant un badge de 9 px. Or l'écran sert à trier des centaines d'appariements : ce qui
// décide (« clé courte », « familles incompatibles », « photos divergentes ») doit se
// balayer verticalement. L'infobulle RESTE en place : elle porte la forme longue, qui
// explique le cas, là où cette ligne ne fait que le NOMMER.
//
// Composant à part, pas quelques lignes de plus dans `ExplorerRow` : ce fichier-là est
// déjà le plus gros du dossier, et les tables de libellés vivent hors des composants qui
// les affichent (cf. `doubtLabels.ts`).
import { DOUBT_SHORT } from './doubtLabels'
import type { Confidence, SupportReason } from './confidence'
import type { StoredVisual } from '../visual/visualStore'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

/** Forme COURTE de la preuve. La longue tient en une phrase (« référence retrouvée dans
 *  le libellé du concurrent — la preuve la plus faible… ») : elle explique, et reste dans
 *  l'infobulle. Ici on énumère, donc on nomme. */
const EVIDENCE_SHORT: Record<string, TranslationKey> = {
  gtin13: 'pwx.proof.short.gtin13',
  'ean-in-url': 'pwx.proof.short.eanInUrl',
  sku: 'pwx.proof.short.sku',
  mpn: 'pwx.proof.short.mpn',
  'ref-in-name': 'pwx.proof.short.refInName',
  'ref-in-url': 'pwx.proof.short.refInUrl',
  'ref-in-title': 'pwx.proof.short.refInTitle',
}

/** Idem pour les renforts : ce qui a fait MONTER le score, en trois mots. */
const SUPPORT_SHORT: Record<SupportReason, TranslationKey> = {
  'ean-echo': 'pwx.support.short.eanEcho',
  'ref-echo': 'pwx.support.short.refEcho',
  'title-echo': 'pwx.support.short.titleEcho',
  'second-key': 'pwx.support.short.secondKey',
  'visual-echo': 'pwx.support.short.visualEcho',
}

/** Les deux valeurs qu'un motif de CONTRADICTION oppose. Les nommer est le seul moyen de
 *  trancher : « codes-barres divergents » ne dit pas si le concurrent publie un vrai code
 *  fabricant ou son propre code interne — et cette différence-là décide si l'appariement
 *  est faux ou si c'est le démenti qui ne vaut rien. Les valeurs sont montrées TELLES QUE
 *  PUBLIÉES : c'est sous cette forme qu'on les retrouve sur les deux fiches. */
function conflictValues(
  reason: string,
  sides: { sourceEan?: string | null; listingEan?: string | null; sourceRef?: string | null; listingRef?: string | null },
): { mine: string; theirs: string } | null {
  const pair = reason === 'ean-conflict'
    ? [sides.sourceEan, sides.listingEan]
    : reason === 'ref-conflict' ? [sides.sourceRef, sides.listingRef] : null
  if (!pair) return null
  const [mine, theirs] = pair.map((v) => String(v ?? '').trim())
  return mine && theirs ? { mine, theirs } : null
}

/** Libellé d'une nature commerciale. `unknown` n'est jamais affiché : la ligne n'apparaît
 *  que lorsque les DEUX côtés ont parlé. */
function natureLabel(n: string): TranslationKey {
  return n === 'origin' ? 'pwx.nature.origin' : 'pwx.nature.aftermarket'
}

export function ExplorerRowWhy({ confidence, proof, visual, sides, claims, natures }: {
  confidence: Confidence | null
  proof: { evidence: string; keyValue: string; isEan: boolean } | null
  visual?: StoredVisual | null
  /** Les valeurs comparées, pour NOMMER ce qui se contredit. */
  sides: { sourceEan?: string | null; listingEan?: string | null; sourceRef?: string | null; listingRef?: string | null }
  /** Les produits F1 qui se disputent la fiche — le premier est celui qui l'a emportée. */
  claims?: { ref: string; origin: boolean }[]
  /** Natures opposées affirmées de part et d'autre (adaptable ↔ pièce d'origine). */
  natures?: { mine: string; theirs: string }
}) {
  const { t } = useTranslation()
  const proofKey = proof ? EVIDENCE_SHORT[proof.evidence] : undefined
  const doubts = confidence?.doubts ?? []
  const supports = confidence?.supports ?? []
  const note = visual?.note?.trim() || null
  const hasReasons = Boolean(proofKey) || doubts.length > 0 || supports.length > 0
  // Les adaptables qui ont CÉDÉ la fiche. Uniquement quand le litige est tranché : tant
  // qu'il porte le doute « fiche contestée », c'est ce libellé-là qui nomme les rivaux.
  const yielded = doubts.includes('contested') ? [] : (claims ?? []).filter((c) => c.origin)
  if (!hasReasons && !note && yielded.length === 0) return null

  // Un doute sur une ligne DÉJÀ douteuse se lit en rose, comme sa bande : deux couleurs
  // pour le même état enverraient deux signaux là où il n'y en a qu'un.
  const doubtTone = confidence?.band === 'doubt' ? 'text-rose-300/80' : 'text-amber-300/80'

  return (
    <div className="mt-1 space-y-0.5 text-[10px] leading-snug">
      {hasReasons && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {proofKey && (
            <span className="text-white/40">{t('pwx.trust.proof', { what: t(proofKey) })}</span>
          )}
          {doubts.map((d) => {
            const v = conflictValues(d, sides)
            const rivals = d === 'contested' && claims?.length
              ? claims
                  .map((c) => `${c.ref} (${t(c.origin ? 'pwx.why.claim.origin' : 'pwx.why.claim.direct')})`)
                  .join(' · ')
              : null
            return (
              <span key={d} className={doubtTone}>
                ⚠ {v
                  ? t('pwx.why.conflictValues', { label: t(DOUBT_SHORT[d]), mine: v.mine, theirs: v.theirs })
                  : rivals
                    ? t('pwx.why.detail', { label: t(DOUBT_SHORT[d]), detail: rivals })
                    : t(DOUBT_SHORT[d])}
              </span>
            )
          })}
          {supports.map((s) => (
            <span key={s} className="text-emerald-300/60">+ {t(SUPPORT_SHORT[s])}</span>
          ))}
        </div>
      )}
      {/* ⚠ ADAPTABLE face à PIÈCE D'ORIGINE. L'appariement est bon — c'est la même
          référence — mais l'écart de prix ne mesure alors pas un positionnement : il
          mesure l'écart entre une pièce constructeur et son équivalent. Le dire est la
          seule façon d'éviter une décision tarifaire prise sur une comparaison biaisée. */}
      {natures && (
        <div className="text-amber-200/70">
          {t('pwx.why.nature', {
            mine: t(natureLabel(natures.mine)), theirs: t(natureLabel(natures.theirs)),
          })}
        </div>
      )}
      {/* Le litige TRANCHÉ, dit en clair — et sans le compter comme un doute. Depuis que
          la pièce d'origine l'emporte sur les adaptables qui la citent, ces lignes ne
          portent plus « fiche contestée » : sans cette note, l'arbitrage deviendrait
          invisible, alors que c'est LUI qui explique pourquoi cette fiche est en face de
          ce produit-ci et pas de l'autre. */}
      {yielded.length > 0 && (
        <div className="text-white/35">
          {t('pwx.why.arbitrated', { list: yielded.map((c) => c.ref).join(' · ') })}
        </div>
      )}
      {/* ⚠ La note vient d'un modèle : sa longueur n'est pas bornée. Sans le clamp, une
          seule ligne d'analyse bavarde repousse tout l'écran vers le bas. Le texte entier
          reste accessible à la souris. */}
      {note && (
        <div className="text-white/35 italic line-clamp-2" title={note}>
          {t('pwx.why.visual', { score: visual?.score ?? 0, note })}
        </div>
      )}
    </div>
  )
}
