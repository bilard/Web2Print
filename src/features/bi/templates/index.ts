// Le catalogue des modèles, et la fabrique qui en tire un tableau de bord écrivable.
// PUR : ni React, ni Firestore, ni i18n — la traduction est INJECTÉE par l'appelant.
import type { TranslationKey } from '@/lib/i18n'
import { FIRST_PAGE_ID, DASHBOARD_VERSION, type DashboardDraft, type DashboardPage } from '../types'
import { watchGapsTemplate } from './watchGaps'
import { catalogCoverageTemplate } from './catalogCoverage'
import { pimCompletenessTemplate } from './pimCompleteness'
import type { DashboardTemplate, TemplateKey } from './types'

/** Les modèles, dans l'ordre où l'accueil les présente — le plus réclamé en premier. */
export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  watchGapsTemplate, catalogCoverageTemplate, pimCompletenessTemplate,
]

export function getTemplate(key: TemplateKey): DashboardTemplate {
  const tpl = DASHBOARD_TEMPLATES.find((t) => t.key === key)
  // Lever plutôt que rendre un modèle vide : un tableau sans tuile ne dirait pas pourquoi.
  if (!tpl) throw new Error(`Modèle inconnu : ${key}`)
  return tpl
}

/**
 * Identifiant de document d'un modèle — DÉTERMINISTE, et c'est tout l'enjeu : créer deux fois
 * le même modèle retomberait sur le même document.
 *
 * ⚠⚠ C'est la seule voie d'idempotence disponible : le schéma du contrat est un `z.object`
 * strict, il ÉCARTE les clés inconnues, et toute écriture passe par `parseDashboard`. Un
 * marqueur `templateKey` posé sur le document disparaîtrait donc au premier enregistrement,
 * en silence. L'identifiant, lui, survit — et il vaut aussi entre collègues d'un même espace
 * de travail : le modèle créé par l'un est retrouvé par l'autre.
 */
export function templateDocId(key: TemplateKey): string {
  return `bi_tpl_${key}`
}

export interface BuildContext {
  accountId: string
  workspaceUid: string
  createdBy: string
  /** Horodatage INJECTÉ : la fabrique reste pure, et le test n'a pas à geler l'horloge. */
  now: number
  /** Nom donné au tableau de bord — traduit par l'appelant, dans la langue de lecture. */
  name: string
  /**
   * ⚠⚠ La traduction est injectée, jamais importée : un `t()` de module figerait la langue à
   * l'import et manquerait les surcharges de vocabulaire du compte, hydratées après le premier
   * rendu. Les titres de tuiles sont PERSISTÉS — ils doivent naître dans la bonne langue.
   */
  translate: (key: TranslationKey) => string
}

/** Un modèle + le contexte de l'utilisateur → le document prêt à écrire. PUR. */
export function buildDashboard(tpl: DashboardTemplate, ctx: BuildContext): DashboardDraft {
  const pages: DashboardPage[] = tpl.pages.map((p, i) => ({
    id: i === 0 ? FIRST_PAGE_ID : `p${i + 1}`,
    name: ctx.translate(p.nameKey),
    tiles: p.tiles.map(({ titleKey, ...tile }) => ({ ...tile, title: ctx.translate(titleKey) })),
    layout: p.layout,
  }))
  return {
    id: templateDocId(tpl.key),
    name: ctx.name,
    description: ctx.translate(tpl.descKey),
    accountId: ctx.accountId,
    workspaceUid: ctx.workspaceUid,
    // ⚠ La racine reste le MIROIR de la première page (cf. contrat) : `parseDashboard` la
    // recopie de toute façon, la poser juste ici évite un document transitoire incohérent.
    tiles: pages[0].tiles,
    layout: pages[0].layout,
    pages,
    filters: tpl.filters,
    version: DASHBOARD_VERSION,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    createdBy: ctx.createdBy,
  }
}

export type { DashboardTemplate, TemplateKey, TemplatePage, TemplateTile } from './types'
