import type { Locale } from '@/lib/i18n'
import { refText } from '@/lib/i18n/refStrings'
// Catalogue des fonctions Google Sheets pour l'autocomplétion + la référence des
// colonnes-formule. Organisé en GROUPES (par catégorie) ; une liste plate est
// dérivée pour l'autocomplétion.
export interface GSheetsFunction {
  name: string
  hint: string
  /** Description anglaise — cf. `fnHint()`. */
  hintEn: string
  /** Catégorie (groupe d'affichage). */
  cat: string
  catEn: string
}

interface FunctionGroup {
  cat: string
  catEn: string
  fns: { name: string; hint: string; hintEn: string }[]
}

/**
 * Description dans la langue courante.
 *
 * ⚠️ Pourquoi les traductions vivent ICI et pas dans `lib/i18n` : ce fichier est
 * un RÉFÉRENTIEL d'API tierce (157 fonctions Google Sheets), pas du vocabulaire
 * d'application. Y verser 157 clés diluerait le catalogue d'UI et éloignerait
 * chaque description du nom qu'elle décrit. Même raisonnement que le catalogue
 * de messages de run côté serveur.
 */
export function fnHint(f: { hint: string; hintEn: string }, locale: Locale): string {
  return refText(f.hint, f.hintEn, locale)
}

/** Nom de catégorie dans la langue courante. */
export function fnCat(g: { cat: string; catEn: string }, locale: Locale): string {
  return refText(g.cat, g.catEn, locale)
}

