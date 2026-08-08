// Écran « Règles d'appariement » : le pilotage du moteur de veille, à côté des chiffres
// qu'il produit. Les mêmes règles que le node de workflow — même document Firestore —
// pour que régler ici et régler dans le flux soient le même geste.
import { useEffect, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { usePairingRules } from '../usePairingRules'
import { useCompetitorMeta } from '../useCatalogReport'
import { DEFAULT_PAIRING_RULES, rulesDifferFromDefault, type PairingRules } from '../catalog/pairingRules'
import { RulesFields } from './RulesFields'
import { RulesPreview } from './RulesPreview'
import { useTranslation } from '@/lib/i18n'
import { toast } from 'sonner'

const btnCls = 'text-xs rounded px-3 py-1.5 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export function PairingRulesPanel({ watchId }: { watchId: string | null }) {
  const { t } = useTranslation()
  const stored = usePairingRules(watchId)
  const meta = useCompetitorMeta(watchId)
  const [draft, setDraft] = useState<PairingRules>(DEFAULT_PAIRING_RULES)
  const [site, setSite] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Le brouillon suit ce qui est ENREGISTRÉ tant qu'on n'a rien touché : un run qui
  // réécrit les règles pendant qu'on regarde l'écran doit se voir.
  useEffect(() => { if (!stored.loading) setDraft(stored.rules) }, [stored.loading, stored.rules])

  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.rules)

  const save = async () => {
    setSaving(true)
    try {
      await stored.save(draft)
      toast.success(t('pw.rules.saved'))
    } catch (e) {
      toast.error(t('pw.rules.saveFailed', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSaving(false)
    }
  }

  // `useCompetitorMeta` écarte déjà le doc curseur ; il reste à trier pour que la liste
  // ne se réordonne pas à chaque snapshot.
  const sites = [...meta.entries()]
    .map(([siteId, m]) => ({ siteId, domain: m.domain ?? '' }))
    .filter((s) => s.domain !== '')
    .sort((a, b) => a.domain.localeCompare(b.domain))

  return (
    <section data-pw-section="rules" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{t('pw.rules.title')}</h2>
          <p className="text-xs text-white/50 max-w-3xl">{t('pw.rules.intro')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Le retour aux défauts est un BOUTON et non un discours : c'est la sortie de
              secours quand un réglage a fait plus de mal que de bien. */}
          <button
            type="button" onClick={() => setDraft(DEFAULT_PAIRING_RULES)}
            disabled={!rulesDifferFromDefault(draft)}
            className={`${btnCls} border-white/10 text-white/60 hover:text-white hover:border-white/25`}
          >
            <RotateCcw className="w-3 h-3 inline mr-1" />{t('pw.rules.reset')}
          </button>
          <button
            type="button" onClick={save} disabled={!dirty || saving}
            className={`${btnCls} border-[#6366f1] bg-[#6366f1]/20 text-white hover:bg-[#6366f1]/30`}
          >
            <Save className="w-3 h-3 inline mr-1" />{saving ? t('pw.rules.saving') : t('pw.rules.save')}
          </button>
        </div>
      </header>

      {stored.fromDefaults && !stored.loading && (
        <p className="text-xs text-white/40">{t('pw.rules.neverSet')}</p>
      )}
      {stored.updatedAt != null && (
        <p className="text-xs text-white/40">
          {t('pw.rules.lastWrite', {
            when: new Date(stored.updatedAt).toLocaleString(),
            by: stored.updatedBy === 'node' ? t('pw.rules.byNode') : t('pw.rules.byScreen'),
          })}
        </p>
      )}

      <RulesFields rules={draft} onChange={setDraft} />

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-white/40">
            {t('pw.rules.preview.title')}
          </h3>
          <select
            value={site ?? ''} onChange={(e) => setSite(e.target.value || null)}
            className="bg-well text-white/80 text-xs rounded px-2 py-1.5 border border-white/10 focus:outline-none focus:border-white/25"
          >
            <option value="">{t('pw.rules.preview.pickSiteOption')}</option>
            {sites.map((s) => (
              <option key={s.siteId} value={s.siteId}>{s.domain}</option>
            ))}
          </select>
          {/* Clé partagée avec l'éditeur de workflow : même situation, même phrase. */}
          {dirty && <span className="text-xs text-amber-400">{t('wfe.unsaved')}</span>}
        </div>
        {/* La demi-vérité est ANNONCÉE : un aperçu qui laisserait croire qu'il couvre tout
            le suivi serait pire qu'aucun aperçu. */}
        <p className="text-xs text-white/40">{t('pw.rules.preview.scope')}</p>
        <RulesPreview watchId={watchId} siteId={site} current={stored.rules} proposed={draft} />
      </div>
    </section>
  )
}
