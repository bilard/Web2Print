import { describe, it, expect } from 'vitest'
import { rowsToCompetitorSites, isSourceSitesPayload, resolveSitesInput, importSitesIntoRows, normalizeDomain, deriveWatchId, siteStatus, siteStatusRank, type SourceSiteRow, splitPageBudget, sitesForRole } from './sourceSites'

describe('normalizeDomain', () => {
  it('retire le protocole et le chemin', () => {
    expect(normalizeDomain(' https://www.kramp.com/shop-fr/fr ')).toBe('www.kramp.com')
    expect(normalizeDomain('pro-motoculture.com')).toBe('pro-motoculture.com')
  })
})

describe('rowsToCompetitorSites', () => {
  const rows: SourceSiteRow[] = [
    { domain: 'https://www.jardimax.com/', enabled: true },
    { domain: 'amazon.fr', enabled: false },
    { domain: 'progarden.fr', enabled: true, fields: 'price, stock' },
    { domain: 'www.jardimax.com', enabled: true }, // doublon du 1er
    { domain: 'rubix.fr', enabled: true, engine: 'brightdata' },
    { domain: 'net-motoculture.fr', enabled: true, engine: 'auto' },
  ]

  it('exclut les désactivés, déduplique, parse les champs', () => {
    const sites = rowsToCompetitorSites(rows)
    expect(sites.map((s) => s.domain)).toEqual([
      'www.jardimax.com', 'progarden.fr', 'rubix.fr', 'net-motoculture.fr',
    ])
    expect(sites[0].fields).toEqual(['price'])
    expect(sites[1].fields).toEqual(['price', 'stock'])
  })

  it("porte le moteur forcé mais omet 'auto' (défaut implicite)", () => {
    const sites = rowsToCompetitorSites(rows)
    expect(sites.find((s) => s.domain === 'rubix.fr')?.engine).toBe('brightdata')
    expect(sites.find((s) => s.domain === 'net-motoculture.fr')?.engine).toBeUndefined()
  })

  it('porte le canal de relevé et ignore une valeur inconnue', () => {
    const sites = rowsToCompetitorSites([
      { domain: 'www.leroymerlin.fr', enabled: true, mode: 'directed' },
      { domain: 'b.fr', enabled: true, mode: 'harvest' },
      { domain: 'c.fr', enabled: true, mode: 'both' }, // hors liste → les deux canaux
      { domain: 'd.fr', enabled: true },
    ])
    expect(sites.map((s) => s.mode)).toEqual(['directed', 'harvest', undefined, undefined])
  })

  it('ignore un moteur inconnu (config corrompue)', () => {
    const sites = rowsToCompetitorSites([{ domain: 'a.fr', enabled: true, engine: 'warp' }])
    expect(sites[0].engine).toBeUndefined()
  })
})

describe('isSourceSitesPayload', () => {
  it('accepte un payload valide, rejette le reste', () => {
    expect(isSourceSitesPayload({ watchId: 'w', sites: [] })).toBe(true)
    expect(isSourceSitesPayload({ watchId: '', sites: [] })).toBe(false)
    expect(isSourceSitesPayload({ sites: [] })).toBe(false)
    expect(isSourceSitesPayload(null)).toBe(false)
    expect(isSourceSitesPayload('www.a.fr')).toBe(false)
  })
})

describe('resolveSitesInput', () => {
  const fallback = { sitesText: 'a.fr\nb.fr', watchIdRaw: '', workflowId: 'wf_123' }

  it('priorité au payload du port (sites ET watchId)', () => {
    const r = resolveSitesInput(
      { watchId: 'suivi_partage', sites: [{ id: 'c_fr', domain: 'c.fr' }] },
      fallback,
    )
    expect(r.fromPort).toBe(true)
    expect(r.watchId).toBe('suivi_partage')
    expect(r.sites.map((s) => s.domain)).toEqual(['c.fr'])
  })

  it('repli sur la config locale si le port est absent ou invalide', () => {
    for (const input of [undefined, null, {}, { watchId: '', sites: [] }]) {
      const r = resolveSitesInput(input, fallback)
      expect(r.fromPort).toBe(false)
      expect(r.watchId).toBe(deriveWatchId('', 'wf_123'))
      expect(r.sites.map((s) => s.domain)).toEqual(['a.fr', 'b.fr'])
    }
  })

  it('le watchId manuel du fallback est respecté (dérivation historique)', () => {
    const r = resolveSitesInput(undefined, { ...fallback, watchIdRaw: 'Mon Suivi' })
    expect(r.watchId).toBe(deriveWatchId('Mon Suivi', 'wf_123'))
  })
})

