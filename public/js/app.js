/* ---------------------------------------------------------------------------
   Cahier — logique de l'application.
   Le serveur trie, filtre et cherche ; le client affiche la page qu'il reçoit
   et annote le HTML (data-sketch=…) pour que sketch.js y pose les traits.
   --------------------------------------------------------------------------- */

import * as api from './api.js';
import { appliquerApparence, restaurerApparence, suivreLeSysteme } from './apparence.js';
import { initDragDrop } from './dragdrop.js';
import {
  accorderOuverture,
  appliquerOuverture,
  initFilters,
  showMyDayCount,
  showOverdueCount,
} from './filters.js';
import { initKeyboard } from './keyboard.js';
import { telecharger, telechargerSauvegarde } from './backup.js';
import { dessinerBilan, noteDuJour } from './bilan.js';
import { initMisesAJour } from './maj.js';
import { bindBackdrop } from './modal.js';
import { initPalette } from './palette.js';
import { reporter } from './report.js';
import { initPreferences } from './preferences.js';
import { initReglages } from './reglages.js';
import { initCategories } from './categories.js';
import { initComposeur } from './composeur.js';
import { dupliquer } from './dupliquer.js';
import { initModifier } from './modifier.js';
import { initSelection } from './selection.js';
import { resetSteps, toggleSteps } from './steps.js';
import { initTrash } from './trash.js';

import { progress, setCrayon, setText, sketchAll, strike, unsketchAll } from './sketch.js';

import {
  $,
  dueStatus,
  escapeHtml,
  formatDate,
  isToday,
  greetingForHour,
  encreDeCategorie,
  toast,
} from './util.js';

const PAGE_SIZE = 5;

/**
 * Le nombre de lignes par page, tel que réglé. Lu à chaque requête : les
 * réglages sont chargés avant la première liste, et peuvent changer ensuite.
 */
const taillePage = () => Number.parseInt(preferences.valeurs()?.liste?.parPage, 10) || PAGE_SIZE;
const NEUTRAL_COLOR = 'var(--ink-faint)';
const SEARCH_DEBOUNCE_MS = 150;
const PRIORITY_LABELS = { high: 'haute', medium: 'moyenne', low: 'basse' };

/** Ce que dit le pictogramme de récurrence au survol et aux aides techniques. */
const RECURRENCE_LABELS = {
  daily: 'Chaque jour',
  weekdays: 'Chaque jour ouvré',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  yearly: 'Chaque année',
};

/** Ce que dit le pictogramme de rappel au survol et aux aides techniques. */
const REMINDER_LABELS = {
  atDue: 'Rappel à l’heure dite',
  '1h': 'Rappel une heure avant',
  '1d': 'Rappel la veille',
};

const taskList = $('task-list');
const taskTitleInput = $('task-title');
const sortSelect = $('sort-select');
const searchInput = $('search-input');

const prevPageBtn = $('prev-page');
const nextPageBtn = $('next-page');
const pageInfo = $('page-info');

const emptyState = $('empty-state');
const skeletonList = $('loading-skeleton');
const subtitle = $('subtitle');
const progressTrack = $('progress-track');
const progressLabel = $('progress-label');

const statTotal = $('stat-total');
const statDone = $('stat-done');
const statActive = $('stat-active');

let state = {
  tasks: [],
  totalPages: 1,
  currentPage: 1,
  sort: 'creation',
  status: 'all',
  category: 'all',
  due: 'all',
  query: '',
  tag: '',
  categories: [],
  stats: { total: 0, done: 0, active: 0, overdue: 0, byCategory: [] },
  cursor: -1,
};

/* ----------------------------------------------------------------------
   Chargement
   ---------------------------------------------------------------------- */

const queryFor = (page) => ({
  page,
  limit: taillePage(),
  sort: state.sort,
  status: state.status,
  category: state.category,
  due: state.due,
  q: state.query,
  tag: state.tag,
});

