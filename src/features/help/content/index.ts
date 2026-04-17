import type { HelpSection } from './types'
import { STUBS } from './_stubs'
import { gettingStarted } from './getting-started'

export const helpSections: HelpSection[] = [
  gettingStarted,
  ...STUBS,
]

export const helpSectionsById: Map<string, HelpSection> = new Map(
  helpSections.map((s) => [s.id, s]),
)
