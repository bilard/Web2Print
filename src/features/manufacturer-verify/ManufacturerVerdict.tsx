import { useState, useRef, useLayoutEffect } from 'react'
import { Globe, Factory, Check, AlertTriangle, Plus, BadgeCheck, ShieldAlert, ExternalLink } from 'lucide-react'
import type { CompareStatus, FieldComparison, VerdictSummary } from './types'
import { t } from '@/lib/i18n'

interface Props {
  sourceUrl: string | null
  sourceLabel: string
  mfrUrl: string | null
  mfrLabel: string
  summary: VerdictSummary
  comparisons: FieldComparison[]
  /** Correspondance EAN/GTIN : true = même produit certifié, false = EAN différents, null = non vérifiable. */
  eanMatch?: boolean | null
  /** Adopter/annuler une valeur fabricant dans le master de la source (specs). */
  onToggleAdopt?: (c: FieldComparison, adopt: boolean) => void
  busy?: boolean
}

const hostOf = (url: string | null): string => {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const STATUS_META: Record<CompareStatus, { sym: string; label: string; cls: string }> = {
  match:         { sym: '=', label: 'identique',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  diff:          { sym: '≠', label: t('mv.verdict.diff'),    cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
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

/** Interrupteur Source ⇄ Fabricant : OFF = valeur source (master), ON = valeur
 *  fabricant adoptée dans le master. */
function AdoptToggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => onChange(!on)}
      title={t(on ? 'mv.masterIsMfr' : 'mv.masterIsSource')}
      className="inline-flex items-center gap-1.5 disabled:opacity-40"
    >
      <span className={`text-[9px] font-bold uppercase ${on ? 'text-white/25' : 'text-white/60'}`}>Src</span>
      <span className={`relative w-8 h-4 rounded-full transition-colors ${on ? 'bg-teal-500/70' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className={`text-[9px] font-bold uppercase ${on ? 'text-teal-300' : 'text-white/25'}`}>Fab</span>
    </button>
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
export function ManufacturerVerdict({ sourceUrl, sourceLabel, mfrUrl, mfrLabel, summary, comparisons, eanMatch, onToggleAdopt, busy }: Props) {
  // Le contenu marketing est rendu en BLOCS lisibles EN HAUT (texte complet),
  // pas dans le tableau (où il serait tronqué). Le tableau ne garde que le
  // comparable ligne à ligne.
  const groups: FieldComparison['group'][] = ['identity', 'price', 'spec']
  const content = comparisons.filter((c) => c.group === 'content')
  // Filtre par statut via les tuiles (bascule). null = tout afficher.
  const [filter, setFilter] = useState<CompareStatus | null>(null)
  const toggle = (s: CompareStatus) => setFilter((f) => (f === s ? null : s))
  // Hauteur réelle des compteurs épinglés → offset de l'entête de tableau sticky
  // (évite qu'elle passe DERRIÈRE les compteurs). Mesuré, pas de valeur magique.
  const countersRef = useRef<HTMLDivElement>(null)
  const [countersH, setCountersH] = useState(96)
  useLayoutEffect(() => {
    if (countersRef.current) setCountersH(countersRef.current.offsetHeight)
  }, [filter, content.length])

  return (
    <div className="flex flex-col gap-4 pt-5">
      {/* Badge de certitude EAN/GTIN */}
      {eanMatch === true && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-[12px] text-emerald-300">
          <BadgeCheck className="w-4 h-4 shrink-0" /> <strong>{t('mv.sameProduct')}</strong> — l'EAN/GTIN de la source correspond à celui du fabricant.
        </div>
      )}
      {eanMatch === false && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/25 px-3.5 py-2 text-[12px] text-rose-300">
          <ShieldAlert className="w-4 h-4 shrink-0" /> <strong>{t('mv.eanDiffer')}</strong> — la page fabricant ne correspond peut-être pas exactement au produit source.
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
        {/* Côté fabricant : lien cliquable vers la fiche officielle (nouvel onglet). */}
        {mfrUrl ? (
          <a href={mfrUrl} target="_blank" rel="noreferrer" title={`Ouvrir la fiche officielle — ${hostOf(mfrUrl)}`}
            className="flex-1 min-w-0 text-right group/mfr">
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-indigo-300/80">
              Fabricant officiel <Factory className="w-3.5 h-3.5" />
            </div>
            <div className="text-[13px] font-semibold text-white truncate group-hover/mfr:text-indigo-200 transition-colors">{mfrLabel}</div>
            <div className="flex items-center justify-end gap-1 text-[11px] text-indigo-300/60 truncate group-hover/mfr:text-indigo-300 transition-colors">
              {hostOf(mfrUrl)} <ExternalLink className="w-3 h-3 shrink-0" />
            </div>
          </a>
        ) : (
          <div className="flex-1 min-w-0 text-right">
            <div className="flex items-center justify-end gap-1.5 text-[11px] text-indigo-300/80">
              Fabricant officiel <Factory className="w-3.5 h-3.5" />
            </div>
            <div className="text-[13px] font-semibold text-white truncate">{mfrLabel}</div>
          </div>
        )}
      </div>

      {/* Compteurs — cliquables (filtre) et ÉPINGLÉS en haut au scroll (fond opaque) */}
      <div ref={countersRef} className="sticky top-0 z-20 -mx-5 px-5 py-3 bg-black border-b border-white/[0.08] shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)] flex gap-2.5">
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
            <div key={c.key} className={`px-4 py-3 border-t border-white/[0.04] ${c.adopted ? 'bg-teal-500/[0.06]' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white/55">{c.label}</span>
                {onToggleAdopt && c.mfrValue ? (
                  <AdoptToggle on={!!c.adopted} disabled={busy} onChange={(v) => onToggleAdopt(c, v)} />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Source (master). Adoptée → montre le texte FABRICANT appliqué (teal). */}
                <ContentSide
                  title={t(c.adopted ? 'mv.sourceAdopted' : 'mv.sourceReseller')}
                  tone={c.adopted ? 'text-teal-300/80' : 'text-white/40'}
                  value={c.adopted ? c.mfrValue : c.sourceValue} field={c.key} highlight={c.adopted} />
                <ContentSide title="Fabricant" tone="text-indigo-300/70" value={c.mfrValue} field={c.key} highlight={!c.adopted} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau comparatif groupé — entête de colonnes ÉPINGLÉE sous les compteurs */}
      <div className="rounded-xl border border-white/[0.06] overflow-visible">
        <div style={{ top: countersH - 1 }} className="sticky z-10 grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-4 py-2.5 bg-black border-b border-white/[0.1] text-[10px] font-semibold uppercase tracking-wider text-white/55">
          <span>{t('mv.col.field')}</span><span>{t('mv.col.source')}</span><span>{t('mv.col.manufacturer')}</span><span className="text-right">{t('mv.col.state')}</span>
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
                // Toggle Source⇄Fabricant possible dès que le fabricant a une valeur
                // et qu'il y a un choix (déjà adopté, présent seulement fabricant, ou divergent).
                const canToggle = c.group === 'spec' && !!onToggleAdopt && !!c.mfrValue && !c.dupCanon
                  && (c.adopted || c.status === 'mfr-only' || c.status === 'diff')
                return (
                  <div key={c.key} className={`grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center px-4 py-2 border-t border-white/[0.03] ${c.adopted ? 'bg-teal-500/[0.06]' : ''}`}>
                    <span className="text-[12px] text-white/60">{c.label}</span>
                    {/* Colonne SOURCE (master). Adoptée → affiche la valeur FABRICANT appliquée
                        (teal + point de provenance) ; l'ancienne source reste barrée en petit. */}
                    {c.adopted ? (
                      <span className="text-[12px] truncate flex items-baseline gap-1.5" title={c.mfrValue ?? ''}>
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 self-center" />
                        <span className="text-teal-200 font-medium truncate">{c.mfrValue ?? '—'}</span>
                        {c.sourceValue && <span className="text-white/25 line-through text-[10px] truncate shrink-0">{c.sourceValue}</span>}
                      </span>
                    ) : (
                      <span className="text-[12px] truncate text-white/45" title={c.sourceValue ?? ''}>{c.sourceValue ?? '—'}</span>
                    )}
                    {/* Colonne FABRICANT. Adoptée → estompée (elle est désormais dans la source). */}
                    <span className={`text-[12px] truncate ${c.mfrValue ? (c.adopted ? 'text-white/35' : 'text-white/85 font-medium') : 'text-white/30'}`} title={c.mfrValue ?? ''}>
                      {c.mfrValue ?? '—'}
                    </span>
                    {/* ÉTAT / toggle d'adoption */}
                    {canToggle ? (
                      <span className="justify-self-end"><AdoptToggle on={!!c.adopted} disabled={busy} onChange={(v) => onToggleAdopt!(c, v)} /></span>
                    ) : (
                      <span className={`justify-self-end text-[10px] font-semibold px-2 py-[2px] rounded-full border whitespace-nowrap ${meta.cls}`}>
                        {meta.sym} {meta.label}
                      </span>
                    )}
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
