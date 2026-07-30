import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

/**
 * CLIQUET anti-régression sur les textes français laissés en dur dans le JSX.
 *
 * ⚠️ Ce test ne demande PAS zéro — il refuse que le compte AUGMENTE. La nuance
 * est ce qui le rend tenable :
 *
 *  - à zéro, il faudrait d'abord recomposer des centaines de phrases coupées
 *    par des expressions JSX (`Aucun template pour {x} — crée-en un depuis {y}`),
 *    ce qu'on ne peut pas automatiser sans produire, en espagnol ou en anglais,
 *    des phrases dont l'ordre des mots est faux ;
 *  - une barrière impossible à tenir finit désactivée, et ne protège plus rien.
 *
 * Ce qu'il garantit, et c'est la demande : **toute nouvelle fonctionnalité part
 * traduite**. Ajouter un écran avec des libellés en dur fait rougir la suite.
 *
 * Pour faire BAISSER la baseline : `node scripts/i18n-extract-literals.mjs
 * <dossier> <prefixe>` extrait les libellés entiers d'un module, puis
 * `node scripts/i18n-translate.mjs en|es` traduit les clés nouvelles. Baissez
 * ensuite le chiffre ci-dessous — il ne doit jamais remonter.
 *
 * ⚠️ Le chiffre peut aussi monter parce que le SCANNER voit mieux : il a gagné
 * les mots français isolés sans accent (« Connecteur », « Appareil »), invisibles
 * jusque-là. Une hausse de ce genre se constate en relançant le scan sur un
 * arbre inchangé — ce n'est pas une régression, et la baseline se met à jour.
 */
const BASELINE = 1280

describe('littéraux français en dur', () => {
  it('ne dépasse pas la baseline', () => {
    const out = execFileSync('node', ['scripts/i18n-scan-literals.mjs'], { encoding: 'utf8' })
    const count = Number(/^(\d+) littéraux/m.exec(out)?.[1] ?? NaN)

    // Le scanner doit avoir RÉPONDU : un binaire cassé ou une sortie vide
    // rendrait le test vert en ne mesurant rien — le mode d'échec typique d'un
    // garde-fou fail-open.
    expect(Number.isFinite(count), `sortie illisible du scanner :\n${out.slice(0, 400)}`).toBe(true)

    expect(
      count,
      count > BASELINE
        ? `${count - BASELINE} nouveau(x) libellé(s) français en dur. Passez-les par t() ` +
          `(voir \`node scripts/i18n-scan-literals.mjs\` pour la liste).`
        : `baseline à mettre à jour : ${count}`,
    ).toBeLessThanOrEqual(BASELINE)
  }, 120_000)
})
