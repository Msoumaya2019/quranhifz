import { AppState, addDays, todayLocal } from './program';
import { Range } from './quran';
import { dayAge, reviewPlan } from './review';

/**
 * États internes d'un passage, et paliers de consolidation.
 *
 * Le moteur de révision existant (`core/review.ts`) fonctionne déjà : un
 * passage appris reste « récent » quelques jours, puis entre dans le cycle
 * habituel. Ce module ne le remplace pas — il **nomme** ce que ce moteur fait
 * déjà, et sort des constantes les seuils qui y étaient codés en dur.
 *
 * L'intérêt est double :
 *  - un passage ne redevient jamais « nouveau » après avoir été appris ;
 *  - les seuils de consolidation tiennent en trois constantes, modifiables
 *    en un seul endroit, sans toucher au planificateur.
 */

/**
 * Paliers de consolidation, en jours après l'apprentissage.
 * **Une seule source de vérité** : changer cette liste suffit à changer la
 * logique de consolidation. Le premier palier doit valoir 1 (lendemain).
 */
export const consolidationStages: readonly number[] = [1, 3, 7];

/** Fenêtre pendant laquelle un passage appris reste « récent ». */
export const recentWindowDays = consolidationStages[1] - 1;

/** Âge à partir duquel un passage entre dans le cycle habituel. */
export const stableFromDay = consolidationStages[1];

export type PassageState =
  | 'new'
  | 'inProgress'
  | 'recentlyLearned'
  | 'toConsolidate'
  | 'acquired'
  | 'struggling';

export const passageStateLabels: Record<PassageState, string> = {
  new: 'Nouveau',
  inProgress: 'En cours',
  recentlyLearned: 'Appris récemment',
  toConsolidate: 'À consolider',
  acquired: 'Acquis',
  struggling: 'À retravailler',
};

/** Ordre d'affichage : du jamais vu au consolidé. */
export const passageStateOrder: PassageState[] = [
  'new',
  'inProgress',
  'recentlyLearned',
  'toConsolidate',
  'struggling',
  'acquired',
];

/**
 * Gravité : plus le rang est BAS, plus le verset est en retard.
 * Distinct de l'ordre d'affichage — confondre les deux ferait passer
 * « à retravailler » pour moins grave que « à consolider ».
 */
export const passageStateSeverity: Record<PassageState, number> = {
  struggling: 0,
  toConsolidate: 1,
  recentlyLearned: 2,
  inProgress: 3,
  new: 4,
  acquired: 5,
};

const isMemorized = (state: AppState, id: number): boolean =>
  state.knowledge[id] === 'perfect' || state.knowledge[id] === 'review';

const isMarked = (state: AppState, id: number): boolean =>
  !!(state.difficultyMarkers?.[id]?.user || state.difficultyMarkers?.[id]?.admin);

/**
 * État d'un verset à une date donnée.
 *
 * `struggling` prime sur tout le reste : un verset marqué « à retravailler »
 * reste à retravailler, même s'il a été appris il y a longtemps.
 */
export function passageState(state: AppState, id: number, at = todayLocal()): PassageState {
  if (isMarked(state, id)) return 'struggling';

  if (!isMemorized(state, id)) {
    const engaged = state.sessions.some(
      session => session.start <= id && id <= session.end && session.status !== 'todo',
    );
    return engaged ? 'inProgress' : 'new';
  }

  const learnedAt = state.memorizedAt?.[id];
  if (!learnedAt) return 'recentlyLearned';

  const age = dayAge(learnedAt, at);
  if (age < stableFromDay) return 'recentlyLearned';

  const due = state.reviewDue?.[id];
  return !due || due <= at ? 'toConsolidate' : 'acquired';
}

