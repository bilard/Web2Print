import { describe, it, expect } from 'vitest'
import { normalizeComposedHtml } from './reportCompose'


// ⚠⚠ Sur téléphone, le mail composé sortait du cadre : le lecteur voyait la colonne des
// libellés et pas les chiffres — l'inverse de ce qu'il vient chercher. Une consigne de rendu
// ne suffit pas, le modèle recompose la page à chaque envoi.
describe('mise en page repliable', () => {
  it('ramène une largeur d’attribut en pixels à 100 %', () => {
    expect(normalizeComposedHtml(`<table width="760" cellpadding="0">${'x'.repeat(250)}</table>`))
      .toContain('width="100%"')
  })
  it('retire un plancher de largeur — c’est lui qui force le débordement', () => {
    const out = normalizeComposedHtml(`<table style="min-width:640px;background:#111">${'x'.repeat(250)}</table>`)
    expect(out).not.toContain('min-width')
  })
  it('transforme une largeur fixe en PLAFOND', () => {
    const out = normalizeComposedHtml(`<div style="width:760px;padding:8px">${'x'.repeat(250)}</div>`)
    expect(out).toContain('max-width:760px;width:100%')
  })
  it('supprime l’interdiction de revenir à la ligne', () => {
    expect(normalizeComposedHtml(`<td style="white-space:nowrap;color:#fff">${'x'.repeat(250)}</td>`))
      .not.toContain('nowrap')
  })
  it('remonte les polices sous 13 px, que iOS compenserait par un zoom', () => {
    const out = normalizeComposedHtml(`<td style="font-size:10px">${'x'.repeat(250)}</td>`)
    expect(out).toContain('font-size:13px')
  })
  it('laisse tranquille ce qui est déjà correct', () => {
    const ok = `<table width="100%" style="font-size:15px">${'x'.repeat(250)}</table>`
    expect(normalizeComposedHtml(ok)).toBe(ok)
  })
})
