import { useState } from 'react'
import { Globe, Factory, Check, AlertTriangle, Plus, BadgeCheck, ShieldAlert } from 'lucide-react'
import type { CompareStatus, FieldComparison, VerdictSummary } from './types'

interface Props {
  sourceUrl: string | null
  sourceLabel: string
  mfrUrl: string | null
  mfrLabel: string
  summary: VerdictSummary
  comparisons: FieldComparison[]
  /** Correspondance EAN/GTIN : true = même produit certifié, false = EAN différents, null = non vérifiable. */
  eanMatch?: boolean | null
}

const hostOf = (url: string | null): string => {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const STATUS_META: Record<CompareStatus, { sym: string; label: string; cls: string }> = {
  match:         { sym: '=', label: 'identique',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  diff:          { sym: '≠', label: 'diffère',    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'mfr-only':    { sym: '+', label: 'fabricant',  cls: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' },
  'source-only': { sym: '·', label: 'source',     cls: 'text-white/40 bg-white/[0.04] border-white/10' },
}

const NEUTRAL = 'text-white/45 bg-white/[0.04] border-white/10'

/** Badge d'un champ : verdict =/≠ pour identité/specs ; NEUTRE (informatif) pour
 *  prix et contenu — un prix RRP ≠ revendeur ou « 4 vs 1 points » n'est ni
 *  « identique » ni une « erreur ». */
function badgeFor(c: FieldComparison): { sym: string; label: string; cls: string } {
  if (c.group === 'price') return { sym: '≈', label: 'indicatif', cls: NEUTRAL }
  if (c.group === 'content') {
    if (c.sourceValue && c.mfrValue) return { sym: '·', label: 'des deux', cls: NEUTRAL }
    if (c.mfrValue) return { sym: '+', label: 'fabricant', cls: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20' }
    return { sym: '·', label: 'source', cls: NEUTRAL }
  }
  return STATUS_META[c.status]
}

const GROUP_LABEL: Record<FieldComparison['group'], string> = {
  identity: 'Identité', price: 'Prix (indicatif)', spec: 'Spécifications techniques', content: 'Contenu marketing',
}

/** Un côté (source ou fabricant) d'un champ de contenu marketing : texte complet,
 *  ou liste à puces pour les « Points forts ». */
function ContentSide({ title, tone, value, field, highlight }: {
  title: string; tone: string; value: string | null; field: string; highlight?: boolean
}) {
  const isBullets = field === 'content:advantages'
  const bullets = isBullets && value ? value.split(' • ').map((s) => s.trim()).filter(Boolean) : []
  return (
    <div>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${tone}`}>{title}</div>
      {!value ? (
        <div className="text-[12px] text-white/25">—</div>
      ) : isBullets ? (
        <ul className="flex flex-col gap-1">
          {bullets.map((b, i) => (
            <li key={i} className={`text-[12px] leading-snug flex gap-1.5 ${highlight ? 'text-white/80' : 'text-white/55'}`}>
              <span className="text-indigo-300/60 shrink-0">•</span><span>{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`text-[12px] leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto pr-1 ${highlight ? 'text-white/80' : 'text-white/55'}`}>
          {value}
        </div>
      )}
    </div>
  )
}

function Tile({ n, label, tone, icon, active, onClick, ring }: {
  n: number; label: string; tone: string; icon: React.ReactNode
  active: boolean; onClick: () => void; ring: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-xl border bg-surface-2 px-4 py-3 transition-colors ${
        active ? `${ring} bg-white/[0.04]` : 'border-white/[0.06] hover:border-white/15'
      }`}
      title="Cliquer pour filtrer le tableau"
    >
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${tone}`}>
        {icon}{label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{n}</div>
    </button>
  )
}

/** Vue verdict « la vérité est chez le fabricant » — comparaison Source ⇄ Fabricant. */
export function ManufacturerVerdict({ sourceUrl, sourceLabel, mfrUrl, mfrLabel, summary, comparisons, eanMatch }: Props) {
  // Le contenu marketing est rendu en BLOCS lisibles EN HAUT (texte complet),
  // pas dans le tableau (où il serait tronqué). Le tableau ne garde que le
  // comparable ligne à ligne.
  const groups: FieldComparison['group'][] = ['identity', 'price', 'spec']
  const content = comparisons.filter((c) => c.group === 'content')
  // Filtre par statut via les tuiles (bascule). null = tout afficher.
  const [filter, setFilter] = useState<CompareStatus | null>(null)
  const toggle = (s: CompareStatus) => setFilter((f) => (f === s ? null : s))

  return (
    <div className="flex flex-col gap-4 pt-5">
      {/* Badge de certitude EAN/GTIN */}
      {eanMatch === true && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-[12px] text-emerald-300">
          <BadgeCheck className="w-4 h-4 shrink-0" /> <strong>Même produit certifié</strong> — l'EAN/GTIN de la source correspond à celui du fabricant.
        </div>
      )}
      {eanMatch === false && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 text-[12px] text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0" /> <strong>EAN différents</strong> — la page fabricant ne correspond peut-être pas exactement au produit source.
        </div>
      )}

      {/* En-tête narratif : source ⇄ fabricant */}
      <div className="flex items-center gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-white/40">
            <Globe className="w-3.5 h-3.5" /> Source revendeur
          </div>
          <div className="text-[13px] font-medium text-white/70 truncate">{sourceLabel}</div>
          <div className="text-[11px] text-white/35 truncate">{hostOf(sourceUrl)}</div>
        </div>
        <div className="text-white/25 text-lg shrink-0">⇄</div>
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-indigo-300/80">
            Fabricant officiel <Factory className="w-3.5 h-3.5" />
          </div>
          <div className="text-[13px] font-semibold text-white truncate">{mfrLabel}</div>
          <div className="text-[11px] text-indigo-300/50 truncate">{hostOf(mfrUrl)}</div>
        </div>
      </div>

      {/* Compteurs — cliquables (filtre) et ÉPINGLÉS en haut au scroll (fond opaque) */}
      <div className="sticky top-0 z-20 -mx-5 px-5 py-3 bg-background border-b border-white/[0.08] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)] flex gap-2.5">
        <Tile n={summary.confirmed} label="Confirmés" tone="text-emerald-400" icon={<Check className="w-3.5 h-3.5" />}
          active={filter === 'match'} onClick={() => toggle('match')} ring="border-emerald-500/50" />
        <Tile n={summary.completed} label="Complétés" tone="text-indigo-300" icon={<Plus className="w-3.5 h-3.5" />}
          active={filter === 'mfr-only'} onClick={() => toggle('mfr-only')} ring="border-indigo-500/50" />
        <Tile n={summary.divergent} label="Divergents" tone="text-amber-400" icon={<AlertTriangle className="w-3.5 h-3.5" />}
          active={filter === 'diff'} onClick={() => toggle('diff')} ring="border-amber-500/50" />
      </div>
      {filter && (
        <button onClick={() => setFilter(null)} className="self-start -mt-2 text-[11px] text-indigo-300 hover:text-indigo-200">
          ✕ Retirer le filtre — tout afficher
        </button>
      )}

      {/* CONTENU MARKETING — en haut, en blocs lisibles (texte complet côte à côte).
          Masqué quand un filtre de statut est actif (le contenu n'est pas scoré). */}
      {!filter && content.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2 bg-well text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Contenu marketing
          </div>
          {content.map((c) => (
            <div key={c.key} className="px-4 py-3 border-t border-white/[0.04]">
              <div className="text-[11px] font-semibold text-white/55 mb-2">{c.label}</div>
              <div className="grid grid-cols-2 gap-4">
                <ContentSide title="Source (revendeur)" tone="text-white/40" value={c.sourceValue} field={c.key} />
                <ContentSide title="Fabricant" tone="text-indigo-300/70" value={c.mfrValue} field={c.key} highlight />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau comparatif groupé — entête de colonnes ÉPINGLÉE sous les compteurs */}
      <div className="rounded-xl border border-white/[0.06] overflow-visible">
        <div className="sticky top-[86px] z-10 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2.5 bg-background border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-wider text-white/35">
          <span>Champ</span><span>Source</span><span>Fabricant</span><span className="text-right">État</span>
        </div>
        {groups.map((g) => {
          // Un filtre actif ne montre QUE les specs de ce statut (ce que comptent
          // les tuiles) — l'identité/prix ne sont pas scorés.
          const rows = comparisons.filter((c) =>
            c.group === g && (!filter || (g === 'spec' && c.status === filter)))
          if (rows.length === 0) return null
          return (
            <div key={g}>
              <div className="px-4 py-1.5 bg-surface-2 text-[10px] font-semibold uppercase tracking-wider text-white/45 border-t border-white/[0.05]">
                {GROUP_LABEL[g]}
              </div>
              {rows.map((c) => {
                const meta = badgeFor(c)
                return (
                  <div key={c.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center px-4 py-2 border-t border-white/[0.03]">
                    <span className="text-[12px] text-white/60">{c.label}</span>
                    <span className="text-[12px] text-white/45 truncate" title={c.sourceValue ?? ''}>{c.sourceValue ?? '—'}</span>
                    <span className={`text-[12px] truncate ${c.mfrValue ? 'text-white/85 font-medium' : 'text-white/30'}`} title={c.mfrValue ?? ''}>
                      {c.mfrValue ?? '—'}
                    </span>
                    <span className={`justify-self-end text-[10px] font-semibold px-2 py-[2px] rounded-full border whitespace-nowrap ${meta.cls}`}>
                      {meta.sym} {meta.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