/** État dominant d'une plage : le plus grave des versets qu'elle couvre. */
export function rangeState(state: AppState, range: Range, at = todayLocal()): PassageState {
  let worst: PassageState = 'acquired';
  for (let id = range.start; id <= range.end; id++) {
    const current = passageState(state, id, at);
    if (passageStateSeverity[current] < passageStateSeverity[worst]) worst = current;
  }
  return worst;
}

/**
 * Paliers restants pour un verset appris à `learnedAt`, `done` étant les
 * paliers déjà franchis. Un palier franchi ne revient jamais.
 */
export function remainingStages(learnedAt: string, done: readonly number[] = []): number[] {
  return consolidationStages.filter(stage => !done.includes(stage) && stage > 0);
}

/**
 * Prochaine échéance de consolidation, ou `null` si tous les paliers sont
 * franchis — c'est alors le cycle habituel qui prend le relais.
 */
export function nextConsolidationDate(
  learnedAt: string,
  done: readonly number[] = [],
): string | null {
  const remaining = remainingStages(learnedAt, done);
  if (!remaining.length) return null;
  return addDays(learnedAt, Math.min(...remaining));
}

/** Le passage est-il encore dans sa fenêtre de consolidation rapprochée ? */
export function isConsolidating(state: AppState, id: number, at = todayLocal()): boolean {
  const learnedAt = state.memorizedAt?.[id];
  if (!learnedAt || !isMemorized(state, id)) return false;
  return dayAge(learnedAt, at) < stableFromDay;
}

/** Décompte des passages par état, sur un ensemble de versets. */
export function stateCounts(
  state: AppState,
  ids: number[],
  at = todayLocal(),
): Record<PassageState, number> {
  const counts: Record<PassageState, number> = {
    new: 0,
    inProgress: 0,
    recentlyLearned: 0,
    toConsolidate: 0,
    acquired: 0,
    struggling: 0,
  };
  for (const id of ids) counts[passageState(state, id, at)] += 1;
  return counts;
}

/* ------------------------------------------------------------------ *
 * Les trois blocs du jour : NOUVEAU / À CONSOLIDER / RÉVISION
 * ------------------------------------------------------------------ */

export type TodayKind = 'new' | 'toConsolidate' | 'revision';

export type TodayBlock = {
  kind: TodayKind;
  title: string;
  hint: string;
  tasks: Range[];
  verses: number;
};

export type TodayPlan = {
  blocks: TodayBlock[];
  totalVerses: number;
  /** Séances prévues un jour passé et toujours à faire. */
  lateSessions: number;
};

/** Ordre d'affichage, et c'est aussi l'ordre de priorité entre les blocs. */
export const todayKinds: readonly TodayKind[] = ['new', 'toConsolidate', 'revision'];

export const todayBlockTitles: Record<TodayKind, string> = {
  new: 'NOUVEAU',
  toConsolidate: 'À CONSOLIDER',
  revision: 'RÉVISION',
};

const todayBlockHints: Record<TodayKind, string> = {
  new: 'Les passages prévus, jamais encore travaillés.',
  toConsolidate: 'Appris récemment : à revoir le lendemain, puis à J+3 et à J+7.',
  revision: 'Le cycle habituel, et ce que tu as marqué comme difficile.',
};

/**
 * Une plage est due pour la consolidation dès qu'**un** de ses versets atteint
 * le premier palier. On ne demande pas que la plage entière soit mûre : un
 * passage appris hier contient des versets appris hier.
 */
export function consolidationDue(state: AppState, range: Range, at = todayLocal()): boolean {
  for (let id = range.start; id <= range.end; id++) {
    const learnedAt = state.memorizedAt?.[id];
    if (!learnedAt || !isMemorized(state, id)) continue;
    if (dayAge(learnedAt, at) >= consolidationStages[0]) return true;
  }
  return false;
}