// deux frappes rapprochées lancent deux requêtes : seule la dernière compte,
// sans quoi une réponse lente écraserait un résultat plus récent
let pendingRequest = 0;

/**
 * Recharge la page courante et les compteurs.
 * @param {{page?: number, silent?: boolean}} options `silent` évite le squelette
 * quand l'écran a déjà été mis à jour de façon optimiste.
 */
const refresh = async ({ page = state.currentPage, silent = false } = {}) => {
  const ticket = ++pendingRequest;

  if (!silent) {
    skeletonList.classList.remove('hidden');
    taskList.style.opacity = '0.4';
  }

  try {
    const [list, stats] = await Promise.all([api.listTasks(queryFor(page)), api.fetchStats()]);
    if (ticket !== pendingRequest) return;

    state = {
      ...state,
      tasks: list.tasks || [],
      totalPages: Math.max(1, list.totalPages || 1),
      currentPage: list.currentPage || 1,
      stats,
    };
    render();
  } catch (error) {
    if (ticket === pendingRequest) toast(error.message, 'error');
  } finally {
    if (ticket === pendingRequest) {
      skeletonList.classList.add('hidden');
      taskList.style.opacity = '';
    }
  }
};

/* ----------------------------------------------------------------------
   Actions
   ---------------------------------------------------------------------- */

/** Bascule affichée immédiatement, puis confirmée par le serveur. */
const toggleTask = async (task, completed) => {
  const delta = completed ? 1 : -1;
  state = {
    ...state,
    tasks: state.tasks.map((t) => (t._id === task._id ? { ...t, completed } : t)),
    stats: {
      ...state.stats,
      done: state.stats.done + delta,
      active: state.stats.active - delta,
    },
  };
  render();

  try {
    await api.updateTask(task._id, { completed });
  } catch (error) {
    toast(error.message, 'error');
  }
  await refresh({ silent: true });
};

