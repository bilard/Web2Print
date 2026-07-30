// Accès direct aux tableaux de bord de facturation des connecteurs externes (Claude, Firecrawl,
// Jina, Bright Data). Les coûts affichés ici sont notre estimation interne ; ces liens ouvrent
// la facturation OFFICIELLE de chaque fournisseur pour vérifier/recharger le solde.
import { ExternalLink } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'

interface BillingLink { label: string; url: string; hex: string }

const LINKS: BillingLink[] = [
  { label: 'Claude', url: 'https://platform.claude.com/settings/billing', hex: '#818cf8' },
  { label: 'Firecrawl', url: 'https://www.firecrawl.dev/app/t/LsorYp6HkrX/usage', hex: '#fbbf24' },
  { label: 'Jina', url: 'https://jina.ai/api-dashboard', hex: '#fbbf24' },
  { label: 'Bright Data', url: 'https://brightdata.fr/cp/billing/invoices', hex: '#fbbf24' },
]

export function BillingLinks() {
  const { t } = useTranslation()
  return (
    <div className="bg-surface rounded-lg p-3 flex flex-wrap items-center gap-2">
      <span className="text-white/40 text-[11px] uppercase tracking-wide mr-1">{t('fin.billing.title')}</span>
      {LINKS.map((l) => (
        <a
          key={l.label}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-well hover:bg-white/10 text-white/80 hover:text-white text-xs transition-colors"
          title={t('fin.billing.open', { provider: l.label })}
        >
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: l.hex }} />
          {l.label}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </a>
      ))}
    </div>
  )
}
