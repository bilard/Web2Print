import { describe, it, expect } from 'vitest'
import { buildHtml, buildEmailHtml, formatDuration, formatNumber } from './analyticsReport'

const input = {
  title: 'Stats',
  periodLabel: '30 derniers jours',
  dateLabel: '28 juin 2026',
  kpis: { pageViews: 53, visitors: 3, sessions: 13, avgSessionMs: 171_000, bounceRate: 0.5 },
  series: [
    { day: '2026-06-26', pageViews: 0, visitors: 0 },
    { day: '2026-06-27', pageViews: 5, visitors: 1 },
    { day: '2026-06-28', pageViews: 48, visitors: 3 },
  ],
  topPages: [{ label: 'Tableau de bord', count: 34 }, { label: 'Accueil', count: 7 }],
  topSources: [{ label: 'ibs-studio.com', count: 53 }],
  topCountries: [{ label: 'FR', count: 53 }],
  topDevices: [{ label: 'Ordinateur', count: 40 }, { label: 'Mobile', count: 13 }],
  topUsers: [{ label: 'Francis Bilard', count: 30 }, { label: 'ibs.studio@gmail.com', count: 5 }],
  recent: [
    { label: 'Promo', meta: 'Ordinateur · FR · 28/06 14:30', area: 'promo', device: 'desktop' },
    { label: 'Documentation', meta: 'Mobile · BE · 28/06 14:12', area: 'docs', device: 'mobile' },
    { label: 'Veille', meta: 'Ordinateur · FR · 28/06 14:05', area: 'app', device: 'desktop' },
  ],
}

describe('formatDuration', () => {
  it('affiche les secondes (même format que le tableau de bord)', () => {
    expect(formatDuration(171_000)).toBe('171 s')
    expect(formatDuration(5_000)).toBe('5 s')
    expect(formatDuration(252_000)).toBe('252 s')
  })
})

describe('formatNumber', () => {
  it('formate en fr-FR', () => {
    expect(formatNumber(1234)).toBe('1 234')
  })
})

describe('buildHtml', () => {
  it('inclut les KPIs et un document HTML complet', () => {
    const html = buildHtml(input)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('53') // pages vues
    expect(html).toContain('Tableau de bord')
    expect(html).toContain('171 s')
    expect(html).toContain('rebond 50 %')
  })
  it('inclut le panneau Appareils et la courbe', () => {
    const html = buildHtml(input)
    expect(html).toContain('Appareils')
    expect(html).toContain('Ordinateur')
    expect(html).toContain('Mobile')
    expect(html).toContain('Évolution')
    expect(html).toContain('cbar-fill')
    expect(html).toContain('Utilisateurs connectés')
    expect(html).toContain('Francis Bilard')
    expect(html).toContain('Activité récente')
    expect(html).toContain('Ordinateur · FR · 28/06 14:30')
    // Filtres + pagination interactifs (rapport riche / pièce jointe).
    expect(html).toContain('Rechercher une page')
    expect(html).toContain('Toutes catégories')
    expect(html).toContain('<script>')
  })
  it('échappe le HTML du titre', () => {
    const html = buildHtml({ ...input, title: '<script>x</script>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('buildEmailHtml', () => {
  it('retourne un fragment inline (pas de <style> ni grid)', () => {
    const email = buildEmailHtml(input)
    expect(email.startsWith('<div')).toBe(true)
    expect(email).not.toContain('<style')
    expect(email).not.toContain('display:grid')
    expect(email).toContain('ibs-studio.com')
    expect(email).toContain('Appareils')
    expect(email).toContain('Ordinateur')
    expect(email).toContain('Évolution')
    expect(email).toContain('Utilisateurs connectés')
    expect(email).toContain('Francis Bilard')
    expect(email).toContain('Activité récente')
    // Corps de mail email-safe : sections par catégorie, aucun JS.
    expect(email).toContain('Site (promo)')
    expect(email).toContain('Documentation')
    expect(email).not.toContain('<script')
  })
  it('gère une liste vide', () => {
    const email = buildEmailHtml({ ...input, topCountries: [] })
    expect(email).toContain('Pays')
  })
})
