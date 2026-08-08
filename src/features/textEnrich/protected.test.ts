import { describe, it, expect } from 'vitest'
import { findViolations, isSafeRevision } from './protected'

describe('références et codes-barres', () => {
  it('accepte une réécriture qui conserve la référence, même ponctuée autrement', () => {
    // Le modèle retire volontiers les tirets d'un code. La référence est la MÊME.
    expect(isSafeRevision(
      'Lame STIGA 1134-4319-01 pour autoportée',
      'Lame de tondeuse autoportée STIGA, référence 1134431901.',
      { refs: ['1134-4319-01'] },
    )).toBe(true)
  })

  it('REFUSE une référence altérée d’un seul caractère', () => {
    // C'est le cas qui casse l'appariement concurrent, des semaines plus tard.
    const v = findViolations(
      'Lame STIGA 1134-4319-01',
      'Lame STIGA 1134-4319-02',
      { refs: ['1134-4319-01'] },
    )
    expect(v).toEqual([{ kind: 'ref-lost', token: '1134-4319-01' }])
  })

  it('REFUSE une référence purement et simplement disparue', () => {
    expect(isSafeRevision('Courroie VIKING 6151-704-2110', 'Courroie pour tondeuse VIKING.', { refs: ['6151-704-2110'] }))
      .toBe(false)
  })

  it('ne reproche pas une référence que l’original ne portait pas', () => {
    // Une description qui n'a jamais cité de code ne doit pas être rejetée pour ça.
    expect(isSafeRevision('Lame de tondeuse', 'Lame de tondeuse pour autoportée.', { refs: ['BS691991'] }))
      .toBe(true)
  })

  it('suit un code-barres à travers une reformulation', () => {
    expect(isSafeRevision('EAN 3582321853475', 'Code-barres : 3582321853475.', { eans: ['3582321853475'] })).toBe(true)
    expect(isSafeRevision('EAN 3582321853475', 'Code-barres : 3582321853476.', { eans: ['3582321853475'] })).toBe(false)
  })
})

describe('valeurs chiffrées', () => {
  it('REFUSE une conversion d’unité, même exacte', () => {
    // 510 mm et 51 cm valent pareil, mais un filtre sur « 510 » ne trouve plus rien.
    const v = findViolations('Lame 510mm', 'Lame de 51 cm', {})
    expect(v).toEqual([{ kind: 'number-lost', token: '510mm' }])
  })

  it('REFUSE un arrondi', () => {
    expect(isSafeRevision('Poids 1,5 kg', 'Poids environ 2 kg', {})).toBe(false)
  })

  it('tolère un changement d’écriture de la même valeur', () => {
    // « 1,5 KG » et « 1.5kg » sont la même donnée : la rejeter bloquerait des
    // réécritures parfaitement légitimes.
    expect(isSafeRevision('Batterie 1,5 KG · 12 V', 'Batterie de 1.5kg en 12V.', {})).toBe(true)
  })

  it('ne surveille QUE les nombres porteurs d’une unité', () => {
    // « 3 lames » qui devient « trois lames » n'altère aucune donnée exploitable.
    expect(isSafeRevision('Kit de 3 lames', 'Kit de trois lames', {})).toBe(true)
  })
})

describe('marques', () => {
  it('REFUSE la disparition d’une marque', () => {
    expect(findViolations('Carburateur BRIGGS ET STRATTON', 'Carburateur pour tondeuse', { brands: ['Briggs et Stratton'] }))
      .toEqual([{ kind: 'brand-lost', token: 'Briggs et Stratton' }])
  })

  it('REFUSE une marque INVENTÉE', () => {
    // Fabriquer un fabricant absent de la source, c'est fabriquer de la donnée.
    expect(findViolations('Lame de tondeuse 51 cm', 'Lame de tondeuse HONDA 51 cm', { brands: ['Honda'] }))
      .toEqual([{ kind: 'brand-added', token: 'Honda' }])
  })

  it('reconnaît la marque malgré la casse, les accents et les tirets', () => {
    expect(isSafeRevision('Lame AL-KO', 'Lame de marque Alko', { brands: ['AL-KO'] })).toBe(true)
  })
})

describe('cumul', () => {
  it('rapporte TOUTES les violations, pas la première', () => {
    // L'écran doit pouvoir dire ce qui cloche, pas seulement qu'il y a un problème.
    const v = findViolations(
      'Lame STIGA 1134-4319-01 · 510mm',
      'Lame de tondeuse 51 cm',
      { refs: ['1134-4319-01'], brands: ['STIGA'] },
    )
    expect(v.map((x) => x.kind).sort()).toEqual(['brand-lost', 'number-lost', 'ref-lost'])
  })

  it('laisse passer une vraie amélioration', () => {
    // Le cas nominal : un libellé pauvre devient explicite SANS rien perdre.
    expect(isSafeRevision(
      'LAME 510MM STIGA 1134-4319-01',
      'Lame de tondeuse 510mm pour autoportée STIGA — référence 1134-4319-01.',
      { refs: ['1134-4319-01'], brands: ['STIGA'] },
    )).toBe(true)
  })
})
