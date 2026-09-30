import { Division, Range, halves, hizbs, juzs, pageOf, pageRange, quarters, surahAt, verseAt } from './quran';

/**
 * Choisit l'unité la plus lisible pour une quantité du Coran.
 *
 * Hiérarchie, du plus grand au plus petit :
 *   Juz’  >  hizb  >  nisf  >  rub‘  >  page  >  verset
 *
 * Règle : on ne descend d'un cran que si la plage ne correspond pas
 * **exactement** à l'unité supérieure. C'est ce qui interdit les libellés
 * absurdes du type « 0,2 hizb » : une fraction n'est jamais affichée.
 *
 * Ce module ne calcule rien de neuf : il lit les divisions déjà présentes
 * dans `core/quran.ts` (juzs, hizbs, halves, quarters, pages).
 */

export type RangeLabel = { main: string; detail: string };

const sameRange = (a: Range, b: Range): boolean => a.start === b.start && a.end === b.end;

const covering = (divisions: Division[], id: number): Division | null =>
  divisions.find(d => id >= d.start && id <= d.end) ?? null;

/** Unité entière dont la plage couvre exactement une division. */
function wholeDivision(divisions: Division[], range: Range): Division | null {
  const d = covering(divisions, range.start);
  return d && sameRange(range, d) ? d : null;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralForm}`;
}

/**
 * Libellé d'une plage contiguë.
 * Exemples : « Page 582 », « Versets 1 à 16 », « 1 rub‘ », « Juz’ ‘Amma ».
 */
export function describeRange(range: Range): RangeLabel {
  // 1. Juz’ entier
  const juz = wholeDivision(juzs, range);
  if (juz) return { main: juz.number === 30 ? 'Juz’ ‘Amma' : `Juz’ ${juz.number}`, detail: `${range.end - range.start + 1} versets` };

  // 2. hizb entier — on nomme la QUANTITÉ (1 hizb), jamais le numéro :
  //    « 2 hizb » se lirait comme une quantité et serait ambigu.
  if (wholeDivision(hizbs, range)) return { main: '1 hizb', detail: pageDetail(range) };

  // 3. nisf entier
  if (wholeDivision(halves, range)) return { main: '1 nisf', detail: pageDetail(range) };

  // 4. rub‘ entier
  if (wholeDivision(quarters, range)) return { main: '1 rub‘', detail: pageDetail(range) };

  // 5. pages entières
  const first = pageOf(range.start);
  const last = pageOf(range.end);
  if (sameRange(pageRange(first), { start: range.start, end: pageRange(first).end }) && sameRange(pageRange(last), { start: pageRange(last).start, end: range.end })) {
    const count = last - first + 1;
    return { main: count === 1 ? `Page ${first}` : `${count} pages`, detail: surahDetail(range) };
  }

  // 6. versets — le repli, toujours exact
  return { main: verseDetail(range), detail: surahDetail(range) };
}

function verseDetail(range: Range): string {
  const a = verseAt(range.start);
  const b = verseAt(range.end);
  if (a.surah === b.surah) return a.ayah === b.ayah ? `Verset ${a.ayah}` : `Versets ${a.ayah} à ${b.ayah}`;
  return `Sourate ${surahAt(range.start).name} ${a.ayah} → ${surahAt(range.end).name} ${b.ayah}`;
}

function surahDetail(range: Range): string {
  const a = surahAt(range.start);
  const b = surahAt(range.end);
  return a.number === b.number ? a.name : `${a.name} → ${b.name}`;
}

function pageDetail(range: Range): string {
  const first = pageOf(range.start);
  const last = pageOf(range.end);
  return first === last ? `Page ${first}` : `Pages ${first} à ${last}`;
}

/**
 * Libellé d'un ensemble de versets, contigus ou non.
 * C'est la forme utilisée pour les statistiques : « 23 pages apprises ».
 *
 * On retient la plus grande unité dont **au moins une** est entièrement
 * couverte, et on l'exprime en nombre entier. Jamais de fraction.
 */
export function describeVolume(ids: number[]): string {
  if (!ids.length) return '0 verset';
  const set = new Set(ids);

  const countWhole = (divisions: Division[]): number =>
    divisions.filter(d => {
      for (let id = d.start; id <= d.end; id++) if (!set.has(id)) return false;
      return true;
    }).length;

  const juzCount = countWhole(juzs);
  if (juzCount > 0) return plural(juzCount, 'juz’', 'juz’');
  const hizbCount = countWhole(hizbs);
  if (hizbCount > 0) return plural(hizbCount, 'hizb', 'hizb');
  const nisfCount = countWhole(halves);
  if (nisfCount > 0) return plural(nisfCount, 'nisf', 'nisf');
  const rubCount = countWhole(quarters);
  if (rubCount > 0) return plural(rubCount, 'rub‘', 'rub‘');

  const pageCount = new Set(ids.map(pageOf)).size;
  if (pageCount > 1) return `${pageCount} pages`;
  if (pageCount === 1) {
    // Une seule page : n'en revendiquer que les versets réellement présents.
    const p = pageOf(ids[0]);
    const whole = pageRange(p);
    let complete = true;
    for (let id = whole.start; id <= whole.end; id++) if (!set.has(id)) complete = false;
    if (complete) return `Page ${p}`;
  }

  return plural(ids.length, 'verset', 'versets');
}

/**
 * Libellé d'une séance : l'unité la plus lisible, complétée par la page
 * d'entrée quand elle manque.
 *
 * C'est l'information qui manquait pour ouvrir le Mushaf : la référence dit
 * « An Naba' 1–16 », mais pas « page 582 ».
 */
export function describePassage(range: Range): string {
  const label = describeRange(range);
  if (/juz/i.test(label.main)) return label.main;
  return withPage(label.main, range);
}

/**
 * Complète un libellé qui ne porte pas encore la page d'entrée.
 *
 * Utile quand le libellé ne vient pas de `describeRange` : `reference()` dit
 * « An Naba' 1–16 », ce qui ne dit pas où cela se trouve dans le Mushaf.
 * Un libellé qui nomme déjà une page est rendu tel quel — jamais « page 582
 * · page 582 ».
 */
export function withPage(label: string, range: Range): string {
  if (/page/i.test(label)) return label;
  const first = pageOf(range.start);
  const last = pageOf(range.end);
  return last === first ? `${label} · page ${first}` : `${label} · pages ${first} à ${last}`;
}

/** Échelle du Mushaf, du plus petit au plus grand. */
export const unitScale = ['Verset', 'Page', 'rub‘', 'nisf', 'hizb', 'Juz’'] as const;
