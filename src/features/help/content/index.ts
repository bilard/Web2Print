import type { HelpSection } from './types'
import { STUBS } from './_stubs'

export const helpSections: HelpSection[] = [
  ...STUBS,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
