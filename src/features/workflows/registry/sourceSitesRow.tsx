// Ligne dense (2 niveaux) du tableau « Sites sources » :
//   niveau 1 — activation · domaine · ACTIVITÉ (scraping… animé | verdict ✓/⚠/✗ de la
//   dernière passe) · corbeille ; niveau 2 — moteur forcé + chips de stats insécables.
// Pendant la moisson : ring vert pulsé + barre de balayage animée (progress-indeterminate).
// Après la passe : badge verdict lisible d'un coup d'œil, pop fx-result s'il vient de tomber.
import { Trash2, Lock, LockOpen, Play, Loader2, RotateCcw, ExternalLink, Square } from 'lucide-react'
import { agoShort, pct } from '@/features/priceWatch/dashboard/format'
import { siteStatus, SITE_STATUS_META } from '@/features/priceWatch/sourceSites'
import { displayDomain, siteHomeUrl } from '@/features/priceWatch/siteLink'
import { t } from '@/lib/i18n'

export interface SiteRowStats {
  products?: number
  /** Battement de MOISSON (écrit par une passe de scraping seulement). ⚠ `updatedAt` ne
   *  convient PAS pour « en cours » : le node « Comparer » réécrit la méta de TOUS les
   *  concurrents dans la même rafale → « 12 en cours » alors que rien ne scrapait. */
  harvestBeatAt?: number
  pctPrice?: number
  matched?: number
  /** Produits où CE concurrent est moins cher que vous (alerte). */
  cheaper?: number
  /** Écart % MOYEN du concurrent face à VOS prix. Conservé pour les rapports persistés
   *  avant la médiane — c'est `medGapPct` qui s'affiche. */
  avgGapPct?: number | null
  /** Écart % MÉDIAN du concurrent face à VOS prix. < 0 = il vend moins cher que vous.
   *  Statistique de position : la moyenne d'un ratio non borné en haut (lot de 10 face à
   *  votre unité, variante mal appariée) dérivait à +300 % sur quelques aberrations. */
  medGapPct?: number | null
  updatedAt?: number
  lastEngine?: string
  harvestProgress?: number
  harvestSweeps?: number
  /** Mise en attente par le mode cycle (balayage terminé, on patiente les retardataires). */
  cycleWaitingAt?: number
  /** Résultat de la dernière passe de moisson (verdict). */
  /** Durée de la DERNIÈRE passe (ms) — avec `lastPassPages`, donne le débit réel. */
  lastHarvestMs?: number
  lastPassPages?: number
  lastPassProducts?: number
  lastPassAt?: number
}

/** Libellés du moteur réellement utilisé. 'cloudFunction' = fetch serveur (Cloud
 *  Function fetchPageHtml, palier 1 gratuit de la cascade Auto). */
const ENGINE_LABELS: Record<string, string> = {
  cloudFunction: 'Serveur', jina: 'Jina', proxy: 'Proxy', firecrawl: 'Firecrawl',
  brightdata: 'BD', authenticated: 'Connecté', browseract: 'BrowserAct',
}
const ENGINE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'jina', label: 'Jina' },
  { value: 'firecrawl', label: 'Firecrawl' },
  { value: 'brightdata', label: 'Bright Data' },
]

/** Canal de relevé du site. Vide = les deux (comportement historique).
 *  Un généraliste (Leroy Merlin, marketplace) doit passer en « Recherche dirigée » :
 *  balayer ses catégories coûte des heures pour presque aucun produit apparié. */
const MODE_OPTIONS = [
  { value: '', label: 'Les deux' },
  { value: 'harvest', label: 'Moisson' },
  { value: 'directed', label: 'Recherche' },
]

const TONE_BADGE: Record<'ok' | 'warn' | 'err' | 'mute', string> = {
  ok: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
  warn: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
  err: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
  mute: 'text-white/40 bg-white/[0.04] border-white/10',
}

/** Badge de statut d'une ligne : mot LISIBLE (OK / Sans produit / Bloqué / Jamais) +
 *  détail chiffré, sans dépendre du tooltip. null pour un site désactivé (ligne grisée). */