/** Pose la tâche dans la journée, ou l'en retire si elle y est déjà. */
const toggleMyDay = async (task) => {
  const dedans = isToday(task.myDay);
  try {
    await api.updateTask(task._id, { myDay: dedans ? null : new Date().toISOString() });
    toast(dedans ? 'Retirée de ma journée.' : 'Ajoutée à ma journée.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
  await refresh({ silent: true });
};

/** Fait glisser l'échéance — au lendemain, ou au lundi qui vient. */
const postponeTask = async (task, cible) => {
  const dueDate = reporter(task.dueDate, cible);
  try {
    await api.updateTask(task._id, { dueDate });
    toast(`Reportée · ${formatDate(dueDate)}`, 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
  await refresh({ silent: true });
};

/**
 * Tous les retards glissent à demain, chacun à son heure, en un seul envoi.
 * La borne de 100 est celle du serveur : au-delà, la note le dit, et relancer
 * la commande prend la suite.
 */
const postponeOverdue = async () => {
  try {
    const { tasks, total } = await api.listTasks({ due: 'overdue', status: 'active', limit: 100 });
    if (tasks.length === 0) {
      toast('Aucun retard à reporter.', 'info');
      return;
    }
    const avant = tasks.map((t) => ({ id: t._id, dueDate: t.dueDate }));
    await api.replanifier(avant.map((t) => ({ ...t, dueDate: reporter(t.dueDate, 'demain') })));
    await refresh({ silent: true });
    const suite =
      total > tasks.length ? ` (${tasks.length} sur ${total} — relancer pour la suite)` : '';
    toast(
      `${tasks.length} retard${tasks.length > 1 ? 's' : ''} reporté${tasks.length > 1 ? 's' : ''} à demain${suite}.`,
      'success',
      {
        label: 'Annuler',
        onClick: async () => {
          try {
            await api.replanifier(avant);
            await refresh({ silent: true });
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      }
    );
  } catch (error) {
    toast(error.message, 'error');
  }
};

/** Suppression immédiate, réparable tant que la note « Annuler » est affichée. */
const removeTask = async (task) => {
  state = { ...state, tasks: state.tasks.filter((t) => t._id !== task._id) };
  render();

  try {
    await api.deleteTask(task._id);
    toast('Tâche supprimée.', 'info', {
      label: 'Annuler',
      onClick: () => restoreTask(task._id),
    });
  } catch (error) {
    toast(error.message, 'error');
  }
  await refresh({ silent: true });
};

const dupliquerTache = (task) => dupliquer(task, { api, refresh, toast });

const restoreTask = async (id) => {
  try {
    await api.restoreTask(id);
    await refresh({ silent: true });
    toast('Tâche restaurée.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
};

/* ----------------------------------------------------------------------
   Rendu
   ---------------------------------------------------------------------- */

const priorityMark = (priority) => {
  if (!PRIORITY_LABELS[priority]) return '';
  return `<span class="task-prio" data-level="${priority}" role="img" aria-label="Priorité ${PRIORITY_LABELS[priority]}">*</span>`;
};

/** Le soleil de la ligne : allumé quand la tâche est dans la journée. */
const myDayButton = (task) => {
  const dedans = isToday(task.myDay);
  const label = dedans ? 'Retirer de ma journée (m)' : 'Ajouter à ma journée (m)';
  return `<button class="task-myday${dedans ? ' is-on' : ''}" type="button" aria-pressed="${dedans}" title="${label}" aria-label="${label}">☀</button>`;
};

/** Pourquoi un dossier répond à la recherche alors que son titre n'y est pas. */
const matchedStepsNote = (titles) =>
  titles?.length
    ? `<p class="task-matched-steps">↳ dans les étapes : ${titles.map(escapeHtml).join(' · ')}</p>`
    : '';

const renderTaskItem = (task) => {
  const li = document.createElement('li');
  li.className = `task${task.completed ? ' is-done' : ''}`;
  li.dataset.sketch = 'card';
  li.dataset.id = task._id;
  // réordonner à la main une liste triée par priorité produirait un ordre
  // que le tri réécraserait au prochain chargement : seul le tri manuel
  // rend les lignes saisissables
  li.draggable = state.sort === 'manual';

  const category = state.categories.find((c) => c.name === task.category);
  const categoryColor = encreDeCategorie(category?.color, NEUTRAL_COLOR);
  const formattedDate = formatDate(task.dueDate);
  const status = dueStatus(task.dueDate);

  const metaParts = [];
  if (formattedDate) {
    const cls = status === 'overdue' ? ' is-overdue' : status === 'soon' ? ' is-soon' : '';
    const label = status === 'overdue' ? 'En retard' : 'Échéance';
    metaParts.push(
      `<span class="task-due${cls}">${escapeHtml(label)} · ${escapeHtml(formattedDate)}</span>`
    );
    // le retard se trie d'un geste : l'ouvrir dans « Modifier » pour retaper
    // une date est exactement la friction qui fait s'accumuler les retards
    if (status === 'overdue' && !task.completed) {
      metaParts.push(
        `<button type="button" class="task-postpone" title="Reporter à demain (r)">→ demain</button>`
      );
    }
  }
  if (task.childCount > 0) {
    metaParts.push(
      `<button type="button" class="task-steps-toggle">Étapes <span class="task-steps-count">${task.childDone} / ${task.childCount}</span></button>`
    );
  }
  if (task.category) {
    metaParts.push(
      `<span class="tag" data-sketch="badge" data-stroke="${escapeHtml(categoryColor)}">${escapeHtml(task.category)}</span>`
    );
  }
  // transversales et sans couleur : les colorier ferait deux classements
  // concurrents dans la même vue, la catégorie reste seule à porter une teinte
  (task.tags || []).forEach((tag) => {
    metaParts.push(
      `<button type="button" class="task-tag" data-tag="${escapeHtml(tag)}">+${escapeHtml(tag)}</button>`
    );
  });
  if (task.recurrence?.freq) {
    const label = escapeHtml(RECURRENCE_LABELS[task.recurrence.freq]);
    metaParts.push(`<span class="task-recurrence" title="${label}" aria-label="${label}">↻</span>`);
  }
  if (task.reminder?.offset) {
    const label = escapeHtml(REMINDER_LABELS[task.reminder.offset]);
    metaParts.push(`<span class="task-reminder" title="${label}" aria-label="${label}">🔔</span>`);
  }

  li.innerHTML = `
    <span class="task-check" data-sketch="checkbox">
      <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Marquer comme ${task.completed ? 'non terminée' : 'terminée'}" />
    </span>
    <div class="task-body">
      <span class="task-title">${priorityMark(task.priority)}${escapeHtml(task.title)}</span>
      ${task.description ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
      ${metaParts.length ? `<div class="task-meta">${metaParts.join('')}</div>` : ''}
      ${matchedStepsNote(task.matchedSteps)}
    </div>
    <div class="task-actions">
      ${myDayButton(task)}
      <button class="btn edit" type="button" data-sketch="button" data-tone="neutral">Modifier</button>
      <button class="btn delete" type="button" data-sketch="button" data-tone="danger">Supprimer</button>
    </div>
  `;

  li.querySelector('.task-check input').addEventListener('change', (e) => {
    toggleTask(task, e.target.checked);
  });

  li.querySelector('.edit').addEventListener('click', () => modifier.ouvrir(task));

  li.querySelector('.delete').addEventListener('click', () => removeTask(task));

  li.querySelector('.task-myday').addEventListener('click', () => toggleMyDay(task));

  li.querySelector('.task-postpone')?.addEventListener('click', () => postponeTask(task, 'demain'));

  li.querySelectorAll('.task-tag').forEach((btn) => {
    btn.addEventListener('click', () => {
      state = { ...state, tag: btn.dataset.tag };
      refresh({ page: 1 });
    });
  });

  const stepsToggle = li.querySelector('.task-steps-toggle');
  if (stepsToggle) {
    stepsToggle.addEventListener('click', () => toggleSteps(li, task._id));
  }

  return li;
};

const EMPTY_COPY = {
  horizon: ['Rien sur cet horizon.', 'Aucune tâche à cette échéance.'],
  search: ['Rien sous ce mot.', 'Aucune tâche ne contient « %s ».'],
  done: ['Aucune tâche rayée.', 'Coche une tâche pour la barrer d’un trait.'],
  cleared: ['Tout est rayé.', 'Plus rien en attente.'],
  category: ['Catégorie vide.', 'Aucune tâche rangée ici pour le moment.'],
  blank: ['Page blanche.', 'Écris ta première tâche là-haut pour commencer.'],
};

const updateEmptyState = () => {
  if (state.tasks.length > 0) {
    emptyState.classList.add('hidden');
    return;
  }

  let key = 'blank';
  if (state.query) key = 'search';
  else if (state.due !== 'all') key = 'horizon';
  else if (state.status === 'done') key = 'done';
  else if (state.status === 'active' && state.stats.total > 0) key = 'cleared';
  else if (state.category !== 'all') key = 'category';

  const [title, sub] = EMPTY_COPY[key];
  emptyState.querySelector('.empty-title').textContent = title;
  emptyState.querySelector('.empty-sub').textContent = sub.replace('%s', state.query);
  emptyState.classList.remove('hidden');
  sketchAll(emptyState);
};

const render = () => {
  // une liste fraîchement rendue ne doit pas rouvrir sur des étapes périmées
  resetSteps();

  // les croquis tiennent un ResizeObserver sur leur hôte : on les détache
  // avant de jeter le DOM qui les porte
  unsketchAll(taskList);
  taskList.innerHTML = '';

  const rendered = state.tasks.map((task) => ({ task, li: renderTaskItem(task) }));
  rendered.forEach(({ li }) => taskList.appendChild(li));
  sketchAll(taskList);
  // le curseur clavier survit au rendu tant qu'il reste dans la page
  applyCursor();
  selection.marquer();

  // le trait de biffage se mesure sur le titre une fois mis en page
  rendered.forEach(({ task, li }) => {
    if (task.completed) strike(li.querySelector('.task-title'));
  });

  updateEmptyState();

  pageInfo.textContent = `Page ${state.currentPage} / ${state.totalPages}`;
  prevPageBtn.disabled = state.currentPage <= 1;
  nextPageBtn.disabled = state.currentPage >= state.totalPages;

  categories.dessiner();
  updateGreeting();
  updateCounters();
};

const updateCounters = () => {
  const { total, done, active } = state.stats;
  statTotal.textContent = total;
  statDone.textContent = done;
  setText(statActive, active);

  const ratio = total > 0 ? done / total : 0;
  progress(progressTrack, ratio);
  progressLabel.textContent = total > 0 ? `${Math.round(ratio * 100)}%` : '–';

  const note = noteDuJour(state.stats.bilan);
  if (total === 0) {
    subtitle.textContent = "Le cahier est vierge. Ajoute une ligne pour l'ouvrir.";
  } else if (active === 0) {
    subtitle.textContent = `Tout est rayé${note}. Bien joué.`;
  } else if (active === 1) {
    subtitle.textContent = `Une tâche reste à traiter${note}.`;
  } else {
    subtitle.textContent = `${active} tâches restent à traiter${note}.`;
  }
  dessinerBilan(state.stats.bilan);

  showOverdueCount(state.stats.overdue || 0);
  showMyDayCount(state.stats.myDay || 0);
};

const updateGreeting = () => {
  setText(document.querySelector('.display .greeting'), greetingForHour(new Date().getHours()));
};

/* ----------------------------------------------------------------------
   Événements
   ---------------------------------------------------------------------- */

sortSelect.addEventListener('change', (e) => {
  state = { ...state, sort: e.target.value };
  refresh({ page: 1 });
});

let searchTimer = null;
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state = { ...state, query };
    refresh({ page: 1 });
  }, SEARCH_DEBOUNCE_MS);
});

initFilters({
  getState: () => state,
  setState: (patch) => {
    state = { ...state, ...patch };
  },
  refresh,
});

initDragDrop({
  taskList,
  moveTask: api.moveTask,
  refresh,
  toast,
});

const { openTrash } = initTrash({ restoreTask });

const categories = initCategories({
  getState: () => state,
  setState: (patch) => {
    state = { ...state, ...patch };
  },
  api,
  refresh,
  toast,
});

initComposeur({
  getCategories: () => state.categories,
  createTask: api.createTask,
  refresh,
  toast,
});

const modifier = initModifier({
  getTask: (id) => state.tasks.find((t) => t._id === id),
  updateTask: api.updateTask,
  refresh,
  toast,
  dupliquerTache: (task) => dupliquerTache(task),
});

const selection = initSelection({
  taskList,
  getTasks: () => state.tasks,
  getCategories: () => state.categories,
  api,
  refresh,
  toast,
});

const { openPalette, closePalette } = initPalette({
  focusTitle: () => taskTitleInput.focus(),
  focusSearch: () => searchInput.focus(),
  openTrash,
  ouvrirReglages: () => reglages.ouvrir(),
  sauvegarder: () => telechargerSauvegarde(),
  exporterAgenda: () => telecharger('/export.ics'),
  reporterRetards: postponeOverdue,
  choisirLaPage: () => selection.prendreLaPage(),
});

const { applyCursor } = initKeyboard({
  getState: () => state,
  setState: (patch) => {
    state = { ...state, ...patch };
  },
  toggleTask,
  removeTask,
  postponeTask,
  toggleMyDay,
  basculerSelection: (task) => selection.basculer(task),
  dupliquerTache,
  viderSelection: () => selection.vider(),
  openPalette,
  closePalette,
  focusSearch: () => searchInput.focus(),
  focusTitle: () => taskTitleInput.focus(),
});

prevPageBtn.addEventListener('click', () => {
  if (state.currentPage > 1) refresh({ page: state.currentPage - 1 });
});

nextPageBtn.addEventListener('click', () => {
  if (state.currentPage < state.totalPages) refresh({ page: state.currentPage + 1 });
});

document.querySelectorAll('.modal').forEach(bindBackdrop);

/* ----------------------------------------------------------------------
   Démarrage
   ---------------------------------------------------------------------- */

// avant le premier trait : l'apparence du dernier lancement est reposée depuis
// le miroir local, pour que la page ne s'ouvre pas dans une mise en page qu'on
// verrait changer une fraction de seconde plus tard
restaurerApparence({ poserCrayon: setCrayon });
suivreLeSysteme({});

sketchAll();
updateGreeting();

/** Les réglages, détenus à un seul endroit ; tout ce qui les suit s'y abonne. */
const preferences = initPreferences({
  lire: api.fetchPreferences,
  ecrire: api.savePreferences,
});

/** La page Réglages se dessine à partir du schéma décrit par le serveur. */
const reglages = initReglages({
  preferences,
  lireSchema: api.fetchSchemaPreferences,
  lireSysteme: api.fetchSysteme,
  agirMaj: api.agirMaj,
  importer: api.importerSauvegarde,
  rafraichir: () => refresh(),
  toast,
});

$('open-settings').addEventListener('click', () => reglages.ouvrir());
$('close-settings').addEventListener('click', () => reglages.fermer());

// l'apparence suit les réglages, d'où qu'ils changent
preferences.surChangement((valeurs) =>
  appliquerApparence(valeurs?.apparence, { poserCrayon: setCrayon })
);

// la taille de page aussi, mais la première annonce (au chargement) précède
// la première liste : la relire là ferait une requête pour rien
// — et « pas encore annoncée » n'est pas « annoncée sans valeur » : un
// serveur plus ancien ne connaît pas ce réglage
const PAS_ENCORE = Symbol('pas encore annoncée');
let parPageConnu = PAS_ENCORE;
preferences.surChangement((valeurs) => {
  const parPage = valeurs?.liste?.parPage;
  if (parPageConnu !== PAS_ENCORE && parPage !== parPageConnu) refresh({ page: 1 });
  parPageConnu = parPage;
});

const misesAJour = initMisesAJour({
  lireSysteme: api.fetchSysteme,
  agir: api.agirMaj,
  // lue à chaque fois : elle peut changer pendant que le Cahier est ouvert
  prevenir: () => preferences.valeurs()?.misesAJour?.prevenir !== false,
  toast,
});

/**
 * Pose la vue d'ouverture réglée, sans rien charger.
 *
 * Doit précéder le premier chargement : passer par un clic sur les pastilles
 * demanderait une liste de plus, et montrerait brièvement la mauvaise vue.
 */
const appliquerOuvertureReglee = (ouverture) => {
  if (!ouverture) return;

  const { statut, horizon } = accorderOuverture({
    statut: ouverture.statut,
    horizon: ouverture.horizon,
  });

  state = { ...state, status: statut, due: horizon, sort: ouverture.tri };
  sortSelect.value = ouverture.tri;
  appliquerOuverture({ statut, horizon });
};

(async () => {
  // les réglages et les catégories ensemble : les premiers décident de la vue
  // à demander, les secondes portent les couleurs que le rendu y lira
  const [valeurs] = await Promise.all([preferences.charger(), categories.charger()]);

  appliquerOuvertureReglee(valeurs?.ouverture);
  await refresh({ page: 1 });

  // en dernier : l'état de la mise à jour ne doit retarder l'ouverture de rien
  await misesAJour.rafraichir();
})();
