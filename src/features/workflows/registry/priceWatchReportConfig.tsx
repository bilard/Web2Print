// Panneau de config du node « Rapport veille tarifaire ».
//
// ⚠ Il n'existe que pour UN champ : la consigne. Le rendu générique l'affichait comme une
// zone de texte avec un paragraphe d'aide expliquant COMMENT écrire — jamais SUR QUOI. On
// demandait donc au hasard : ce qui existe sort, ce qui n'existe pas ne sort pas, et rien
// ne distingue les deux cas puisque le modèle a interdiction d'inventer et se tait.
//
// Les autres champs restent rendus par le schéma, via `ConfigFieldRenderer` — les
// reproduire à la main les ferait diverger au premier ajout.
import { useState } from 'react'
import { ChevronRight, Wand2 } from 'lucide-react'
import type { ConfigField } from '../types'
import { ConfigFieldRenderer } from '../editor/configFields'
import { COMPOSE_FIELDS, COMPOSE_PRESETS } from '@/features/priceWatch/composeFields'
import { PriceWatchReportPreview } from './priceWatchReportPreview'
import type { PwReportConfig } from './priceWatchReportTypes'
import { useTranslation } from '@/lib/i18n'

/** Champs rendus par le schéma, dans l'ordre — la consigne est traitée à part. */
const OTHERS: ConfigField[] = [
  { name: 'title', kind: 'text', labelKey: 'node.pw-report.title.label', helpKey: 'node.pw-report.title.help' },
  { name: 'watchId', kind: 'text', labelKey: 'node.compare-catalog.watchId.label', helpKey: 'node.compare-catalog.watchId.help' },
  // ⚠ Deux rapports pour deux usages. « Appariés » ne parle que des concurrents dont on
  // sait comparer les prix — c'est le rapport de POSITIONNEMENT, et le défaut. « Tous »
  // ajoute ceux qu'on collecte sans jamais réussir à les relier au catalogue : leur volume
  // dit ce qu'on a chez eux et ce qui nous échappe. C'est un rapport de COUVERTURE.
  {
    name: 'scope', kind: 'select',
    labelKey: 'node.pw-report.scope.label', helpKey: 'node.pw-report.scope.help',
    options: [
      { value: 'matched', labelKey: 'node.pw-report.scope.matched' },
      { value: 'all', labelKey: 'node.pw-report.scope.all' },
    ],
  },
  { name: 'competitorThresholdPct', kind: 'number', labelKey: 'node.pw-report.compThreshold.label', helpKey: 'node.pw-report.compThreshold.help' },
  { name: 'familyThresholdPct', kind: 'number', labelKey: 'node.pw-report.famThreshold.label', helpKey: 'node.pw-report.famThreshold.help' },
  { name: 'examples', kind: 'number', labelKey: 'node.pw-report.examples.label', helpKey: 'node.pw-report.examples.help' },
  { name: 'fileName', kind: 'text', labelKey: 'node.pw-report.fileName.label' },
]

export function PriceWatchReportConfig({ config, onChange, availableColumns }: {
  config: PwReportConfig
  onChange: (next: PwReportConfig) => void
  availableColumns?: string[]
}) {
  const { t } = useTranslation()
  const [showFields, setShowFields] = useState(false)
  const prompt = String(config.prompt ?? '')

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-white/60 mb-1 block">{t('node.pw-report.prompt.label')}</span>
        <textarea
          value={prompt} rows={5}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder={t('pw.compose.placeholder')}
          className="bg-well text-white text-sm rounded px-2 py-1.5 w-full border border-white/10 focus:outline-none focus:border-white/25"
        />
        <span className="text-[11px] text-white/30 mt-1 block leading-snug">
          {t('node.pw-report.prompt.help')}
        </span>
      </label>

      {/* Exemples PRÊTS À L'EMPLOI : la difficulté n'est pas d'écrire une phrase, c'est de
          savoir ce qu'on a le droit de demander. Un exemple qui marche l'enseigne mieux
          qu'un paragraphe. */}
      <div className="space-y-1">
        <span className="text-[11px] text-white/40 block">{t('pw.compose.presets')}</span>
        <div className="flex flex-wrap gap-1.5">
          {COMPOSE_PRESETS.map((p) => {
            // ⚠ Actif = la consigne EST ce texte, au caractère près. Dès qu'on l'adapte,
            // le surlignage tombe — et c'est juste : le mail ne sera plus celui de
            // l'exemple. Comparé au texte rendu, pas à la clé : c'est ce que le champ
            // contient réellement.
            const active = prompt.trim() === t(p.textKey).trim()
            return (
              <button
                key={p.labelKey} type="button"
                onClick={() => onChange({ ...config, prompt: t(p.textKey) })}
                aria-pressed={active}
                className={`text-[11px] rounded px-2 py-1 border transition-colors flex items-center gap-1 ${
                  active
                    ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 text-white/60 hover:text-white hover:border-white/25'
                }`}
              >
                <Wand2 className="w-3 h-3" />{t(p.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* L'aperçu vient APRÈS les exemples : on part d'un exemple, on l'adapte, puis on
          regarde ce qu'il donne. */}
      <PriceWatchReportPreview prompt={prompt} watchIdRaw={String(config.watchId ?? '')} />

      {/* La liste des données transmises. Repliée par défaut — elle est longue, et on ne la
          consulte qu'au moment d'écrire. Couverte par `composeFields.test.ts` : elle ne
          peut pas annoncer une donnée que le prompt ne transmet pas. */}
      <div className="rounded border border-white/10 overflow-hidden">
        <button
          type="button" onClick={() => setShowFields((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-2 text-[11px] text-white/60 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          <ChevronRight className={`w-3 h-3 transition-transform ${showFields ? 'rotate-90' : ''}`} />
          <span className="flex-1 text-left">{t('pw.compose.fields.toggle')}</span>
        </button>
        {showFields && (
          <div className="px-2.5 pb-2.5 space-y-2">
            <p className="text-[11px] text-white/35 leading-snug">{t('pw.compose.fields.note')}</p>
            {COMPOSE_FIELDS.map((g) => (
              <div key={g.id}>
                <div className="text-[11px] font-semibold text-white/50 mb-0.5">{t(g.titleKey)}</div>
                <ul className="space-y-0.5">
                  {g.fields.map((f) => (
                    <li key={f.key} className="text-[11px] text-white/45 leading-snug">
                      · {t(f.labelKey)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {OTHERS.map((f) => (
        <label key={f.name} className="block">
          <span className="text-xs text-white/60 mb-1 block">{f.labelKey ? t(f.labelKey) : f.label}</span>
          <ConfigFieldRenderer
            field={f} columns={availableColumns} value={(config as unknown as Record<string, unknown>)[f.name]}
            onChange={(v) => onChange({ ...config, [f.name]: v })}
          />
          {f.helpKey && <span className="text-[11px] text-white/30 mt-1 block leading-snug">{t(f.helpKey)}</span>}
        </label>
      ))}
    </div>
  )
}