function statusBadge(status: 'ok' | 'empty' | 'error' | 'waiting' | 'directed' | 'never' | 'disabled', s: SiteRowStats): { cls: string; icon: string; label: string; detail: string; title: string } | null {
  if (status === 'disabled') return null
  const meta = SITE_STATUS_META[status]
  const pages = s.lastPassPages ?? 0
  const products = s.lastPassProducts ?? 0
  const detail =
    status === 'ok' ? `+${products.toLocaleString('fr-FR')}` :
    status === 'empty' ? `${pages} p` :
    status === 'error' ? '0 page' :
    status === 'directed' ? `${(s.products ?? 0).toLocaleString('fr-FR')} fiches` : ''
  const engineLabel = s.lastEngine ? (ENGINE_LABELS[s.lastEngine] ?? s.lastEngine) : null
  const title =
    status === 'ok' ? `Dernière passe : ${products} produit(s) indexé(s) sur ${pages} page(s)` :
    status === 'empty' ? `${pages} page(s) lue(s) mais aucun produit extrait — gabarit de liste non reconnu ?` :
    status === 'waiting'
      ? 'Son balayage est TERMINÉ. Le mode cycle attend que tous les concurrents aient fini avant d’en rouvrir un pour tous — ce site ne repartira donc qu’à la fin du cycle. Désactive le cycle dans le planning si tu veux qu’il reparte tout de suite.' :
    status === 'directed'
      ? 'Ce site n\u2019est PAS moissonnable : son accueil ne rend aucune cat\u00e9gorie cible (marketplace / anti-bot). Il est aliment\u00e9 par la \u00ab Recherche dirig\u00e9e \u00bb, r\u00e9f\u00e9rence par r\u00e9f\u00e9rence \u2014 ce qui est le mode de fonctionnement pr\u00e9vu, pas une panne. Ses fiches sont bien index\u00e9es.' :
    status === 'error'
      ? (engineLabel
          ? `Page bien récupérée (via ${engineLabel}) mais AUCUN catalogue PrestaShop trouvé — marketplace ou structure non reconnue. Utilise la « Recherche dirigée » pour ce site.`
          : 'Aucune page récupérée — site bloqué / inaccessible (essaie un autre moteur ou un accès connecté).')
      : 'Jamais moissonné'
  return { cls: TONE_BADGE[meta.tone], icon: meta.icon, label: t(meta.labelKey), detail, title }
}

/**
 * Un chiffre de la rangée de stats.
 *
 * `strong` distingue les trois mesures COMMERCIALES (appariés, écart médian, produits où
 * il est moins cher) des compteurs de collecte. Sans cette hiérarchie, neuf chiffres du
 * même gris se valaient à l'œil, et la seule question qui compte — « où suis-je face à
 * lui ? » — se cherchait au milieu de mesures d'intendance.
 */
