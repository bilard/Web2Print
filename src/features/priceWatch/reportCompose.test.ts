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
  it('transforme une largeur fixe en pleine largeur', () => {
    const out = normalizeComposedHtml(`<div style="width:760px;padding:8px">${'x'.repeat(250)}</div>`)
    expect(out).toContain('max-width:100%;width:100%')
  })

  // ⚠ Sur un écran de 390 px, un retrait de 32 px de chaque côté mange un sixième de la
  // largeur — et c'est autant de colonnes qui ne tiennent plus.
  it('ramène les retraits latéraux d’une maquette d’ordinateur', () => {
    expect(normalizeComposedHtml(`<td style="padding:14px 32px">${'x'.repeat(250)}</td>`))
      .toContain('padding:14px 12px')
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
    expect(normalizeComposedHtml(ok)).toContain(ok)
  })

  // ⚠ Le fragment n'a pas d'en-tête : la déclaration de thème voyage dans le corps, sans
  // quoi iOS recolore le texte et le rend illisible sur son propre fond.
  it('déclare le thème sombre au client de messagerie', () => {
    expect(normalizeComposedHtml(`<table>${'x'.repeat(250)}</table>`))
      .toContain('color-scheme:dark')
  })
})
