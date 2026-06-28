import { describe, it, expect } from 'vitest'
import { buildHtml, buildEmailHtml, formatDuration, formatNumber } from './analyticsReport'

const input = {
  title: 'Stats',
  periodLabel: '30 derniers jours',
  dateLabel: '28 juin 2026',
  kpis: { pageViews: 53, visitors: 3, sessions: 13, avgSessionMs: 171_000, bounceRate: 0.5 },
  topPages: [{ label: 'Tableau de bord', count: 34 }, { label: 'Accueil', count: 7 }],
  topSources: [{ label: 'ibs-studio.com', count: 53 }],
  topCountries: [{ label: 'FR', count: 53 }],
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
  })
  it('gère une liste vide', () => {
    const email = buildEmailHtml({ ...input, topCountries: [] })
    expect(email).toContain('Pays')
  })
})
