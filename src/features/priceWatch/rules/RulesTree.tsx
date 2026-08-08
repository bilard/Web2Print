// L'arbre de décision de l'appariement : les trois étages dans l'ordre où le moteur les
// traverse, reliés, chacun portant son POIDS mesuré sur un vrai concurrent.
//
// ⚠ Pourquoi un arbre et non une liste de cases. Une liste laisse croire que les réglages
// sont indépendants et de même rang. Ils ne le sont pas : l'étage des clés décide de ce
// que l'étage des preuves peut voir, et les démentis ne s'appliquent qu'à ce que les deux
// premiers ont laissé passer. Un réglage amont rend un réglage aval sans objet, et cela
// doit se LIRE.
//
// ⚠ Ce que les nombres disent. « 812 » = appariements OBTENUS par cette voie, la boucle
// s'arrêtant au premier candidat accepté. Couper une voie ne déverse pas son compte dans
// la suivante : certains produits basculent sur une preuve plus faible, d'autres sont
// perdus. Seul l'aperçu avant/après le dit — d'où sa présence sous l'arbre.
import { MATCH_EVIDENCES, type MatchEvidence, type PairingRules } from '../catalog/pairingRules'
import type { VetoReason } from '../catalog/match'
import type { KeyBranch, PairingWeights } from '../pairingWeights'
import { formatFamilyLexicon, parseFamilyLexicon } from '../pairingRulesConfig'
import { useTranslation } from '@/lib/i18n'
import { Ban, Info } from 'lucide-react'

/** Explication longue, accessible au survol. L'écran garde une phrase courte : sur quatre
 *  étages, trois lignes de prose chacun repoussaient les réglages eux-mêmes hors de vue —
 *  et c'est sur eux qu'on vient. */
function Hint({ text }: { text: string }) {
  // `title` sur un <span> et non sur l'icône : les composants Lucide ne le transmettent
  // pas au SVG, et l'infobulle ne s'afficherait jamais.
  return (
    <span title={text} className="inline-flex shrink-0 cursor-help">
      <Info className="w-3 h-3 text-white/25 hover:text-white/60" />
    </span>
  )
}

const numCls = 'bg-well text-white text-[13px] rounded px-2 py-0.5 w-16 border border-white/10 focus:outline-none focus:border-white/25'

/** Barre de poids : la LARGEUR compare les branches d'un même étage entre elles. Sans
 *  elle, sept nombres alignés se lisent un par un au lieu de se comparer d'un coup. */
function Weight({ n, max, muted }: { n: number | undefined; max: number; muted?: boolean }) {
  if (n == null) return <span className="text-[11px] text-white/25 tabular-nums w-20 text-right shrink-0">—</span>
  const pct = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0
  return (
    <span className="flex items-center gap-1.5 w-20 shrink-0 justify-end">
      <span className="h-1 rounded-sm bg-[#6366f1]/60" style={{ width: `${pct}%`, maxWidth: '44px' }} />
      <span className={`text-[11px] tabular-nums ${muted ? 'text-white/30' : 'text-white/70'}`}>{n}</span>
    </span>
  )
}

/** Une branche de l'arbre : rang, libellé, contrôle, poids. Le trait vertical de gauche
 *  est ce qui fait tenir la hiérarchie visuellement. */
function Branch(
  { rank, label, hint, control, weight, dimmed }:
  { rank?: string; label: string; hint?: string; control?: React.ReactNode; weight?: React.ReactNode; dimmed?: boolean },
) {
  return (
    <div className={`flex items-baseline gap-2 pl-3 border-l border-white/10 py-0.5 ${dimmed ? 'opacity-45' : ''}`}>
      {rank && <span className="text-[11px] text-white/30 tabular-nums w-3 shrink-0">{rank}</span>}
      <span className="flex-1 min-w-0 truncate">
        <span className="text-[13px] text-white/85">{label}</span>
        {hint && <span className="text-[11px] text-white/35 ml-2">{hint}</span>}
      </span>
      {control}
      {weight}
    </div>
  )
}

function Stage(
  { step, title, subtitle, help, children, total }:
  {
    step: string; title: string; subtitle: string; help: string
    children: React.ReactNode; total?: React.ReactNode
  },
) {
  return (
    <section className="bg-surface rounded-lg px-3 py-2.5">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1.5">
        <span className="text-[11px] font-semibold text-[#6366f1] tabular-nums">{step}</span>
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
        {total}
        <span className="text-[11px] text-white/35">· {subtitle}</span>
        <Hint text={help} />
      </header>
      <div>{children}</div>
    </section>
  )
}

/** Flèche entre deux étages : ce qui SORT du précédent entre dans le suivant. */
function Flow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 pl-3 py-0.5">
      <span className="text-white/20 text-[11px]">↓</span>
      <span className="text-[11px] text-white/30">{label}</span>
    </div>
  )
}