export const GSHEETS_FUNCTION_GROUPS: FunctionGroup[] = [
  {
    cat: 'Maths', catEn: 'Maths',
    fns: [
      { name: 'SUM', hint: 'Somme d’une plage', hintEn: 'Sum of a range' },
      { name: 'SUMIF', hint: 'Somme selon un critère', hintEn: 'Sum on one criterion' },
      { name: 'SUMIFS', hint: 'Somme selon plusieurs critères', hintEn: 'Sum on several criteria' },
      { name: 'SUMPRODUCT', hint: 'Somme des produits', hintEn: 'Sum of products' },
      { name: 'PRODUCT', hint: 'Produit des valeurs', hintEn: 'Product of the values' },
      { name: 'QUOTIENT', hint: 'Quotient entier', hintEn: 'Integer quotient' },
      { name: 'MOD', hint: 'Reste d’une division', hintEn: 'Remainder of a division' },
      { name: 'POWER', hint: 'Puissance : POWER(base ; exp)', hintEn: 'Power: POWER(base ; exp)' },
      { name: 'SQRT', hint: 'Racine carrée', hintEn: 'Square root' },
      { name: 'EXP', hint: 'Exponentielle', hintEn: 'Exponential' },
      { name: 'LN', hint: 'Logarithme népérien', hintEn: 'Natural logarithm' },
      { name: 'LOG', hint: 'Logarithme (base au choix)', hintEn: 'Logarithm (chosen base)' },
      { name: 'LOG10', hint: 'Logarithme base 10', hintEn: 'Base 10 logarithm' },
      { name: 'ABS', hint: 'Valeur absolue', hintEn: 'Absolute value' },
      { name: 'SIGN', hint: 'Signe (-1/0/1)', hintEn: 'Sign (-1/0/1)' },
      { name: 'INT', hint: 'Partie entière inférieure', hintEn: 'Rounds down to an integer' },
      { name: 'TRUNC', hint: 'Tronque les décimales', hintEn: 'Truncates the decimals' },
      { name: 'ROUND', hint: 'ROUND(nombre ; décimales)', hintEn: 'ROUND(number ; decimals)' },
      { name: 'ROUNDUP', hint: 'Arrondi au supérieur', hintEn: 'Rounds up' },
      { name: 'ROUNDDOWN', hint: 'Arrondi à l’inférieur', hintEn: 'Rounds down' },
      { name: 'MROUND', hint: 'Arrondi au multiple le plus proche', hintEn: 'Rounds to the nearest multiple' },
      { name: 'CEILING', hint: 'Arrondi au multiple supérieur', hintEn: 'Rounds up to a multiple' },
      { name: 'FLOOR', hint: 'Arrondi au multiple inférieur', hintEn: 'Rounds down to a multiple' },
      { name: 'GCD', hint: 'PGCD', hintEn: 'GCD' },
      { name: 'LCM', hint: 'PPCM', hintEn: 'LCM' },
      { name: 'RAND', hint: 'Nombre aléatoire 0–1', hintEn: 'Random number 0–1' },
      { name: 'RANDBETWEEN', hint: 'Entier aléatoire entre deux bornes', hintEn: 'Random integer between two bounds' },
      { name: 'PI', hint: 'Constante π', hintEn: 'The constant π' },
    ],
  },
  {
    cat: 'Statistiques', catEn: 'Statistics',
    fns: [
      { name: 'AVERAGE', hint: 'Moyenne', hintEn: 'Average' },
      { name: 'AVERAGEIF', hint: 'Moyenne selon un critère', hintEn: 'Average on one criterion' },
      { name: 'AVERAGEIFS', hint: 'Moyenne selon plusieurs critères', hintEn: 'Average on several criteria' },
      { name: 'MEDIAN', hint: 'Médiane', hintEn: 'Median' },
      { name: 'MODE', hint: 'Valeur la plus fréquente', hintEn: 'Most frequent value' },
      { name: 'MIN', hint: 'Minimum', hintEn: 'Minimum' },
      { name: 'MAX', hint: 'Maximum', hintEn: 'Maximum' },
      { name: 'MINIFS', hint: 'Minimum selon critères', hintEn: 'Minimum on criteria' },
      { name: 'MAXIFS', hint: 'Maximum selon critères', hintEn: 'Maximum on criteria' },
      { name: 'COUNT', hint: 'Compte les nombres', hintEn: 'Counts the numbers' },
      { name: 'COUNTA', hint: 'Compte les cellules non vides', hintEn: 'Counts the non-empty cells' },
      { name: 'COUNTBLANK', hint: 'Compte les cellules vides', hintEn: 'Counts the empty cells' },
      { name: 'COUNTIF', hint: 'Compte selon un critère', hintEn: 'Counts on one criterion' },
      { name: 'COUNTIFS', hint: 'Compte selon plusieurs critères', hintEn: 'Counts on several criteria' },
      { name: 'COUNTUNIQUE', hint: 'Compte les valeurs uniques', hintEn: 'Counts the unique values' },
      { name: 'LARGE', hint: 'n-ième plus grande valeur', hintEn: 'nth largest value' },
      { name: 'SMALL', hint: 'n-ième plus petite valeur', hintEn: 'nth smallest value' },
      { name: 'RANK', hint: 'Rang d’une valeur', hintEn: 'Rank of a value' },
      { name: 'PERCENTILE', hint: 'Centile d’une plage', hintEn: 'Percentile of a range' },
      { name: 'QUARTILE', hint: 'Quartile d’une plage', hintEn: 'Quartile of a range' },
      { name: 'STDEV', hint: 'Écart-type (échantillon)', hintEn: 'Standard deviation (sample)' },
      { name: 'STDEVP', hint: 'Écart-type (population)', hintEn: 'Standard deviation (population)' },
      { name: 'VAR', hint: 'Variance (échantillon)', hintEn: 'Variance (sample)' },
      { name: 'VARP', hint: 'Variance (population)', hintEn: 'Variance (population)' },
      { name: 'CORREL', hint: 'Coefficient de corrélation', hintEn: 'Correlation coefficient' },
    ],
  },
  {
    cat: 'Texte', catEn: 'Text',
    fns: [
      { name: 'CONCATENATE', hint: 'Concatène du texte', hintEn: 'Concatenates text' },
      { name: 'CONCAT', hint: 'Concatène deux valeurs', hintEn: 'Concatenates two values' },
      { name: 'TEXTJOIN', hint: 'Joint avec séparateur (ignore vides)', hintEn: 'Joins with a separator (skips blanks)' },
      { name: 'JOIN', hint: 'Joint une plage avec séparateur', hintEn: 'Joins a range with a separator' },
      { name: 'SPLIT', hint: 'Découpe du texte', hintEn: 'Splits text' },
      { name: 'LEFT', hint: 'Caractères de gauche', hintEn: 'Characters from the left' },
      { name: 'RIGHT', hint: 'Caractères de droite', hintEn: 'Characters from the right' },
      { name: 'MID', hint: 'Sous-chaîne', hintEn: 'Substring' },
      { name: 'LEN', hint: 'Longueur du texte', hintEn: 'Text length' },
      { name: 'TRIM', hint: 'Supprime espaces superflus', hintEn: 'Removes extra spaces' },
      { name: 'CLEAN', hint: 'Retire caractères non imprimables', hintEn: 'Removes non-printable characters' },
      { name: 'UPPER', hint: 'Majuscules', hintEn: 'Upper case' },
      { name: 'LOWER', hint: 'Minuscules', hintEn: 'Lower case' },
      { name: 'PROPER', hint: 'Première lettre en majuscule', hintEn: 'First letter capitalised' },
      { name: 'SUBSTITUTE', hint: 'Remplace un texte par un autre', hintEn: 'Replaces one text with another' },
      { name: 'REPLACE', hint: 'Remplace par position', hintEn: 'Replaces by position' },
      { name: 'FIND', hint: 'Position (sensible à la casse)', hintEn: 'Position (case sensitive)' },
      { name: 'SEARCH', hint: 'Position (insensible à la casse)', hintEn: 'Position (case insensitive)' },
      { name: 'REPT', hint: 'Répète un texte', hintEn: 'Repeats a text' },
      { name: 'TEXT', hint: 'TEXT(valeur ; format)', hintEn: 'TEXT(value ; format)' },
      { name: 'VALUE', hint: 'Convertit texte → nombre', hintEn: 'Converts text → number' },
      { name: 'EXACT', hint: 'Égalité stricte de deux textes', hintEn: 'Strict equality of two texts' },
      { name: 'REGEXMATCH', hint: 'Teste une regex', hintEn: 'Tests a regex' },
      { name: 'REGEXEXTRACT', hint: 'Extrait via regex', hintEn: 'Extracts through a regex' },
      { name: 'REGEXREPLACE', hint: 'Remplace via regex', hintEn: 'Replaces through a regex' },
    ],
  },
  {
    cat: 'Logique', catEn: 'Logic',
    fns: [
      { name: 'IF', hint: 'IF(test ; si_vrai ; si_faux)', hintEn: 'IF(test ; if_true ; if_false)' },
      { name: 'IFS', hint: 'Conditions multiples', hintEn: 'Multiple conditions' },
      { name: 'IFERROR', hint: 'IFERROR(valeur ; sinon)', hintEn: 'IFERROR(value ; otherwise)' },
      { name: 'IFNA', hint: 'Valeur de repli si #N/A', hintEn: 'Fallback value if #N/A' },
      { name: 'AND', hint: 'ET logique', hintEn: 'Logical AND' },
      { name: 'OR', hint: 'OU logique', hintEn: 'Logical OR' },
      { name: 'NOT', hint: 'NON logique', hintEn: 'Logical NOT' },
      { name: 'XOR', hint: 'OU exclusif', hintEn: 'Exclusive OR' },
      { name: 'SWITCH', hint: 'Aiguillage selon une valeur', hintEn: 'Switch on a value' },
      { name: 'TRUE', hint: 'Vrai', hintEn: 'True' },
      { name: 'FALSE', hint: 'Faux', hintEn: 'False' },
    ],
  },
  {
    cat: 'Date / heure', catEn: 'Date / time',
    fns: [
      { name: 'TODAY', hint: 'Date du jour', hintEn: "Today's date" },
      { name: 'NOW', hint: 'Date et heure actuelles', hintEn: 'Current date and time' },
      { name: 'DATE', hint: 'DATE(année ; mois ; jour)', hintEn: 'DATE(year ; month ; day)' },
      { name: 'TIME', hint: 'TIME(h ; min ; s)', hintEn: 'TIME(h ; min ; s)' },
      { name: 'YEAR', hint: 'Année d’une date', hintEn: 'Year of a date' },
      { name: 'MONTH', hint: 'Mois d’une date', hintEn: 'Month of a date' },
      { name: 'DAY', hint: 'Jour d’une date', hintEn: 'Day of a date' },
      { name: 'HOUR', hint: 'Heure', hintEn: 'Hour' },
      { name: 'MINUTE', hint: 'Minute', hintEn: 'Minute' },
      { name: 'SECOND', hint: 'Seconde', hintEn: 'Second' },
      { name: 'WEEKDAY', hint: 'Jour de la semaine', hintEn: 'Day of the week' },
      { name: 'WEEKNUM', hint: 'Numéro de semaine', hintEn: 'Week number' },
      { name: 'EDATE', hint: 'Date décalée de n mois', hintEn: 'Date shifted by n months' },
      { name: 'EOMONTH', hint: 'Dernier jour du mois', hintEn: 'Last day of the month' },
      { name: 'DATEDIF', hint: 'Différence entre deux dates', hintEn: 'Difference between two dates' },
      { name: 'DAYS', hint: 'Nombre de jours entre deux dates', hintEn: 'Number of days between two dates' },
      { name: 'NETWORKDAYS', hint: 'Jours ouvrés entre deux dates', hintEn: 'Working days between two dates' },
      { name: 'WORKDAY', hint: 'Date après n jours ouvrés', hintEn: 'Date after n working days' },
      { name: 'DATEVALUE', hint: 'Texte → date', hintEn: 'Text → date' },
    ],
  },
  {
    cat: 'Recherche / matrices', catEn: 'Lookup / arrays',
    fns: [
      { name: 'VLOOKUP', hint: 'Recherche verticale', hintEn: 'Vertical lookup' },
      { name: 'HLOOKUP', hint: 'Recherche horizontale', hintEn: 'Horizontal lookup' },
      { name: 'XLOOKUP', hint: 'Recherche moderne (toutes directions)', hintEn: 'Modern lookup (any direction)' },
      { name: 'LOOKUP', hint: 'Recherche simple', hintEn: 'Simple lookup' },
      { name: 'INDEX', hint: 'INDEX(plage ; ligne ; col)', hintEn: 'INDEX(range ; row ; col)' },
      { name: 'MATCH', hint: 'Position dans une plage', hintEn: 'Position within a range' },
      { name: 'OFFSET', hint: 'Décale une référence', hintEn: 'Shifts a reference' },
      { name: 'INDIRECT', hint: 'Référence depuis du texte', hintEn: 'Reference from text' },
      { name: 'CHOOSE', hint: 'Choisit selon un index', hintEn: 'Chooses by index' },
      { name: 'ROW', hint: 'Numéro de ligne', hintEn: 'Row number' },
      { name: 'ROWS', hint: 'Nombre de lignes', hintEn: 'Number of rows' },
      { name: 'COLUMN', hint: 'Numéro de colonne', hintEn: 'Column number' },
      { name: 'COLUMNS', hint: 'Nombre de colonnes', hintEn: 'Number of columns' },
      { name: 'ADDRESS', hint: 'Référence A1 depuis ligne/col', hintEn: 'A1 reference from row/col' },
      { name: 'HYPERLINK', hint: 'Crée un lien cliquable', hintEn: 'Creates a clickable link' },
      { name: 'ARRAYFORMULA', hint: 'Applique à toute la colonne', hintEn: 'Applies to the whole column' },
      { name: 'FILTER', hint: 'Filtre une plage selon conditions', hintEn: 'Filters a range on conditions' },
      { name: 'SORT', hint: 'Trie une plage', hintEn: 'Sorts a range' },
      { name: 'SORTN', hint: 'Trie et garde les n premiers', hintEn: 'Sorts and keeps the first n' },
      { name: 'UNIQUE', hint: 'Valeurs uniques', hintEn: 'Unique values' },
      { name: 'TRANSPOSE', hint: 'Transpose lignes/colonnes', hintEn: 'Transposes rows/columns' },
      { name: 'FLATTEN', hint: 'Aplatit en une colonne', hintEn: 'Flattens into one column' },
      { name: 'QUERY', hint: 'Requête type SQL sur une plage', hintEn: 'SQL-like query on a range' },
      { name: 'IMPORTRANGE', hint: 'Importe depuis une autre feuille', hintEn: 'Imports from another sheet' },
    ],
  },
  {
    cat: 'Finance', catEn: 'Finance',
    fns: [
      { name: 'PMT', hint: 'Mensualité d’un emprunt', hintEn: 'Loan instalment' },
      { name: 'FV', hint: 'Valeur future', hintEn: 'Future value' },
      { name: 'PV', hint: 'Valeur actuelle', hintEn: 'Present value' },
      { name: 'RATE', hint: 'Taux d’intérêt', hintEn: 'Interest rate' },
      { name: 'NPER', hint: 'Nombre de périodes', hintEn: 'Number of periods' },
      { name: 'NPV', hint: 'Valeur actuelle nette', hintEn: 'Net present value' },
      { name: 'IRR', hint: 'Taux de rendement interne', hintEn: 'Internal rate of return' },
    ],
  },
  {
    cat: 'Info / type', catEn: 'Info / type',
    fns: [
      { name: 'ISBLANK', hint: 'Cellule vide ?', hintEn: 'Empty cell?' },
      { name: 'ISNUMBER', hint: 'Est un nombre ?', hintEn: 'Is a number?' },
      { name: 'ISTEXT', hint: 'Est du texte ?', hintEn: 'Is text?' },
      { name: 'ISERROR', hint: 'Est une erreur ?', hintEn: 'Is an error?' },
      { name: 'ISNA', hint: 'Est #N/A ?', hintEn: 'Is #N/A?' },
      { name: 'ISEMAIL', hint: 'Est un e-mail ?', hintEn: 'Is an email?' },
      { name: 'ISURL', hint: 'Est une URL ?', hintEn: 'Is a URL?' },
      { name: 'ISLOGICAL', hint: 'Est un booléen ?', hintEn: 'Is a boolean?' },
      { name: 'N', hint: 'Convertit en nombre', hintEn: 'Converts to a number' },
      { name: 'NA', hint: 'Renvoie #N/A', hintEn: 'Returns #N/A' },
    ],
  },
  {
    cat: 'Conversion / format', catEn: 'Conversion / format',
    fns: [
      { name: 'TO_PERCENT', hint: 'Format pourcentage', hintEn: 'Percentage format' },
      { name: 'DOLLAR', hint: 'Format monétaire', hintEn: 'Currency format' },
      { name: 'FIXED', hint: 'Nombre avec décimales fixes', hintEn: 'Number with fixed decimals' },
    ],
  },
  {
    cat: 'Google', catEn: 'Google',
    fns: [
      { name: 'GOOGLETRANSLATE', hint: 'Traduit un texte', hintEn: 'Translates a text' },
      { name: 'GOOGLEFINANCE', hint: 'Données boursières', hintEn: 'Stock market data' },
      { name: 'DETECTLANGUAGE', hint: 'Détecte la langue', hintEn: 'Detects the language' },
      { name: 'IMAGE', hint: 'Insère une image depuis une URL', hintEn: 'Inserts an image from a URL' },
      { name: 'SPARKLINE', hint: 'Mini-graphe dans une cellule', hintEn: 'Mini chart inside a cell' },
    ],
  },
]

/** Liste plate (pour l'autocomplétion du champ formule). */
export const GSHEETS_FUNCTIONS: GSheetsFunction[] = GSHEETS_FUNCTION_GROUPS.flatMap((g) =>
  g.fns.map((f) => ({ ...f, cat: g.cat, catEn: g.catEn })),
)
