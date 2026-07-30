// Écran d'entrée du wizard : nom de la société + URL de base de son site +
// volumétrie du scraping (nombre de produits échantillonnés sur ses univers).
import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import { DEMO_VOLUMES } from '../useDemoExpress'
import { t } from '@/lib/i18n'

interface Props {
  onLaunch: (company: string, url: string, opts: { maxProducts: number; prompt?: string; animations?: boolean }) => void
}

export function DemoExpressForm({ onLaunch }: Props) {
  const [company, setCompany] = useState('')
  const [url, setUrl] = useState('')
  // Volumétrie partagée avec le menu (« Scraper N produits » la prérègle).
  const volume = useDemoExpressStore((s) => s.formVolume)
  const setVolume = useDemoExpressStore((s) => s.setFormVolume)
  // Brouillon de saisie : vider le champ pour retaper ne doit PAS être écrasé
  // par la valeur clampée du store (Number('')=0 → resnappait à 12 à chaque frappe).
  const [volumeDraft, setVolumeDraft] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  // Désactivé par défaut : l'utilisateur coche s'il veut une animation HTML par produit.
  const [animations, setAnimations] = useState(false)
  const valid = company.trim().length > 1 && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(url.trim())

  const launch = () => {
    if (!valid) return
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    onLaunch(company.trim(), normalized, { maxProducts: volume, prompt: prompt.trim() || undefined, animations })
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-5">
      <div>
        <label htmlFor="demo-company" className="block text-sm font-medium text-white/80 mb-1.5">
          {t('de.company')}
        </label>
        <input
          id="demo-company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Ex. Jardiland"
          className="w-full rounded-lg bg-well border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
      </div>
      <div>
        <label htmlFor="demo-url" className="block text-sm font-medium text-white/80 mb-1.5">
          Site du prospect
        </label>
        <input
          id="demo-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && launch()}
          placeholder="https://www.site-du-prospect.fr"
          className="w-full rounded-lg bg-well border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
        <p className="mt-1.5 text-xs text-white/40">
          {t('de.urlHint')}
        </p>
      </div>
      <div>
        <span className="block text-sm font-medium text-white/80 mb-1.5">{t('de.productCount')}</span>
        <div className="flex items-center gap-2 flex-wrap">
          {DEMO_VOLUMES.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setVolume(v); setVolumeDraft(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                volume === v
                  ? 'bg-indigo-600 border-indigo-500 text-[#fff]'
                  : 'bg-well border-white/10 text-white/60 hover:text-white hover:border-white/25'
              }`}
            >
              {t('de.volume.items', { count: v })}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-sm text-white/60">
            {t('de.volume.exactly')}
            <input
              type="number" min={1} max={48}
              value={volumeDraft ?? String(volume)}
              onChange={(e) => {
                setVolumeDraft(e.target.value)
                const n = Number(e.target.value)
                if (e.target.value !== '' && Number.isFinite(n) && n >= 1) setVolume(n)
              }}
              onBlur={() => setVolumeDraft(null)}
              className="w-16 rounded-lg bg-well border border-white/10 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-white/40">
          {t('de.countHint')}
        </p>
      </div>
      <div>
        <label htmlFor="demo-prompt" className="block text-sm font-medium text-white/80 mb-1.5">
          {t('de.creativeBrief')} <span className="text-white/40 font-normal">{t('de.optional')}</span>
        </label>
        <textarea
          id="demo-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={t('de.briefPlaceholder')}
          className="w-full rounded-lg bg-well border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500 resize-y"
        />
        <p className="mt-1.5 text-xs text-white/40">
          {t('de.briefHint')}
        </p>
      </div>
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={animations}
          onChange={(e) => setAnimations(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/20 bg-well accent-indigo-600"
        />
        <span className="text-sm text-white/80">
          {t('de.animPerProduct')}
          <span className="block text-xs text-white/40 font-normal mt-0.5">
            {t('de.animHint')}
          </span>
        </span>
      </label>
      <button
        onClick={launch}
        disabled={!valid}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-[#fff] transition-colors"
      >
        <Rocket className="w-4 h-4" aria-hidden="true" />
        {t('de.launch')}
      </button>
      <p className="text-xs text-white/40">
        {t('de.pipelineHint')}
      </p>
    </div>
  )
}
