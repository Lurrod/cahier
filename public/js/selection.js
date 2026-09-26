/* ---------------------------------------------------------------------------
   Cahier — la sélection : plusieurs tâches, un seul geste.

   On sélectionne au Ctrl+clic (ou Maj+clic) sur une ligne, ou avec `s` sur la
   ligne du curseur. Dès qu'une tâche est prise, une barre paraît en bas de la
   page ; `Échap` ou ✕ la vident.

   La sélection survit au changement de page : la liste n'en montre que
   quelques lignes à la fois, et une sélection confinée à une page ne vaudrait
   guère mieux que l'action à l'unité. Chaque tâche prise est retenue avec son
   état du moment, ce qui permet d'agir — et d'annuler — sur des lignes qui ne
   sont plus à l'écran.

   Toute action se défait par « Annuler », comme une suppression à l'unité.
   --------------------------------------------------------------------------- */

import { reporter } from './report.js';
import { resketch, sketchAll } from './sketch.js';
import { $ } from './util.js';

/** « Sans » catégorie ou priorité : la valeur vide d'un menu est déjà prise par son invite. */
const AUCUNE = '∅';

const option = (libelle, valeur) => {
  const el = document.createElement('option');
  el.value = valeur;
  el.textContent = libelle;
  return el;
};

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * @param {{
 *   taskList: HTMLElement,
 *   getTasks: () => Array<object>,
 *   getCategories: () => Array<{name: string}>,
 *   api: {
 *     bulk: (ids: string[], action: string, value?: string) => Promise<object>,
 *     replanifier: (items: Array<{id: string, dueDate: string}>) => Promise<object>,
 *     updateTask: (id: string, patch: object) => Promise<object>,
 *     restoreTask: (id: string) => Promise<object>,
 *   },
 *   refresh: (options?: object) => Promise<void>,
 *   toast: Function,
 *   maintenant?: () => Date,
 * }} deps
 */
