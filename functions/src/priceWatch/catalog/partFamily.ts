// src/features/priceWatch/catalog/partFamily.ts
// Famille de PIÈCE reconnue dans un libellé : filtre, démarreur, courroie, bougie…
// PUR : aucune dépendance React/Firebase.
//
// À quoi ça sert : une référence retrouvée dans une URL ou un libellé prouve un
// appariement — mais « FILTRE A AIR » réf. 4109806 apparié à « Démarreur KOHLER
// 4109806S » n'est pas le même article, et aucun signal de clé ne pouvait le dire. Deux
// familles de pièces INCOMPATIBLES déclarées de part et d'autre, c'est une
// CONTRADICTION observée — pas une absence de recoupement.
//
// ⚠ RÈGLE DE CONCEPTION — ce lexique doit SE TAIRE, pas couvrir. Un mot qu'il ne connaît
// pas ne coûte rien : le côté concerné rend un ensemble vide, et sans deux ensembles
// pleins aucune contradiction n'est déclarée. Un mot rangé dans la MAUVAISE famille, lui,
// fabrique une contradiction qui n'existe pas et condamne un appariement juste. Le coût
// des deux erreurs n'est pas symétrique : dans le doute, on n'ajoute pas le mot.
//
// D'où les omissions VOLONTAIRES : « boîtier », « box », « housing », « carter »,
// « joint », « kit », « cartouche », « bloc », « support », « ensemble », « tête »,
// « corps », « plaque » désignent selon le contexte la pièce, son enveloppe ou son
// emballage. C'est « boîtier »/« box » absents d'ici qui laissent passer l'appariement
// vérifié « SWITCH BOX BATTERY » ↔ « Boîtier de commutation ».
//
// Les QUALIFICATIFS sont exclus au même titre : « air », « huile », « oil », « moteur »
// employés en complément (« filtre à huile », « courroie moteur ») ne désignent pas la
// pièce. Les inclure ferait se croiser des familles sans rapport.
import { nameTokens } from './nameTokens'
import type { FamilyLexicon } from './pairingRules'

/**
 * Un identifiant de famille, tous synonymes confondus — français ET anglais dans le même
 * seau : le catalogue F1 est en anglais, celui des marchands en français, et c'est
 * précisément ce décalage qui interdit de raisonner sur les mots communs.
 */
