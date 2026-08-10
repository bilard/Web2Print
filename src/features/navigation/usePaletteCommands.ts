// Source des commandes de la palette ⌘K : modules visibles (mêmes droits que la
// sidebar) + actions globales (réglages, thème). Fournit aussi le filtre de recherche
// (insensible aux accents, tous les mots de la requête doivent matcher).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import { Moon, Sun, Settings, FileText } from 'lucide-react'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { useVisibleModules, type Section } from './modules'
import { useThemeStore } from '@/stores/theme.store'
import { useTranslation, translate, type TranslationKey } from '@/lib/i18n'

/** Regroupement dans la palette — un ID stable, jamais le libellé affiché. */
export type PaletteGroupId = 'recent' | 'modules' | 'actions'

export interface PaletteCommand {
  id: string
  /** ⚠️ Le regroupement se fait sur cet ID ; l'affichage passe par `t()`. */
  groupId: PaletteGroupId
  label: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
  accent?: string
  run: () => void
}

/** Ordre d'affichage des groupes + clé de traduction de leur en-tête. */
export const PALETTE_GROUPS: { id: PaletteGroupId; labelKey: TranslationKey }[] = [
  { id: 'recent',  labelKey: 'palette.group.recent' },
  { id: 'modules', labelKey: 'palette.group.modules' },
  { id: 'actions', labelKey: 'palette.group.actions' },
]

/** Projets récents (id + titre), chargés seulement quand la palette est ouverte. */
function useRecentProjects(enabled: boolean) {
  const uid = useAuthStore((s) => s.user?.uid)
  return useQuery({
    queryKey: ['palette-recent-projects', uid],
    enabled: enabled && !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'projects'),
          where('ownerId', '==', uid),
          orderBy('updatedAt', 'desc'),
          limit(8),
        ),
      )
      return snap.docs.map((d) => ({ id: d.id, title: (d.data().title as string | undefined) ?? '' }))
    },
  })
}

/**
 * Synonymes de recherche par module (en plus du label affiché).
 *
 * ⚠️ BILINGUE À DESSEIN — on n'entre PAS ces mots dans le catalogue i18n.
 * `filterCommands` exige que TOUS les mots tapés matchent : si les synonymes
 * suivaient la langue, un utilisateur en anglais taperait « library » sur une
 * app en français (ou l'inverse) et la palette resterait vide. On concatène
 * donc FR + EN, quelle que soit la locale : dans une palette, on tape ce qui
 * vient. Sans accents — `normalize()` les retire côté requête.
 */
const MODULE_KEYWORDS: Partial<Record<Section, string>> = {
  blank: 'nouveau document creer vierge editeur canvas new blank create editor',
  import: 'importer fichier pdf idml pptx upload import file',
  library: 'bibliotheque projets documents ouvrir library projects open',
  images: 'dam images assets photos medias banque media bank pictures',
  data: 'pim produits donnees fiches catalogue excel products data sheets',
  taxonomies: 'taxonomies categories arborescence hierarchie taxonomy tree hierarchy',
  'mfr-insights': 'ecarts fabricant comparaison manufacturer gaps insights',
  'scraping-templates': 'templates scraping extraction selecteurs selectors',
  'scraping-hub': 'scraping hub regles crawl enrichissement rules enrichment',
  'price-watch': 'veille tarifaire prix concurrents price monitoring watch competitors',
  'watch-ops': 'suivi avancement traitements en cours veille progress monitoring',
  'demo-express': 'demo express prospect seeding',
  'retail-promo': 'creation studio promo prospectus affiche retail poster',
  catalog: 'catalogue studio pages chemin de fer catalogue print',
  workflows: 'workflows automation pipeline cron zapier make',
  telegram: 'telegram bot messages inbox',
  hyperframes: 'animation video hyperframes film rendu render',
  chat: 'chat ia assistant llm conversation ai',
  finances: 'finances couts budget costs spend',
  access: 'utilisateurs roles permissions admin rbac users',
}

export function usePaletteCommands(close: () => void, open = false): PaletteCommand[] {
  const navigate = useNavigate()
  const modules = useVisibleModules()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const setThemePref = useThemeStore((s) => s.setThemePref)
  const { data: recentProjects } = useRecentProjects(open)
  const { t } = useTranslation()

  return useMemo(() => {
    const go = (section: Section | 'settings') => {
      close()
      navigate('/dashboard', { state: { section } })
    }
    const commands: PaletteCommand[] = modules.map((m) => ({
      id: `module:${m.id}`,
      groupId: 'modules',
      label: t(m.labelKey),
      // Label traduit + label FR + synonymes bilingues : cherchable dans les
      // deux langues, quelle que soit la locale active.
      keywords: `${t(m.labelKey)} ${translate('fr', m.labelKey)} ${MODULE_KEYWORDS[m.id] ?? ''}`,
      icon: m.icon,
      accent: m.accent,
      run: () => go(m.id),
    }))
    for (const p of recentProjects ?? []) {
      // Le repli « Sans titre » se fait ICI et pas dans la requête Firestore :
      // il doit suivre la langue, et `useRecentProjects` n'a pas accès à `t`.
      const title = p.title || t('palette.untitled')
      commands.push({
        id: `project:${p.id}`,
        groupId: 'recent',
        label: title,
        keywords: `${title} projet document ouvrir editeur project open editor`,
        icon: FileText,
        accent: 'text-sky-400',
        run: () => {
          close()
          navigate(`/editor/${p.id}`)
        },
      })
    }
    commands.push({
      id: 'action:settings',
      groupId: 'actions',
      label: t('palette.action.settings'),
      keywords: 'reglages settings parametres connecteurs cles api keys',
      icon: Settings,
      run: () => go('settings'),
    })
    commands.push({
      id: 'action:theme',
      groupId: 'actions',
      label: t(resolvedTheme === 'dark' ? 'palette.action.themeLight' : 'palette.action.themeDark'),
      keywords: 'theme clair sombre dark light mode apparence appearance',
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      run: () => {
        setThemePref(resolvedTheme === 'dark' ? 'light' : 'dark')
        close()
      },
    })
    return commands
  }, [modules, navigate, close, resolvedTheme, setThemePref, recentProjects, t])
}

/** Minuscules + accents retirés : « Bibliothèque » matche « bibliotheque ». */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Tous les mots de la requête doivent être des sous-chaînes des keywords. */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const tokens = normalize(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return commands
  return commands.filter((c) => {
    const haystack = normalize(c.keywords)
    return tokens.every((t) => haystack.includes(t))
  })
}