export const initSelection = ({
  taskList,
  getTasks,
  getCategories,
  api,
  refresh,
  toast,
  maintenant = () => new Date(),
}) => {
  const barre = $('barre-lot');
  const compte = $('barre-lot-compte');
  const menuCategorie = $('barre-lot-categorie');
  const menuPriorite = $('barre-lot-priorite');

  /** id → la tâche telle qu'elle était quand on l'a prise. */
  let choisies = new Map();

  const ids = () => [...choisies.keys()];

  /**
   * Le menu des catégories se refait quand la barre paraît, et au focus : les
   * catégories arrivent après l'amorçage, et changent pendant la séance.
   */
  const remplirCategories = () => {
    const invite = option('Catégorie…', '');
    invite.disabled = true;
    menuCategorie.replaceChildren(
      invite,
      option('Sans catégorie', AUCUNE),
      ...getCategories().map((c) => option(c.name, c.name))
    );
    menuCategorie.selectedIndex = 0;
  };

  /** Reporte la sélection sur les lignes affichées et sur la barre. */
  const marquer = () => {
    taskList.querySelectorAll('.task').forEach((ligne) => {
      const prise = choisies.has(ligne.dataset.id);
      ligne.classList.toggle('is-selected', prise);
      ligne.setAttribute('aria-selected', String(prise));
    });

    const vide = choisies.size === 0;
    const etaitCachee = barre.hidden;
    barre.hidden = vide;
    if (vide) return;

    compte.textContent = `${pluriel(choisies.size, 'tâche')} ${choisies.size > 1 ? 'choisies' : 'choisie'}`;
    // les croquis se mesurent à l'attache : une barre qui sort de l'ombre
    // n'avait pas de taille quand ils ont été posés
    if (etaitCachee) {
      remplirCategories();
      sketchAll(barre);
      barre.querySelectorAll('[data-sketch]').forEach(resketch);
    }
  };

  const basculer = (task) => {
    const suite = new Map(choisies);
    if (suite.has(task._id)) suite.delete(task._id);
    else suite.set(task._id, task);
    choisies = suite;
    marquer();
  };

  const vider = () => {
    if (choisies.size === 0) return false;
    choisies = new Map();
    marquer();
    return true;
  };

  /** Toute la page affichée, ajoutée à ce qui était déjà pris. */
  const prendreLaPage = () => {
    choisies = new Map([...choisies, ...getTasks().map((t) => [t._id, t])]);
    marquer();
  };

  /**
   * Enveloppe commune : vide la sélection avant d'agir (la barre ne doit pas
   * rester sur des tâches qui viennent de changer), recharge, et propose
   * d'annuler.
   */
  const agir = async ({ faire, dire, defaire }) => {
    const prises = [...choisies.values()];
    if (prises.length === 0) return;
    vider();
    try {
      await faire(prises);
      await refresh({ silent: true });
      toast(dire(prises.length), 'success', {
        label: 'Annuler',
        onClick: async () => {
          try {
            await defaire(prises);
            await refresh({ silent: true });
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      });
    } catch (error) {
      toast(error.message, 'error');
      await refresh({ silent: true });
    }
  };

  const idsDe = (prises) => prises.map((t) => t._id);

  const ACTIONS = {
    rayer: () =>
      agir({
        faire: (prises) => api.bulk(idsDe(prises), 'complete'),
        dire: (n) => `${pluriel(n, 'tâche')} rayée${n > 1 ? 's' : ''}.`,
        defaire: (prises) => api.bulk(idsDe(prises), 'uncomplete'),
      }),

    journee: () =>
      agir({
        faire: (prises) =>
          Promise.all(
            prises.map((t) => api.updateTask(t._id, { myDay: maintenant().toISOString() }))
          ),
        dire: (n) => `${pluriel(n, 'tâche')} dans ma journée.`,
        defaire: (prises) =>
          Promise.all(prises.map((t) => api.updateTask(t._id, { myDay: t.myDay ?? null }))),
      }),

    demain: () =>
      agir({
        faire: (prises) =>
          api.replanifier(
            prises.map((t) => ({ id: t._id, dueDate: reporter(t.dueDate, 'demain', maintenant()) }))
          ),
        dire: (n) => `${pluriel(n, 'tâche')} reportée${n > 1 ? 's' : ''} à demain.`,
        // une tâche qui n'avait pas de date la perd à nouveau : le report en
        // bloc n'accepte que des dates, d'où le passage à l'unité pour elles
        defaire: async (prises) => {
          const datees = prises.filter((t) => t.dueDate);
          const sansDate = prises.filter((t) => !t.dueDate);
          if (datees.length) {
            await api.replanifier(datees.map((t) => ({ id: t._id, dueDate: t.dueDate })));
          }
          await Promise.all(sansDate.map((t) => api.updateTask(t._id, { dueDate: null })));
        },
      }),

    supprimer: () =>
      agir({
        faire: (prises) => api.bulk(idsDe(prises), 'delete'),
        dire: (n) => `${pluriel(n, 'tâche')} à la corbeille.`,
        defaire: (prises) => Promise.all(prises.map((t) => api.restoreTask(t._id))),
      }),
  };

  /** Les deux menus rendent à chaque tâche sa valeur d'avant, une par une. */
  const parMenu = (champ, action, libelle) => (valeur) =>
    agir({
      faire: (prises) => api.bulk(idsDe(prises), action, valeur),
      dire: (n) => `${pluriel(n, 'tâche')} · ${libelle(valeur)}.`,
      defaire: (prises) =>
        Promise.all(prises.map((t) => api.updateTask(t._id, { [champ]: t[champ] || '' }))),
    });

  const ranger = parMenu('category', 'category', (v) => (v ? `dans « ${v} »` : 'sans catégorie'));
  const prioriser = parMenu('priority', 'priority', (v) =>
    v ? `priorité ${{ high: 'haute', medium: 'moyenne', low: 'basse' }[v]}` : 'sans priorité'
  );

  barre.addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-lot]');
    if (!bouton) return;
    if (bouton.dataset.lot === 'vider') vider();
    else ACTIONS[bouton.dataset.lot]?.();
  });

  menuCategorie.addEventListener('focus', remplirCategories);
  menuCategorie.addEventListener('change', () => {
    const valeur = menuCategorie.value === AUCUNE ? '' : menuCategorie.value;
    menuCategorie.selectedIndex = 0;
    ranger(valeur);
  });

  menuPriorite.addEventListener('change', () => {
    const valeur = menuPriorite.value === AUCUNE ? '' : menuPriorite.value;
    menuPriorite.selectedIndex = 0;
    prioriser(valeur);
  });

  /**
   * Ctrl+clic ou Maj+clic sur une ligne. Un clic qui vise un bouton, une case
   * ou un lien garde son sens premier : sélectionner en cochant serait
   * surprendre.
   */
  taskList.addEventListener('click', (e) => {
    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) return;
    if (e.target.closest('button, input, a, select, label')) return;
    const ligne = e.target.closest('.task');
    const task = getTasks().find((t) => t._id === ligne?.dataset.id);
    if (!task) return;
    e.preventDefault();
    basculer(task);
  });

  remplirCategories();

  return { basculer, vider, prendreLaPage, marquer, taille: () => choisies.size, ids };
};
