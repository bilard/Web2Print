import { describe, it, expect } from 'vitest'
import { aliveRunOf } from './scheduler'

const NOW = 1_700_000_000_000

// ⚠⚠ Rien n'empêchait deux exécutions simultanées du même flux : le cron ne se chevauche
// pas lui-même (verrou `nextRunAt`), mais un « Lancer (serveur) » pendant un tick cron
// partait quand même. Les deux écrivaient le même état live — l'écran alternait entre deux
// runs sans en raconter aucun —, les mêmes métas de moisson, le même rapport, et payaient
// deux fois les modèles.
describe('aliveRunOf — un seul run à la fois sur un flux', () => {
  it('reconnaît un run qui bat encore', () => {
    expect(aliveRunOf({ status: 'running', beatAt: NOW - 30_000, trigger: 'manual' }, NOW))
      .toEqual({ trigger: 'manual' })
  })

  it('ne retient pas un run muet depuis plus de trois minutes — il est mort, pas occupé', () => {
    expect(aliveRunOf({ status: 'running', beatAt: NOW - 4 * 60_000 }, NOW)).toBeNull()
  })

  it('ignore un run terminé, quelle qu’en soit la fraîcheur', () => {
    expect(aliveRunOf({ status: 'success', beatAt: NOW }, NOW)).toBeNull()
  })

  it('se rabat sur startedAt quand le document est antérieur à l’estampille de battement', () => {
    // Les traiter comme morts rouvrirait la porte au doublon qu'on vient de fermer.
    expect(aliveRunOf({ status: 'running', startedAt: NOW - 10_000 }, NOW)).toEqual({ trigger: 'cron' })
  })

  it('rend « cron » par défaut : un doc sans déclencheur ne passe pas pour un run humain', () => {
    // Le cron cède devant un run humain, jamais devant un run cron — ce serait sa propre
    // reprise après pause, et la bloquer figerait le flux jusqu'à expiration du verrou.
    expect(aliveRunOf({ status: 'running', beatAt: NOW }, NOW)?.trigger).toBe('cron')
  })

  it('aucun document : rien ne tourne', () => {
    expect(aliveRunOf(undefined, NOW)).toBeNull()
  })
})
