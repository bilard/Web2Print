// src/features/navigation/usePaletteCommands.ts
// Source des commandes de la palette ⌘K : modules visibles (mêmes droits que la
// sidebar) + actions globales (réglages, thème). Fournit aussi le filtre de recherche
// (insensible aux accents, tous les mots de la requête doivent matcher).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, Settings } from 'lucide-react'
import { useVisibleModules, type Section } from './modules'
import { useThemeStore } from '@/stores/theme.store'

export interface PaletteCommand {
  id: string
  group: 'Modules' | 'Actions'
  label: string
  keywords: string
  icon: React.ComponentType<{ className?: string }>
  accent?: string
  run: () => void
}

// Synonymes de recherche par module (en plus du label) — pensés pour la frappe rapide.
const MODULE_KEYWORDS: Partial<Record<Section, string>> = {
  blank: 'nouveau document creer vierge editeur canvas',
  import: 'importer fichier pdf idml pptx upload',
  library: 'bibliotheque projets documents ouvrir',
  images: 'dam images assets photos medias banque',
  data: 'pim produits donnees fiches catalogue excel',
  taxonomies: 'taxonomies categories arborescence hierarchie',
  'scraping-templates': 'templates scraping extraction selecteurs',
  'scraping-hub': 'scraping hub regles crawl enrichissement',
  workflows: 'workflows automation pipeline cron zapier make',
  telegram: 'telegram bot messages inbox',
  hyperframes: 'animation video hyperframes film rendu',
  chat: 'chat ia assistant llm conversation',
  access: 'utilisateurs roles permissions admin rbac',
}

export function usePaletteCommands(close: () => void): PaletteCommand[] {
  const navigate = useNavigate()
  const modules = useVisibleModules()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const setThemePref = useThemeStore((s) => s.setThemePref)

  return useMemo(() => {
    const go = (section: Section | 'settings') => {
      close()
      navigate('/dashboard', { state: { section } })
    }
    const commands: PaletteCommand[] = modules.map((m) => ({
      id: `module:${m.id}`,
      group: 'Modules',
      label: m.label,
      keywords: `${m.label} ${MODULE_KEYWORDS[m.id] ?? ''}`,
      icon: m.icon,
      accent: m.accent,
      run: () => go(m.id),
    }))
    commands.push({
      id: 'action:settings',
      group: 'Actions',
      label: 'Ouvrir les Réglages',
      keywords: 'reglages settings parametres connecteurs cles api',
      icon: Settings,
      run: () => go('settings'),
    })
    commands.push({
      id: 'action:theme',
      group: 'Actions',
      label: resolvedTheme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre',
      keywords: 'theme clair sombre dark light mode apparence',
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      run: () => {
        setThemePref(resolvedTheme === 'dark' ? 'light' : 'dark')
        close()
      },
    })
    return commands
  }, [modules, navigate, close, resolvedTheme, setThemePref])
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