/** Parties d'une plage qu'aucun bloc n'a encore revendiquées. */
function freeParts(range: Range, claimed: Set<number>): Range[] {
  const parts: Range[] = [];
  let debut = -1;
  for (let id = range.start; id <= range.end; id++) {
    if (claimed.has(id)) {
      if (debut >= 0) { parts.push({ start: debut, end: id - 1 }); debut = -1; }
    } else if (debut < 0) debut = id;
  }
  if (debut >= 0) parts.push({ start: debut, end: range.end });
  return parts;
}

/**
 * Répartit le travail du jour en trois blocs, dans l'ordre d'affichage.
 *
 * **Invariant tenu : aucun verset n'apparaît dans deux blocs.** Les blocs sont
 * donc construits dans l'ordre de priorité — NOUVEAU, puis À CONSOLIDER, puis
 * RÉVISION — et chaque plage ne prend que les versets encore libres. Sans cela
 * un verset marqué « difficile » *et* arrivé à échéance serait compté deux fois.
 */
export function todayPlan(state: AppState, at = todayLocal()): TodayPlan {
  const claimed = new Set<number>();
  const claim = (range: Range): Range[] => {
    const parts = freeParts(range, claimed);
    for (const part of parts) for (let id = part.start; id <= part.end; id++) claimed.add(id);
    return parts;
  };

  const pending = state.sessions
    .filter(session => session.status === 'todo' && session.date <= at)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  const lateSessions = pending.filter(session => session.date < at).length;

  const fresh: Range[] = [];
  for (const session of pending) fresh.push(...claim(session));

  const plan = reviewPlan(state, at);

  const toConsolidate: Range[] = [];
  for (const task of plan.recent) {
    if (!consolidationDue(state, task, at)) continue;
    toConsolidate.push(...claim(task));
  }

  const revision: Range[] = [];
  for (const task of [...plan.priority, ...plan.habitual]) revision.push(...claim(task));

  const tasks: Record<TodayKind, Range[]> = { new: fresh, toConsolidate, revision };
  const blocks = todayKinds.map(kind => ({
    kind,
    title: todayBlockTitles[kind],
    hint: todayBlockHints[kind],
    tasks: tasks[kind],
    verses: tasks[kind].reduce((total, range) => total + (range.end - range.start + 1), 0),
  }));

  return {
    blocks,
    totalVerses: blocks.reduce((total, block) => total + block.verses, 0),
    lateSessions,
  };
}

/**
 * Date courte `JJ/MM/AAAA`, écrite à la main plutôt que par `toLocaleDateString`.
 *
 * Le formatage par locale dépend de la présence des données ICU : le même code
 * rend `29/09/2026` sur une machine et autre chose sur une autre. Ici la valeur
 * est comparée dans un banc, elle doit donc être **déterministe**.
 */
const shortDate = (key: string): string => key.split('-').reverse().join('/');

/**
 * Résumé de l'apprentissage, pour la carte posée sur l'écran du Coran.
 *
 * Trois cas, dans cet ordre : du travail aujourd'hui, une séance à venir, ou
 * rien du tout — et dans ce dernier cas la carte invite à définir un objectif.
 * L'ordre compte : une séance en retard est du travail d'aujourd'hui, pas une
 * séance « à venir ».
 */
export function learningSummary(state: AppState, at = todayLocal()): string {
  const plan = todayPlan(state, at);
  if (plan.totalVerses > 0) {
    const verses = `${plan.totalVerses} verset${plan.totalVerses === 1 ? '' : 's'}`;
    const late = plan.lateSessions ? ` · ${plan.lateSessions} séance${plan.lateSessions === 1 ? '' : 's'} en retard` : '';
    return `${verses} aujourd’hui${late}.`;
  }
  const upcoming = state.sessions
    .filter(session => session.status === 'todo' && session.date > at)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
  if (!upcoming) return 'Aucune séance prévue : définis ton objectif pour commencer.';
  const verses = upcoming.end - upcoming.start + 1;
  return `Rien aujourd’hui · prochaine séance le ${shortDate(upcoming.date)} (${verses} verset${verses === 1 ? '' : 's'}).`;
}
