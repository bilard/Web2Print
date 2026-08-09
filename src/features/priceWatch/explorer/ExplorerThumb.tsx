// La vignette produit de l'explorateur, avec son ÉTAT. Partagée par la vue appariée et
// par « Mon catalogue » : deux vignettes distinctes divergeaient déjà (l'une signalait une
// adresse morte, l'autre non).
//
// Une URL morte laissait l'icône de fichier cassé du navigateur, indiscernable d'un visuel
// réel tant qu'on ne zoomait pas. On retombe sur un repli — mais il DIT lequel des cas
// s'applique : « aucune adresse relevée » se corrige en relançant la collecte ou en
// réglant le préfixe, « adresse injoignable » désigne le site distant. Confondre les deux,
// c'est chercher la panne du mauvais côté.
//
// ⚠ Le troisième état, l'ATTENTE, est celui qui manquait. Les serveurs d'images des
// fournisseurs sont servis six requêtes à la fois (limite du navigateur par hôte) : sur
// une page de quarante lignes, les dernières mettent des dizaines de secondes à arriver et
// l'écran se lisait comme un catalogue sans photos. Le fond qui bat dit « ça vient ».
import { useEffect, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

export function ExplorerThumb({ src, alt = '', size = 'h-16 w-16' }: {
  /** Adresse ABSOLUE du visuel, ou null quand aucune n'a été relevée. */
  src: string | null
  alt?: string
  /** Classes de dimension : la liste appariée donne de la place au visuel, le catalogue
   *  aligne quarante lignes à l'écran. */
  size?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  // ⚠ Une image DÉJÀ en cache est complète avant que React n'ait posé ses gestionnaires :
  // sans cette relecture au montage, `onLoad` ne partirait jamais et la vignette resterait
  // en attente perpétuelle — exactement le contraire de ce que ce composant corrige.
  useEffect(() => {
    setState('loading')
    const el = ref.current
    if (el?.complete) setState(el.naturalWidth > 0 ? 'ok' : 'error')
  }, [src])

  if (!src || state === 'error') {
    const broken = !!src
    return (
      <div title={broken ? t('pwx.thumb.broken', { url: src }) : t('pwx.thumb.none')}
        className={`${size} shrink-0 rounded bg-well border flex items-center justify-center cursor-help ${
          broken ? 'border-amber-400/25' : 'border-white/10'
        }`}>
        <ImageOff className={`w-4 h-4 ${broken ? 'text-amber-400/40' : 'text-white/20'}`} />
      </div>
    )
  }

  return (
    <div className={`${size} shrink-0 rounded overflow-hidden border border-white/10 ${
      state === 'loading' ? 'bg-white/[0.06] animate-pulse' : 'bg-[#fff]'
    }`}>
      {/* `no-referrer` : beaucoup de marchands bloquent le hotlink en lisant le Referer.
          Sans en-tête, le CDN sert l'image comme à un accès direct. */}
      <img ref={ref} src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onLoad={() => setState('ok')} onError={() => setState('error')}
        className={`w-full h-full object-contain transition-opacity ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  )
}
