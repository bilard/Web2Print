// Le chargement en cours, dans le bandeau : une barre et un chiffre.
//
// ⚠⚠ Une phrase grise perdue sous le bandeau ne se voit pas : on croit l'écran figé et on
// recharge. Une barre qui avance dit deux choses qu'aucun texte ne dit aussi vite — que ça
// travaille, et combien il reste.
//
// ⚠ Sans fraction connue (les fiches d'un concurrent se lisent d'un bloc), la barre est
// INDÉTERMINÉE : afficher un pourcentage inventé serait pire que ne rien afficher, puisqu'on
// se mettrait à attendre une progression qui ne viendra pas.
import { useTranslation } from '@/lib/i18n'

export function BiProgressBar({ label, done, total }: {
  label: string
  done: number
  /** `0` = progression inconnue : la barre balaie au lieu de se remplir. */
  total: number
}) {
  const { t } = useTranslation()
  const known = total > 0
  const pct = known ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <span
      className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-indigo-500/25 bg-indigo-500/[0.08] px-2.5 py-1"
      role="progressbar"
      aria-label={label}
      aria-valuenow={known ? pct : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      title={known ? t('bi.loading.of', { done, total }) : label}
    >
      <span className="text-[11px] text-indigo-200 truncate max-w-[220px]">{label}</span>
      <span className="relative w-24 h-1.5 rounded-full bg-white/10 overflow-hidden shrink-0">
        {known ? (
          <span className="absolute inset-y-0 left-0 rounded-full bg-indigo-400 transition-[width] duration-300"
            style={{ width: `${pct}%` }} />
        ) : (
          /* Balayage : il dit « ça travaille » sans prétendre savoir où on en est.
             ⚠ L'animation vient de `index.css` — elle existe déjà pour les barres
             indéterminées de l'application, et deux définitions finiraient par diverger. */
          <span className="progress-indeterminate absolute inset-y-0 w-1/3 rounded-full bg-indigo-400" />
        )}
      </span>
      {known && (
        <span className="text-[11px] tabular-nums text-indigo-200/80 shrink-0">{pct} %</span>
      )}
    </span>
  )
}
