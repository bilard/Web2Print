import { useMemo } from 'react'
import { ExternalLink } from 'lucide-react'
import { detectBrandFromUrl } from './useJina'

interface Props {
  /** URL active dans le tab — déclenche la détection si elle pointe vers un revendeur connu. */
  url: string
  /** Callback appelé quand l'utilisateur accepte la suggestion. */
  onAccept: (suggestedUrl: string) => void
}

/** Bandeau de suggestion : si l'URL est sur un revendeur (Castorama, Leroy Merlin,
 *  Boulanger…) ET que la marque est détectable depuis le slug (AEG, Bosch, Milwaukee…),
 *  propose de basculer vers le site fabricant officiel pour une qualité de données
 *  bien meilleure (les revendeurs anti-bot DataDome livrent souvent du contenu pollué). */
export function BrandSuggestion({ url, onAccept }: Props) {
  const brandSuggestion = useMemo(() => detectBrandFromUrl(url), [url])
  if (!brandSuggestion) return null

  let hostname = brandSuggestion.officialSite.baseUrl
  try { hostname = new URL(brandSuggestion.officialSite.baseUrl).hostname } catch { /* ignore */ }

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
      <ExternalLink className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <p className="text-[11px] text-amber-300/80 flex-1">
        <strong>{brandSuggestion.officialSite.label}</strong> détecté — privilégier le site officiel pour des données complètes
      </p>
      <button
        onClick={() => onAccept(brandSuggestion.officialSite.baseUrl)}
        className="text-[10px] px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/20 transition-colors whitespace-nowrap"
      >
        {hostname}
      </button>
    </div>
  )
}
