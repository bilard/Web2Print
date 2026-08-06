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
import { nameTokens } from './nameMatch'

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
  wheel: ['roue', 'roues', 'wheel', 'wheels'],
  hubcap: ['enjoliveur', 'enjoliveurs', 'hubcap', 'hubcaps'],
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
  screw: ['boulon', 'boulons', 'screw', 'screws', 'bolt', 'bolts'],
  nut: ['ecrou', 'ecrous'],
  washer: ['rondelle', 'rondelles', 'washer', 'washers'],
}

/** Index inversé mot → famille, dressé une fois à l'import. */
const WORD_TO_FAMILY = new Map<string, string>()
for (const [family, words] of Object.entries(FAMILIES)) {
  for (const w of words) WORD_TO_FAMILY.set(w, family)
}

/**
 * Familles de pièce citées dans un libellé. Vide quand aucun mot n'est reconnu — c'est
 * le cas NORMAL et sans conséquence, pas un échec.
 *
 * Les tokens viennent de `nameTokens` : minuscules sans accents, mots vides écartés.
 * « Démarreur KOHLER 4109806S » → `{starter}`, « FILTRE A AIR » → `{filter}`.
 */
export function partFamilies(name: string | null | undefined): Set<string> {
  const out = new Set<string>()
  for (const token of nameTokens(name)) {
    const f = WORD_TO_FAMILY.get(token)
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
export function familiesConflict(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = partFamilies(a)
  if (left.size === 0) return false
  const right = partFamilies(b)
  if (right.size === 0) return false
  for (const f of right) if (left.has(f)) return false
  return true
}