describe('siteStatus + tri', () => {
  it('désactivé prime sur tout historique', () => {
    expect(siteStatus({ enabled: false, live: true, lastPassAt: 1, lastPassPages: 9, lastPassProducts: 9 })).toBe('disabled')
  })
  it('en cours > échec > sans produit > OK > jamais', () => {
    expect(siteStatus({ enabled: true, live: true })).toBe('live')
  })

  it('ne dit « jamais scrapé » que si RIEN ne prouve une collecte', () => {
    // Verdict de dernière passe absent (méta d'une version antérieure) MAIS des fiches
    // indexées : la carte affichait « jamais scrapé · fiches 14 003 · scrape 5 h ».
    expect(siteStatus({ enabled: true, live: false })).toBe('never')
    expect(siteStatus({ enabled: true, live: false, productCount: 0 })).toBe('never')
    expect(siteStatus({ enabled: true, live: false, productCount: 14_003 })).toBe('ok')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 0 })).toBe('error')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 5, lastPassProducts: 0 })).toBe('empty')
    expect(siteStatus({ enabled: true, live: false, lastPassAt: 1, lastPassPages: 5, lastPassProducts: 3 })).toBe('ok')
    expect(siteStatus({ enabled: true, live: false })).toBe('never')
  })
  it('les rangs ordonnent live<error<empty<ok<never<disabled', () => {
    const order = (['live', 'error', 'empty', 'ok', 'never', 'disabled'] as const).map(siteStatusRank)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
})

describe('importSitesIntoRows', () => {
  it('ajoute les nouveaux domaines en préservant l\'état des existants', () => {
    const existing: SourceSiteRow[] = [{ domain: 'amazon.fr', enabled: false, engine: 'brightdata' }]
    const rows = importSitesIntoRows('https://www.jardimax.com/\nhttp://amazon.fr/\nprogarden.fr | price, stock', existing)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ domain: 'amazon.fr', enabled: false, engine: 'brightdata' }) // intact
    expect(rows[1].domain).toBe('www.jardimax.com')
    expect(rows[1].enabled).toBe(true)
    expect(rows[2].fields).toBe('price, stock')
  })
})

describe('splitPageBudget', () => {
  const s = (id: string, pageBudget?: number) => ({ id, pageBudget })

  it('sert d’abord les budgets réservés, partage le reste', () => {
    const b = splitPageBudget([s('cher', 10), s('a'), s('b')], 100)
    expect(b.get('cher')).toBe(10)
    expect(b.get('a')).toBe(45)
    expect(b.get('b')).toBe(45)
  })

  it('bride vraiment un concurrent coûteux (cas Bright Data)', () => {
    // Avant : 500/12 = 41 pages pour tout le monde, y compris le site facturé à la requête.
    const sites = [s('leroymerlin', 5), ...Array.from({ length: 11 }, (_, i) => s(`ps${i}`))]
    const b = splitPageBudget(sites, 500)
    expect(b.get('leroymerlin')).toBe(5)
    expect(b.get('ps0')).toBe(45)
  })

  it('garantit au moins 1 page par site', () => {
    const b = splitPageBudget([s('a'), s('b'), s('c')], 2)
    expect([...b.values()]).toEqual([1, 1, 1])
  })

  it('ne rogne pas un budget explicite plus grand que le total (choix assumé)', () => {
    const b = splitPageBudget([s('gros', 80), s('autre')], 50)
    expect(b.get('gros')).toBe(80)
    expect(b.get('autre')).toBe(1)
  })
})