function chip(label: string, value: string, tone: 'ok' | 'warn' | 'mute', title?: string, strong?: boolean): JSX.Element {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-white/55'
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${strong ? 'text-[11px]' : ''}`} title={title}>
      <span className={strong ? 'text-white/45' : 'text-white/35'}>{label}</span>
      <span className={`tabular-nums ${strong ? 'font-semibold' : ''} ${color}`}>{value}</span>
    </span>
  )
}

export function SourceSitesRowItem({ domain, enabled, engine, mode, auth, pageBudget, stats, live, now, onToggle, onEngine, onMode, onAuth, onBudget, onScrape, onStopScrape, scraping, onReset, onRemove }: {
  domain: string
  enabled: boolean
  engine: string
  /** Canal de relevé ('' = moisson ET recherche dirigée). */
  mode?: string
  /** Pages RÉSERVÉES à ce site par run (vide = part du budget commun). */
  pageBudget?: number
  /** Site à prix connectés (identifiants configurés). */
  auth: boolean
  stats: SiteRowStats
  /** true = heartbeat de moisson récent → scraping en cours (ring pulsé + barre animée). */
  live: boolean
  /** Horloge partagée du parent (tick 30 s). */
  now: number
  onToggle: (enabled: boolean) => void
  onEngine: (engine: string) => void
  /** Change le canal de relevé ('' = les deux). */
  onMode: (mode: string) => void
  /** Ouvre le mini-formulaire d'identifiants (accès connecté). */
  onAuth: () => void
  /** Réserve un budget de pages pour ce site (undefined = revenir au partage commun). */
  onBudget: (pages: number | undefined) => void
  /** Lance une moisson de CE site seul (bouton ▶). */
  onScrape: () => void
  /** Interrompt la moisson en cours. Ce qui est déjà collecté reste écrit. */
  onStopScrape: () => void
  /** true = ce site est en cours de moisson manuelle (spinner). */
  scraping: boolean
  /** Réinitialise les données collectées de ce site (destructif). */
  onReset: () => void
  onRemove: () => void
}) {
  const scraped = stats.updatedAt != null
  const shortName = displayDomain(domain)
  const swept = (stats.harvestProgress ?? 0) >= 1
  const status = siteStatus({
    enabled, live, lastPassAt: stats.lastPassAt, lastPassPages: stats.lastPassPages,
    lastPassProducts: stats.lastPassProducts, cycleWaitingAt: stats.cycleWaitingAt,
    productCount: stats.products,
  })
  const badge = status === 'live' ? null : statusBadge(status as 'ok' | 'empty' | 'error' | 'waiting' | 'directed' | 'never' | 'disabled', stats)
  // Le verdict vient de tomber (< 2 min) → pop d'apparition pour attirer l'œil.
  const fresh = stats.lastPassAt != null && now - stats.lastPassAt < 2 * 60_000
  // « En cours » = heartbeat de moisson récent OU relance manuelle immédiate (bouton ▶) :
  // le clic doit allumer la carte SANS attendre le prochain battement Firestore.
  const working = live || scraping
  return (
    <div
      className={`relative rounded-lg px-2 py-1.5 overflow-hidden transition-colors ${
        working ? 'bg-emerald-500/[0.07] ring-1 ring-emerald-400/40' : 'bg-white/[0.03]'
      } ${enabled ? '' : 'opacity-45'}`}
    >
      {/* Niveau 1 — IDENTITÉ + ÉTAT + ACTIONS : activer · nom COMPLET sur une seule ligne
          (police adaptée à la longueur, jamais tronqué) · verdict de la dernière passe ·
          ▶ 🔓 ↺ 🗑 à droite. L'état tenait une rangée à lui seul : à 17 concurrents, cette
          ligne quasi vide faisait défiler une carte de plus par écran pour rien. */}
      <div className="flex items-center gap-1.5 min-w-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="shrink-0 accent-indigo-500"
          title={t(enabled ? 'ss.disableSite' : 'ss.enableSite')}
        />
        {/* Le nom OUVRE le site : vérifier une anomalie (prix aberrant, fiche vide, page
            d'accueil qui a changé de structure) commence par aller voir chez le concurrent.
            Sans ce lien il fallait recopier le domaine à la main dans un autre onglet. */}
        <a
          href={siteHomeUrl(domain)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Ouvrir ${shortName} dans un nouvel onglet`}
          className={`group shrink-0 inline-flex items-center gap-1 whitespace-nowrap font-semibold text-white hover:text-indigo-300 transition-colors ${
            shortName.length > 30 ? 'text-[10px]' : shortName.length > 24 ? 'text-[11px]' : shortName.length > 18 ? 'text-xs' : 'text-sm'
          }`}
        >
          {shortName}
          <ExternalLink className="w-2.5 h-2.5 shrink-0 text-white/30 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
        <div className="flex-1 min-w-0 flex items-center overflow-hidden">
          {working ? (
            /* Cartouche FIXE, comme les verdicts : même bordure, même fond, même gabarit.
               Le texte clignotait — sur quatorze lignes en cours, quatorze pastilles
               pulsant à contretemps rendaient la colonne illisible, et l'état « en cours »
               moins repérable que les autres alors qu'il est le plus consulté. */
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-medium border rounded-md px-1.5 py-0.5 bg-emerald-500/15 border-emerald-500/40 text-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" aria-hidden />
              {scraping ? 'Scraping…' : 'En cours…'}
            </span>
          ) : badge ? (
            <span
              title={badge.title}
              className={`inline-flex items-center whitespace-nowrap text-[10px] font-medium tabular-nums border rounded-md px-1.5 py-0.5 ${badge.cls} ${fresh ? 'fx-result' : ''}`}
            >
              {badge.icon} {badge.label}{badge.detail ? ` · ${badge.detail}` : ''}
            </span>
          ) : <span className="text-[10px] text-white/20 italic whitespace-nowrap">{t('ss.neverScraped')}</span>}
        </div>
        <div className="shrink-0 flex items-center gap-0.5 -mr-1">
          {/* ⚠ Pendant la moisson, le bouton devient un ARRÊT — il ne se contente pas de
              tourner, désactivé. Une moisson lancée par erreur sur un gros catalogue
              n'avait aucune sortie : il fallait recharger la page, ce qui laisse le
              curseur dans un état qu'on ne choisit pas. Les pages déjà collectées, elles,
              restent écrites : l'arrêt ne perd rien. */}
          {scraping ? (
            <button
              onClick={onStopScrape}
              title={t('ss.scrape.stop')}
              className="transition-colors p-1 rounded hover:bg-white/5 text-rose-400 hover:text-rose-300 group/stop"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 group-hover/stop:hidden" />
              <Square className="w-3.5 h-3.5 hidden group-hover/stop:block" />
            </button>
          ) : (
            <button
              onClick={onScrape}
              disabled={live}
              title={t('ss.scrape.start')}
              className="transition-colors p-1 rounded hover:bg-white/5 text-white/35 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onAuth}
            title={t(auth ? 'ss.authConfigured' : 'ss.authConfigure')}
            className={`transition-colors p-1 rounded hover:bg-white/5 ${auth ? 'text-emerald-400 hover:text-emerald-300' : 'text-white/35 hover:text-indigo-400'}`}
          >
            {auth ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onReset}
            title={t('ss.reset.title')}
            className="text-white/35 hover:text-amber-400 transition-colors p-1 rounded hover:bg-white/5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRemove}
            title="Retirer ce site"
            className="text-white/35 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {/* Niveau 2 — RÉGLAGES du site, dans l'ordre où on les décide : PAR QUEL canal on
          le relève, PAR QUEL moteur on le lit, COMBIEN de pages on lui réserve. `flex-wrap`
          garantit qu'aucun contrôle ne sort de la carte, quelle que soit la largeur du
          panneau. */}
      <div className="flex flex-wrap items-center gap-1 pl-6 mt-1">
        <select
          value={mode ?? ''}
          onChange={(e) => onMode(e.target.value)}
          title={t('ss.channel.title')}
          className="shrink-0 bg-well border border-white/10 rounded text-[10px] text-white/60 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
        >
          {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          // Un moteur retiré depuis (ex. BrowserAct) laisserait un select VIDE :
          // on retombe explicitement sur Auto, qui est le comportement réel.
          value={ENGINE_OPTIONS.some((o) => o.value === engine) ? engine : 'auto'}
          onChange={(e) => onEngine(e.target.value)}
          title="Moteur de scraping (Auto = cascade standard)"
          className="shrink-0 bg-well border border-white/10 rounded text-[10px] text-white/60 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
        >
          {ENGINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {/* Budget RÉSERVÉ : bride un concurrent coûteux (Bright Data est facturé à la
            requête) sans rationner les sites gratuits. Vide = part du budget commun. */}
        <input
          type="number"
          min={1}
          value={pageBudget ?? ''}
          onChange={(e) => onBudget(e.target.value.trim() ? Math.max(1, Number(e.target.value)) : undefined)}
          placeholder="pages"
          title={t('ss.pages.title')}
          className="shrink-0 w-14 bg-well border border-white/10 rounded text-[10px] text-white/60 px-1 py-0.5 focus:outline-none focus:border-indigo-500/50"
        />
        {/* BrowserAct n'a pas de primitive « lis cette URL » : sans bot, il n'y a rien à
            exécuter. Le champ n'apparaît donc QUE pour ce moteur, et son absence se voit
            (bordure ambre) plutôt que d'échouer au premier fetch. */}
      </div>
      {/* Niveau 3 — STATS sur UNE rangée : données (produits · prix · appariés) puis
          moisson (familles · moteur · dernier scrape). Elles occupaient deux rangées pour
          éviter un wrap aléatoire ; l'ordre logique suffit à les lire de gauche à droite,
          et `flex-wrap` ne renvoie à la ligne que si le panneau est vraiment étroit. */}
      {scraped && (
        <div className="pl-6 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px]">
          {/* D'ABORD la COMPARAISON — c'est la raison d'être du site : où se situent VOS
              prix face à lui. Les compteurs de collecte (combien de fiches il expose,
              où en est le balayage) ne disent rien de commercial et passent après.
              Compteur PAR SITE = paires produit×concurrent : le KPI du tableau de bord
              compte des produits DISTINCTS, donc additionner les sites le dépasse
              forcément (un produit vendu par 5 concurrents pèse 5 ici, 1 là-bas). */}
          {stats.matched != null && chip('appariés', stats.matched.toLocaleString('fr-FR'), stats.matched > 0 ? 'ok' : 'mute',
            'Vos produits retrouvés CHEZ CE CONCURRENT. N’additionnez pas les sites : un produit vendu par plusieurs concurrents est compté une fois par site, mais une seule fois dans le total du tableau de bord.', true)}
          {(() => {
            // Médiane d'abord ; moyenne en repli pour les rapports antérieurs.
            const gap = stats.medGapPct ?? stats.avgGapPct
            if (gap == null) return null
            const isMedian = stats.medGapPct != null
            return chip('son écart', pct(gap), gap < -1 ? 'warn' : 'ok',
              isMedian
                ? 'Écart MÉDIAN de SES prix face aux vôtres, sur les produits appariés. Négatif = il vend moins cher que vous. La médiane et non la moyenne : quelques appariements aberrants (lot de 10 face à votre unité) suffisent à faire dériver une moyenne à +300 %.'
                : 'Écart MOYEN de SES prix face aux vôtres (rapport antérieur à la médiane) — relancez « Comparer catalogue » pour obtenir la médiane, plus fiable.',
              true)
          })()}
          {stats.cheaper != null && stats.matched != null && stats.matched > 0 && chip(
            'moins cher sur', `${stats.cheaper.toLocaleString('fr-FR')}/${stats.matched.toLocaleString('fr-FR')}`,
            stats.cheaper > 0 ? 'warn' : 'ok',
            'Nombre de vos produits sur lesquels CE concurrent est moins cher que vous.', true)}
          {/* Ensuite seulement, la collecte — séparée à l'œil, pour qu'on ne cherche plus
              les trois chiffres commerciaux au milieu des mesures d'intendance. */}
          <span className="text-white/15" aria-hidden>|</span>
          {chip('fiches', (stats.products ?? 0).toLocaleString('fr-FR'), (stats.products ?? 0) > 0 ? 'ok' : 'mute',
            'Fiches distinctes relevées sur CE site (doublons de pagination exclus). Ce n’est pas votre catalogue : c’est le sien.')}
          {stats.pctPrice != null && chip('prix', `${stats.pctPrice}%`, stats.pctPrice >= 80 ? 'ok' : 'warn',
            'Part des fiches relevées ici qui portent un prix. Un site qui charge ses prix en JavaScript reste bas.')}
          {/* Un seul mot « familles » portait DEUX mesures : ×23 = catalogue balayé 23 fois
              de bout en bout ; 1 % = avancement du balayage EN COURS. Deux libellés. */}
          {swept
            ? chip('balayages', `×${stats.harvestSweeps ?? 1} ✓`, 'ok',
                'Nombre de fois que le catalogue de ce site a été parcouru de bout en bout. Chaque tour rafraîchit les prix déjà relevés.')
            : stats.harvestProgress != null && chip('balayage', `${Math.round(stats.harvestProgress * 100)}%`, 'mute',
                'Avancement du parcours EN COURS de son catalogue : part des catégories déjà visitées. Atteint 100 %, il repart pour un tour.')}
          {/* DÉBIT de la dernière passe : c'est LE chiffre qui départage les moteurs.
              Firecrawl rend le JS et défile la page (10-30 s), Jina lit en quelques
              secondes — sur un site qui rend déjà ses prix sans JS, forcer Firecrawl
              divise le débit sans rien apporter. Mesuré, plus supposé. */}
          {(() => {
            const ms = stats.lastHarvestMs
            const pages = stats.lastPassPages
            if (!ms || ms < 1000 || !pages) return null
            const perMin = Math.round((pages / (ms / 60_000)) * 10) / 10
            return chip('débit', `${perMin.toLocaleString('fr-FR')} p/min`, perMin >= 6 ? 'ok' : 'warn',
              `Pages lues par minute à la dernière passe (${pages} page(s) en ${Math.round(ms / 1000)} s). Comparez ce chiffre d’un moteur à l’autre : Firecrawl rend le JavaScript et défile la page (lent, payant), Jina lit en quelques secondes. Sur un site dont les prix sont déjà lisibles sans JavaScript — « prix » proche de 100 % — forcer Firecrawl divise le débit sans rien apporter.`)
          })()}
          {stats.lastEngine && chip('via', ENGINE_LABELS[stats.lastEngine] ?? stats.lastEngine, 'mute',
            'Outil qui a réellement fourni le HTML à la dernière passe. « Auto » escalade Cloud Function → Jina → Firecrawl → Bright Data ; un moteur choisi dans la liste ci-dessus est imposé.')}
          {chip('scrape', agoShort(stats.harvestBeatAt ?? stats.updatedAt, now), 'mute',
            'Ancienneté de la dernière passe de collecte sur ce site.')}
        </div>
      )}
      {/* Barre de balayage animée pendant la moisson (très visible, style TopProgressBar) */}
      {working && (
        <div className="absolute bottom-0 left-1 right-1 h-[3px] overflow-hidden rounded-full" aria-hidden>
          <div className="progress-indeterminate absolute top-0 h-full w-1/3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
        </div>
      )}
    </div>
  )
}