const FAMILIES: Record<string, string[]> = {
  filter: ['filtre', 'filtres', 'filter', 'filters'],
  starter: ['demarreur', 'demarreurs', 'starter', 'starters', 'lanceur', 'lanceurs'],
  belt: ['courroie', 'courroies', 'belt', 'belts'],
  blade: ['lame', 'lames', 'blade', 'blades', 'couteau', 'couteaux'],
  sparkplug: ['bougie', 'bougies', 'sparkplug'],
  battery: ['batterie', 'batteries', 'battery', 'accu', 'accus', 'accumulateur'],
  carburetor: ['carburateur', 'carburateurs', 'carburetor', 'carburettor'],
  // Roue, enjoliveur, protection de roue : le MÊME ensemble. Les séparer fabriquait une
  // contradiction sur « ENJOLIVEUR » ↔ « Protection de Roue Droite pour Tondeuse
  // Castelgarden » — même référence ET même code-barres. Voir la règle du fichier : un
  // mot qui désigne une PARTIE d'un autre ensemble n'a pas sa place à côté de lui.
  wheel: ['roue', 'roues', 'wheel', 'wheels', 'enjoliveur', 'enjoliveurs', 'hubcap', 'hubcaps'],
  pulley: ['poulie', 'poulies', 'pulley', 'pulleys'],
  muffler: ['silencieux', 'muffler', 'mufflers'],
  chain: ['chaine', 'chaines', 'chain', 'chains'],
  sprocket: ['pignon', 'pignons', 'sprocket', 'sprockets'],
  spring: ['ressort', 'ressorts', 'spring', 'springs'],
  bearing: ['roulement', 'roulements', 'bearing', 'bearings'],
  cable: ['cable', 'cables'],
  pump: ['pompe', 'pompes', 'pump', 'pumps'],
  tank: ['reservoir', 'reservoirs', 'tank', 'tanks'],
  clutch: ['embrayage', 'embrayages', 'clutch'],
  ignition: ['allumage', 'ignition'],
  coil: ['bobine', 'bobines', 'coil', 'coils'],
  switch: ['interrupteur', 'interrupteurs', 'switch', 'switches', 'contacteur', 'contacteurs', 'commutateur', 'commutation'],
  alternator: ['alternateur', 'alternateurs', 'alternator'],
  solenoid: ['solenoide', 'solenoid'],
  relay: ['relais', 'relay', 'relays'],
  fuse: ['fusible', 'fusibles', 'fuse', 'fuses'],
  bulb: ['ampoule', 'ampoules', 'bulb', 'bulbs'],
  tyre: ['pneu', 'pneus', 'tyre', 'tyres', 'tire', 'tires'],
  piston: ['piston', 'pistons'],
  valve: ['soupape', 'soupapes', 'valve', 'valves'],
  cylinder: ['cylindre', 'cylindres', 'cylinder', 'cylinders'],
  crankshaft: ['vilebrequin', 'vilebrequins', 'crankshaft'],
  handle: ['poignee', 'poignees', 'handle', 'handles', 'guidon', 'guidons', 'handlebar'],
  seat: ['siege', 'sieges', 'seat', 'seats'],
  screw: ['boulon', 'boulons', 'screw', 'screws', 'bolt', 'bolts', 'vis'],
  nut: ['ecrou', 'ecrous'],
  washer: ['rondelle', 'rondelles', 'washer', 'washers'],
  // Vocabulaire du domaine, ajouté après relecture des appariements RÉELS. Chaque entrée
  // regroupe les SYNONYMES d'une même pièce — c'est ce qui distingue ce lexique d'une
  // comparaison de mots communs : « COUTEAU » et « Lame STIGA » n'ont aucun mot en
  // partage et désignent pourtant la même pièce.
  // ⚠ Deux ajouts ESSAYÉS PUIS RETIRÉS, mesure à l'appui : « membrane » (une membrane
  // EST une pièce de carburateur — « KIT REPARATION CARBURATEUR » ↔ « Kit membranes
  // WALBRO » est un appariement juste) et « palier » (« AXE DE PALIER MTD » ↔ « Axe de
  // couteau MTD » l'est aussi). Un mot qui désigne un SOUS-ENSEMBLE d'une autre pièce
  // n'a pas sa place ici : il fabrique une contradiction là où il y a emboîtement.
  hose: ['durite', 'durites', 'tuyau', 'tuyaux', 'hose', 'hoses'],
  nozzle: ['gicleur', 'gicleurs', 'buse', 'buses'],
  roller: ['galet', 'galets', 'roller', 'rollers'],
  flywheel: ['volant', 'volants', 'flywheel'],
  fan: ['ventilateur', 'ventilateurs', 'turbine', 'turbines', 'helice', 'helices'],
  damper: ['amortisseur', 'amortisseurs', 'silentbloc', 'silentblocs'],
  clamp: ['collier', 'colliers', 'clamp', 'clamps'],
  pin: ['goupille', 'goupilles', 'clavette', 'clavettes'],
  lever: ['levier', 'leviers', 'manette', 'manettes', 'lever', 'levers'],
  deflector: ['deflecteur', 'deflecteurs', 'deflector'],
  wrench: ['cle', 'clef', 'cles', 'clefs', 'wrench', 'spanner'],
  capacitor: ['condensateur', 'condensateurs', 'capacitor'],
  // Rotor et stator sont deux pièces distinctes, mais les libellés marchands les
  // emploient l'un pour l'autre : les séparer fabriquerait des contradictions fausses.
  armature: ['stator', 'stators', 'rotor', 'rotors', 'induit', 'induits'],
  // ÉQUIPEMENT DE L'OPÉRATEUR — jamais une pièce de machine. Cas VÉCU : « BAGUE DE
  // ROUE » à 1,91 € appariée à « Chaussure de travail taille 41 GRISPORT 7200341 » à
  // 176 €, la référence figurant dans l'adresse de la fiche. Aucun mot du lexique ne
  // parlait côté marchand, donc aucune contradiction n'était déclarée.
  // ⚠ « boot(s) » anglais est VOLONTAIREMENT absent : en mécanique, c'est un soufflet
  // de cardan, pas une chaussure. « botte(s) » français ne porte pas cette ambiguïté.
  footwear: ['chaussure', 'chaussures', 'botte', 'bottes', 'brodequin', 'brodequins', 'sabot', 'sabots'],
  glove: ['gant', 'gants', 'glove', 'gloves'],
  helmet: ['casque', 'casques', 'helmet', 'helmets'],
  eyewear: ['lunette', 'lunettes', 'goggles', 'visiere', 'visieres'],
  clothing: ['veste', 'vestes', 'pantalon', 'pantalons', 'combinaison', 'combinaisons', 'salopette', 'salopettes', 'tablier', 'tabliers'],
}