const KEY_BRANCHES: { branch: KeyBranch; rank: string }[] = [
  { branch: 'ean', rank: '1' },
  { branch: 'ref', rank: '2' },
  { branch: 'ref-nozero', rank: '3' },
  { branch: 'origin', rank: '4' },
]

const VETOES: VetoReason[] = ['family', 'price-abyss', 'no-corroboration']

export function RulesTree(
  { rules, onChange, weights }:
  { rules: PairingRules; onChange: (next: PairingRules) => void; weights: PairingWeights | null },
) {
  const { t } = useTranslation()
  const set = (patch: Partial<PairingRules>) => onChange({ ...rules, ...patch })
  const maxKey = weights ? Math.max(1, ...Object.values(weights.byKey)) : 0
  const maxEv = weights ? Math.max(1, ...Object.values(weights.byEvidence)) : 0
  const maxVeto = weights ? Math.max(1, ...Object.values(weights.byVeto)) : 0

  return (
    <div className="space-y-1">
      {/* ÉTAGE 1 — les clés, dans leur ordre de priorité réel. */}
      <Stage
        step="①" title={t('pw.rules.tree.keys.title')} subtitle={t('pw.rules.tree.keys.subShort')} help={t('pw.rules.tree.keys.sub')}
        total={weights && <span className="text-[11px] text-white/40">{t('pw.rules.tree.keys.emitted', { n: weights.keysEmitted })}</span>}
      >
        {KEY_BRANCHES.map(({ branch, rank }) => (
          <Branch
            key={branch} rank={rank}
            label={t(`pw.rules.tree.key.${branch}` as 'pw.rules.tree.key.ean')}
            hint={branch === 'origin' ? t('pw.rules.tree.key.originHint') : undefined}
            dimmed={branch === 'origin' && !rules.useOriginRefs}
            control={branch === 'origin' ? (
              <input
                type="checkbox" checked={rules.useOriginRefs} className="accent-[#6366f1]"
                onChange={(e) => set({ useOriginRefs: e.target.checked })}
              />
            ) : undefined}
            weight={<Weight n={weights?.byKey[branch]} max={maxKey} />}
          />
        ))}
        {/* Les deux seuils NE PRODUISENT PAS d'appariement : ils suppriment des clés. Leur
            poids ne peut donc s'exprimer qu'en clés retirées — inventer un nombre
            d'appariements ici serait pire qu'une case vide. */}
        <div className="pl-3 border-l border-white/10 pt-1.5 mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
          <label className="space-y-1">
            <span className="text-[11px] text-white/50 block">{t('node.pairing-rules.minRefLen.label')}</span>
            <input type="number" min={2} value={rules.minRefLen} className={numCls}
              onChange={(e) => set({ minRefLen: Number(e.target.value) })} />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] text-white/50 block">{t('node.pairing-rules.weakRefLen.label')}</span>
            <input type="number" min={3} value={rules.weakRefLen} className={numCls}
              onChange={(e) => set({ weakRefLen: Number(e.target.value) })} />
          </label>
          {weights && weights.keysSuppressed > 0 && (
            <span className="text-[11px] text-amber-400/80 self-end pb-1">
              {t('pw.rules.tree.keys.suppressed', { n: weights.keysSuppressed })}
            </span>
          )}
        </div>
      </Stage>

      <Flow label={t('pw.rules.tree.flow.toEvidence')} />

      {/* ÉTAGE 2 — les preuves, dans l'ordre où proveMatch les teste. */}
      <Stage
        step="②" title={t('pw.rules.tree.evidence.title')} subtitle={t('pw.rules.tree.evidence.subShort')} help={t('pw.rules.tree.evidence.sub')}
        total={weights && <span className="text-[11px] text-white/40">{t('pw.rules.tree.evidence.total', { n: weights.matched })}</span>}
      >
        {MATCH_EVIDENCES.map((e: MatchEvidence, i) => (
          <Branch
            key={e} rank={String(i + 1)}
            label={t(`pw.rules.evidence.${e}` as 'pw.rules.evidence.gtin13')}
            hint={e === 'ref-in-name' || e === 'ref-in-url' || e === 'ref-in-title'
              ? t('pw.rules.tree.evidence.strongOnly') : undefined}
            dimmed={!rules.evidence[e]}
            control={(
              <input
                type="checkbox" checked={rules.evidence[e]} disabled={e === 'gtin13'} className="accent-[#6366f1]"
                onChange={(ev) => set({ evidence: { ...rules.evidence, [e]: ev.target.checked } })}
              />
            )}
            weight={<Weight n={weights?.byEvidence[e] ?? (weights ? 0 : undefined)} max={maxEv} muted={!rules.evidence[e]} />}
          />
        ))}
      </Stage>

      <Flow label={t('pw.rules.tree.flow.toVetoes')} />

      {/* ÉTAGE 3 — les démentis, qui ne voient que ce qui a été prouvé. */}
      <Stage
        step="③" title={t('pw.rules.tree.vetoes.title')} subtitle={t('pw.rules.tree.vetoes.subShort')} help={t('pw.rules.tree.vetoes.sub')}
        total={weights && <span className="text-[11px] text-white/40">{t('pw.rules.tree.vetoes.total', { n: weights.vetoed })}</span>}
      >
        {VETOES.map((v) => {
          const on = v === 'family' ? rules.familyVeto
            : v === 'no-corroboration' ? rules.corroborateNumericKeys
              : rules.priceAbyssRatio > 0
          return (
            <Branch
              key={v}
              label={t(`pw.rules.tree.veto.${v}` as 'pw.rules.tree.veto.family')}
              hint={t(`pw.rules.tree.veto.${v}.hint` as 'pw.rules.tree.veto.family.hint')}
              dimmed={!on}
              control={v === 'price-abyss' ? (
                <span className="flex items-center gap-1">
                  <span className="text-[11px] text-white/40">×</span>
                  <input type="number" min={0} value={rules.priceAbyssRatio} className={numCls}
                    onChange={(e) => set({ priceAbyssRatio: Number(e.target.value) })} />
                </span>
              ) : (
                <input
                  type="checkbox" checked={on} className="accent-[#6366f1]"
                  onChange={(e) => (v === 'family'
                    ? set({ familyVeto: e.target.checked })
                    : set({ corroborateNumericKeys: e.target.checked }))}
                />
              )}
              weight={<Weight n={weights?.byVeto[v] ?? (weights ? 0 : undefined)} max={maxVeto} muted={!on} />}
            />
          )
        })}

        {/* Le code-barres échappe à cet étage : c'est une propriété du moteur, pas un
            réglage — la dire ici évite qu'on cherche la case correspondante. */}
        <Branch label={t('pw.rules.tree.veto.barcodeExempt')} dimmed
          control={<Ban className="w-3 h-3 text-white/20" />} />

        <div className="pl-3 border-l border-white/10 pt-1.5 mt-1 space-y-1.5">
          <label className="block space-y-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/60">{t('node.pairing-rules.extraFamilies.label')}</span>
              <Hint text={t('node.pairing-rules.extraFamilies.help')} />
            </span>
            <textarea
              // Édité en TEXTE : reparser à chaque frappe empêcherait de taper
              // « serrure: » (la ligne sans mot disparaîtrait sous les doigts).
              defaultValue={formatFamilyLexicon(rules.extraFamilies)}
              onBlur={(e) => set({ extraFamilies: parseFamilyLexicon(e.target.value) })}
              rows={2} spellCheck={false} placeholder={t('pw.rules.familiesPlaceholder')}
              className="bg-well text-white text-xs rounded px-2 py-1.5 w-full border border-white/10 focus:outline-none focus:border-white/25 font-mono"
            />
            {/* L'avertissement du lexique est CAPITAL mais long : il reste accessible au
                survol plutôt que d'occuper trois lignes en permanence. */}
          </label>
          <label className="flex gap-2 items-center cursor-pointer">
            <input type="checkbox" checked={rules.unifyDirectedVetoes} className="accent-[#6366f1]"
              onChange={(e) => set({ unifyDirectedVetoes: e.target.checked })} />
            <span className="text-[13px] text-white/85">{t('node.pairing-rules.unify.label')}</span>
            <Hint text={t('node.pairing-rules.unify.help')} />
          </label>
        </div>
      </Stage>

      <Flow label={t('pw.rules.tree.flow.toPrice')} />

      {/* ÉTAGE 4 — le prix : hors appariement, mais il décide de ce qui entre dans le
          comparatif, donc il appartient à la même cascade. */}
      <Stage step="④" title={t('pw.rules.tree.price.title')} subtitle={t('pw.rules.tree.price.subShort')} help={t('pw.rules.tree.price.sub')}>
        <div className="pl-3 border-l border-white/10 flex flex-wrap items-end gap-x-4 gap-y-1 pt-1">
          {([
            ['alignedPct', rules.alignedPct, 'node.pairing-rules.alignedPct.label'],
            ['minPriceEur', rules.minPriceEur, 'node.pairing-rules.minPriceEur.label'],
            ['maxDropPct', rules.maxDropPct, 'node.pairing-rules.maxDropPct.label'],
          ] as const).map(([field, value, key]) => (
            <label key={field} className="space-y-1">
              <span className="text-[11px] text-white/50 block">{t(key)}</span>
              <input type="number" min={0} value={value} className={numCls}
                onChange={(e) => set({ [field]: Number(e.target.value) } as Partial<PairingRules>)} />
            </label>
          ))}
        </div>
      </Stage>
    </div>
  )
}