describe('sitesForRole', () => {
  // Le node « Sites sources » alimente la moisson ET la recherche dirigée : sans ce
  // filtre, un généraliste ajouté pour la recherche dirigée était aussi balayé par
  // catégories (leroymerlin : 250 catégories de salle de bains, 14 produits en 32 min).
  const sites = [
    { id: 'a', mode: 'directed' as const },
    { id: 'b', mode: 'harvest' as const },
    { id: 'c' }, // sans mode = les deux canaux (rétrocompatibilité)
  ]

  it('la moisson ignore les sites en recherche dirigée seule', () => {
    expect(sitesForRole(sites, 'harvest').map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('la recherche dirigée ignore les sites en moisson seule', () => {
    expect(sitesForRole(sites, 'directed').map((s) => s.id)).toEqual(['a', 'c'])
  })
})

describe('statut « attend le cycle »', () => {
  // Le mode cycle SAUTE un site dont le balayage est terminé jusqu'à ce que les
  // retardataires finissent. La carte affichait alors « OK » avec un scrape vieux de
  // plusieurs jours : impossible de distinguer « attend son tour » de « ne part plus ».
  const base = { enabled: true, live: false, lastPassPages: 12, lastPassProducts: 300 }

  it('mis en attente APRÈS sa dernière passe → « waiting »', () => {
    expect(siteStatus({ ...base, lastPassAt: 1_000, cycleWaitingAt: 2_000 })).toBe('waiting')
  })

  it('reparti depuis → « ok » (le marqueur est antérieur à la passe)', () => {
    expect(siteStatus({ ...base, lastPassAt: 3_000, cycleWaitingAt: 2_000 })).toBe('ok')
  })

  it('l’attente prime sur le verdict de contenu (0 produit à la dernière passe)', () => {
    expect(siteStatus({ ...base, lastPassProducts: 0, lastPassAt: 1_000, cycleWaitingAt: 2_000 })).toBe('waiting')
  })

  it('mais JAMAIS sur « en cours » ni sur un site désactivé', () => {
    expect(siteStatus({ ...base, live: true, lastPassAt: 1_000, cycleWaitingAt: 2_000 })).toBe('live')
    expect(siteStatus({ ...base, enabled: false, lastPassAt: 1_000, cycleWaitingAt: 2_000 })).toBe('disabled')
  })

  it('sans mode cycle, rien ne change', () => {
    expect(siteStatus({ ...base, lastPassAt: 1_000 })).toBe('ok')
  })

  it('trié AVANT « OK » : c’est une anomalie à regarder', () => {
    expect(siteStatusRank('waiting')).toBeLessThan(siteStatusRank('ok'))
  })
})

describe('marketplace : 0 page moissonnée n’est pas une panne', () => {
  // Cas RÉEL : amazon.fr affichait « ✗ Sans catalogue · 0 page » en rouge, juste à côté
  // de « fiches 2 · appariés 2 ». Une marketplace n'est PAS moissonnable (accueil
  // anti-bot → aucune catégorie cible) ; elle n'est atteinte que par la recherche
  // dirigée. Le rouge se lisait comme une panne alors que c'est le mode prévu.
  const base = { enabled: true, live: false, lastPassAt: 1_000, lastPassPages: 0 }

  it('classe en « recherche seule » un site sans page moissonnée MAIS avec des fiches', () => {
    expect(siteStatus({ ...base, productCount: 2 })).toBe('directed')
  })

  it('reste une ERREUR quand rien n’a jamais été indexé', () => {
    // Là, 0 page ET 0 fiche : le site est réellement inaccessible, il faut le dire.
    expect(siteStatus({ ...base, productCount: 0 })).toBe('error')
    expect(siteStatus(base)).toBe('error')
  })

  it('ne prend pas le pas sur « en cours » ni sur l’attente de cycle', () => {
    expect(siteStatus({ ...base, live: true, productCount: 2 })).toBe('live')
    expect(siteStatus({ ...base, cycleWaitingAt: 2_000, productCount: 2 })).toBe('waiting')
    expect(siteStatus({ ...base, enabled: false, productCount: 2 })).toBe('disabled')
  })
})

describe('⚠⚠ budget pondéré : un catalogue épuisé rend sa part', () => {
  it('donne un quart de part au site saturé, le reste aux autres', () => {
    // Mesuré une nuit entière : granit-parts.fr moissonnait 1 603 fiches par run pour ZÉRO
    // référence nouvelle, en consommant la même part que swap-europe qui progressait encore.
    const b = splitPageBudget([
      { id: 'granit', saturatedSweeps: 3 },
      { id: 'swap' },
      { id: 'progarden' },
    ], 180)
    expect(b.get('granit')!).toBeLessThan(b.get('swap')!)
    // Un quart de part sur un poids total de 2,25 → environ 20 pages contre 80.
    expect(b.get('swap')).toBe(b.get('progarden'))
    expect(b.get('granit')! * 4).toBeLessThanOrEqual(b.get('swap')! + 4)
  })

  it('un seul balayage à sec ne suffit pas — la fenêtre de run peut tromper', () => {
    const b = splitPageBudget([{ id: 'a', saturatedSweeps: 1 }, { id: 'b' }], 100)
    expect(b.get('a')).toBe(b.get('b'))
  })

  it('ralentit sans jamais arrêter : les prix, eux, bougent encore', () => {
    const b = splitPageBudget([{ id: 'a', saturatedSweeps: 9 }, { id: 'b' }], 100)
    expect(b.get('a')!).toBeGreaterThan(0)
  })

  it('sans saturation, la répartition reste celle d’avant', () => {
    const b = splitPageBudget([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 90)
    expect([...b.values()]).toEqual([30, 30, 30])
  })
})

describe('⚠⚠ « Recherche seule » ne doit pas coiffer un site moissonnable', () => {
  const base = { enabled: true, live: false, lastPassAt: 1_700_000_000_000 }

  it('une passe qui n’a pas démarré ne fait pas d’un site une marketplace', () => {
    // Relevé sur swap-europe : plus de mille pages indexées, et pourtant « Recherche
    // seule » — parce que la fenêtre du run s'était épuisée avant qu'il ne démarre.
    expect(siteStatus({ ...base, lastPassPages: 0, pageCount: 1018, productCount: 2116 })).toBe('ok')
  })

  it('mais un site qu’AUCUNE passe n’a su parcourir le reste', () => {
    // Une marketplace : accueil verrouillé, aucune page liste jamais indexée, des fiches
    // rapportées uniquement par la recherche dirigée.
    expect(siteStatus({ ...base, lastPassPages: 0, pageCount: 0, productCount: 42 })).toBe('directed')
  })

  it('sans page NI fiche, c’est un échec', () => {
    expect(siteStatus({ ...base, lastPassPages: 0, pageCount: 0, productCount: 0 })).toBe('error')
  })
})
