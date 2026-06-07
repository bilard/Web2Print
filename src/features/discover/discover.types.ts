import type { ComponentType } from 'react'

/** Jeu de classes Tailwind littérales par accent (le purge v3 interdit les classes construites). */
export interface SlidePalette {
  text: string
  textSoft: string
  bg: string
  border: string
  dot: string
  glow: string
}

export type SlideKind = 'cover' | 'overview' | 'sector' | 'recap'

export interface SlideBullet {
  module: string
  text: string
}

export interface DiscoverSlide {
  id: string
  kind: SlideKind
  eyebrow: string
  title: string
  subtitle?: string
  /** Nom du secteur (slides `sector`). */
  sector?: string
  icon: ComponentType<{ className?: string }>
  palette: SlidePalette
  /** Détail module → bénéfice (slides `sector`). */
  bullets?: SlideBullet[]
  /** Puces modules affichées en pied de slide. */
  modules?: string[]
  /** Étapes de la chaîne (slide `overview`). */
  steps?: string[]
}

export const PALETTES: Record<string, SlidePalette> = {
  cyan: {
    text: 'text-cyan-300',
    textSoft: 'text-cyan-400/70',
    bg: 'bg-cyan-500/[0.1]',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-400',
    glow: 'from-cyan-500/20',
  },
  amber: {
    text: 'text-amber-300',
    textSoft: 'text-amber-400/70',
    bg: 'bg-amber-500/[0.1]',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    glow: 'from-amber-500/20',
  },
  emerald: {
    text: 'text-emerald-300',
    textSoft: 'text-emerald-400/70',
    bg: 'bg-emerald-500/[0.1]',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    glow: 'from-emerald-500/20',
  },
  fuchsia: {
    text: 'text-fuchsia-300',
    textSoft: 'text-fuchsia-400/70',
    bg: 'bg-fuchsia-500/[0.1]',
    border: 'border-fuchsia-500/30',
    dot: 'bg-fuchsia-400',
    glow: 'from-fuchsia-500/20',
  },
  rose: {
    text: 'text-rose-300',
    textSoft: 'text-rose-400/70',
    bg: 'bg-rose-500/[0.1]',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
    glow: 'from-rose-500/20',
  },
  sky: {
    text: 'text-sky-300',
    textSoft: 'text-sky-400/70',
    bg: 'bg-sky-500/[0.1]',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
    glow: 'from-sky-500/20',
  },
  indigo: {
    text: 'text-indigo-300',
    textSoft: 'text-indigo-400/70',
    bg: 'bg-indigo-500/[0.1]',
    border: 'border-indigo-500/30',
    dot: 'bg-indigo-400',
    glow: 'from-indigo-500/20',
  },
}
