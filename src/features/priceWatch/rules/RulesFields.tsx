// Champs de réglage des règles d'appariement, dans l'ORDRE DE LA CASCADE : les clés
// qu'on essaie, les preuves qui suffisent, les démentis qui refusent. Cet ordre n'est pas
// cosmétique — il rend lisible le fait qu'un réglage amont décide de ce que l'aval voit.
import { MATCH_EVIDENCES, type MatchEvidence, type PairingRules } from '../catalog/pairingRules'
import { formatFamilyLexicon, parseFamilyLexicon } from '../pairingRulesConfig'
import { useTranslation } from '@/lib/i18n'

const boxCls = 'bg-surface rounded-lg p-4 space-y-3'
const titleCls = 'text-xs font-semibold uppercase tracking-wide text-white/40'
const numCls = 'bg-well text-white text-sm rounded px-2 py-1 w-24 border border-white/10 focus:outline-none focus:border-white/25'
const helpCls = 'text-xs text-white/40'

function Toggle(
  { checked, onChange, label, help }:
  { checked: boolean; onChange: (v: boolean) => void; label: string; help: string },
) {
  return (
    <label className="flex gap-3 cursor-pointer items-start">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[#6366f1]" />
      <span>
        <span className="text-sm text-white/85 block">{label}</span>
        <span className={helpCls}>{help}</span>
      </span>
    </label>
  )
}

function Num(
  { value, onChange, label, help, step = 1, min = 0 }:
  { value: number; onChange: (v: number) => void; label: string; help: string; step?: number; min?: number },
) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-white/85 block">{label}</span>
      <input
        type="number" value={value} step={step} min={min} className={numCls}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className={`${helpCls} block`}>{help}</span>
    </label>
  )
}

export function RulesFields(
  { rules, onChange }: { rules: PairingRules; onChange: (next: PairingRules) => void },
) {
  const { t } = useTranslation()
  const set = (patch: Partial<PairingRules>) => onChange({ ...rules, ...patch })

  return (
    <div className="grid gap-4 lg:grid-cols-3 items-start">
      {/* 1 — CLÉS : ce qu'on essaie, et dans quel ordre. */}
      <section className={boxCls}>
        <h3 className={titleCls}>{t('pw.rules.section.keys')}</h3>
        <Toggle
          checked={rules.useOriginRefs} onChange={(useOriginRefs) => set({ useOriginRefs })}
          label={t('node.pairing-rules.useOriginRefs.label')} help={t('node.pairing-rules.useOriginRefs.help')}
        />
        <Num
          value={rules.minRefLen} onChange={(minRefLen) => set({ minRefLen })} min={2}
          label={t('node.pairing-rules.minRefLen.label')} help={t('node.pairing-rules.minRefLen.help')}
        />
        <Num
          value={rules.weakRefLen} onChange={(weakRefLen) => set({ weakRefLen })} min={3}
          label={t('node.pairing-rules.weakRefLen.label')} help={t('node.pairing-rules.weakRefLen.help')}
        />
      </section>

      {/* 2 — PREUVES : ce qui suffit à prouver que c'est le même article. */}
      <section className={boxCls}>
        <h3 className={titleCls}>{t('pw.rules.section.evidence')}</h3>
        <p className={helpCls}>{t('node.pairing-rules.evidence.help')}</p>
        {MATCH_EVIDENCES.map((e: MatchEvidence) => (
          <label key={e} className={`flex gap-3 items-center ${e === 'gtin13' ? 'opacity-60' : 'cursor-pointer'}`}>
            <input
              type="checkbox" checked={rules.evidence[e]} disabled={e === 'gtin13'} className="accent-[#6366f1]"
              onChange={(ev) => set({ evidence: { ...rules.evidence, [e]: ev.target.checked } })}
            />
            <span className="text-sm text-white/85">{t(`pw.rules.evidence.${e}` as 'pw.rules.evidence.gtin13')}</span>
          </label>
        ))}
      </section>

      {/* 3 — DÉMENTIS : ce qui refuse un rapprochement pourtant prouvé. */}
      <section className={boxCls}>
        <h3 className={titleCls}>{t('pw.rules.section.vetoes')}</h3>
        <Toggle
          checked={rules.familyVeto} onChange={(familyVeto) => set({ familyVeto })}
          label={t('node.pairing-rules.familyVeto.label')} help={t('node.pairing-rules.familyVeto.help')}
        />
        <Toggle
          checked={rules.corroborateNumericKeys} onChange={(corroborateNumericKeys) => set({ corroborateNumericKeys })}
          label={t('node.pairing-rules.corroborate.label')} help={t('node.pairing-rules.corroborate.help')}
        />
        <Num
          value={rules.priceAbyssRatio} onChange={(priceAbyssRatio) => set({ priceAbyssRatio })}
          label={t('node.pairing-rules.priceAbyssRatio.label')} help={t('node.pairing-rules.priceAbyssRatio.help')}
        />
        <Toggle
          checked={rules.unifyDirectedVetoes} onChange={(unifyDirectedVetoes) => set({ unifyDirectedVetoes })}
          label={t('node.pairing-rules.unify.label')} help={t('node.pairing-rules.unify.help')}
        />
        <label className="block space-y-1">
          <span className="text-sm text-white/85 block">{t('node.pairing-rules.extraFamilies.label')}</span>
          <textarea
            // ⚠ Édité en TEXTE brut : reparser à chaque frappe empêcherait de taper
            // « serrure: » (la ligne sans mot disparaîtrait sous les doigts).
            defaultValue={formatFamilyLexicon(rules.extraFamilies)}
            onBlur={(e) => set({ extraFamilies: parseFamilyLexicon(e.target.value) })}
            rows={4} spellCheck={false}
            className="bg-well text-white text-xs rounded px-2 py-1.5 w-full border border-white/10 focus:outline-none focus:border-white/25 font-mono"
            placeholder={t('pw.rules.familiesPlaceholder')}
          />
          <span className={`${helpCls} block`}>{t('node.pairing-rules.extraFamilies.help')}</span>
        </label>
      </section>
    </div>
  )
}