/** Index inversé mot → famille, dressé une fois à l'import. */
const WORD_TO_FAMILY = new Map<string, string>()
for (const [family, words] of Object.entries(FAMILIES)) {
  for (const w of words) WORD_TO_FAMILY.set(w, family)
}

/**
 * Index enrichi du lexique propre à un suivi. Le vocabulaire d'un catalogue de pièces de
 * motoculture n'est pas celui d'un catalogue de plomberie : c'est le seul endroit où la
 * connaissance métier de l'utilisateur apporte ce que le code ne peut pas deviner.
 *
 * Mémoïsé PAR RÉFÉRENCE d'objet : `familiesConflict` est appelé une fois par candidat
 * apparié, soit des centaines de milliers de fois par run — reconstruire l'index à chaque
 * appel coûterait plus cher que tout le reste de l'appariement. Les règles étant résolues
 * une fois par run, la même référence revient à chaque appel.
 */
const EXTRA_INDEX = new WeakMap<object, Map<string, string>>()

function indexFor(extra?: FamilyLexicon): Map<string, string> {
  if (!extra) return WORD_TO_FAMILY
  const cached = EXTRA_INDEX.get(extra)
  if (cached) return cached
  const keys = Object.keys(extra)
  if (keys.length === 0) {
    EXTRA_INDEX.set(extra, WORD_TO_FAMILY)
    return WORD_TO_FAMILY
  }
  const merged = new Map(WORD_TO_FAMILY)
  for (const family of keys) {
    for (const w of extra[family] ?? []) merged.set(w, family)
  }
  EXTRA_INDEX.set(extra, merged)
  return merged
}

/**
 * Familles de pièce citées dans un libellé. Vide quand aucun mot n'est reconnu — c'est
 * le cas NORMAL et sans conséquence, pas un échec.
 *
 * Les tokens viennent de `nameTokens` : minuscules sans accents, mots vides écartés.
 * « Démarreur KOHLER 4109806S » → `{starter}`, « FILTRE A AIR » → `{filter}`.
 */
export function partFamilies(name: string | null | undefined, extra?: FamilyLexicon): Set<string> {
  const out = new Set<string>()
  const index = indexFor(extra)
  for (const token of nameTokens(name)) {
    const f = index.get(token)
    if (f) out.add(f)
  }
  return out
}

/**
 * Les deux libellés désignent-ils des pièces INCOMPATIBLES ?
 *
 * Vrai seulement si les deux côtés nomment au moins une famille ET qu'aucune n'est
 * partagée. Un seul côté muet ⇒ faux : c'est une absence, et on ne retranche jamais pour
 * une absence. Une famille commune suffit à disculper — « SWITCH BOX BATTERY » et
 * « Boîtier de commutation » partagent `switch`, le second sens de chacun ne compte pas.
 */
export function familiesConflict(
  a: string | null | undefined,
  b: string | null | undefined,
  extra?: FamilyLexicon,
): boolean {
  const left = partFamilies(a, extra)
  if (left.size === 0) return false
  const right = partFamilies(b, extra)
  if (right.size === 0) return false
  for (const f of right) if (left.has(f)) return false
  return true
}
