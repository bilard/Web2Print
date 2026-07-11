// src/features/demo-express/components/DemoExpressForm.tsx
// Écran d'entrée du wizard : nom de la société + URL d'une page produits de son
// site (page catégorie idéalement — la découverte y trouve les fiches).
import { useState } from 'react'
import { Rocket } from 'lucide-react'

interface Props {
  onLaunch: (company: string, url: string) => void
}

export function DemoExpressForm({ onLaunch }: Props) {
  const [company, setCompany] = useState('')
  const [url, setUrl] = useState('')
  const valid = company.trim().length > 1 && /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(url.trim())

  const launch = () => {
    if (!valid) return
    const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    onLaunch(company.trim(), normalized)
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface p-6 space-y-5">
      <div>
        <label htmlFor="demo-company" className="block text-sm font-medium text-white/80 mb-1.5">
          Société du prospect
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
          L’adresse d’accueil suffit : la démo descend toute seule dans les rayons du site et
          échantillonne une douzaine de produits répartis sur ses univers.
        </p>
      </div>
      <button
        onClick={launch}
        disabled={!valid}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-medium text-[#fff] transition-colors"
      >
        <Rocket className="w-4 h-4" aria-hidden="true" />
        Lancer la démo
      </button>
      <p className="text-xs text-white/40">
        Le pipeline enchaîne : charte du site → découverte produits → enrichissement → images
        DAM → feuille PIM → catalogue → fiche promo → workflow. Comptez quelques minutes.
      </p>
    </div>
  )
}
