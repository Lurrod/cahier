/* ---------------------------------------------------------------------------
   Cahier — les catégories : la liste de la marge, les menus qui les
   proposent, l'ajout et la suppression confirmée.

   Sorti d'app.js, qui dépassait la taille que se donne le projet. La catégorie
   active et les compteurs restent dans l'état de la page, lus et écrits par
   `getState`/`setState` ; la catégorie en attente de suppression, elle, ne
   concerne que ce module.
   --------------------------------------------------------------------------- */

import { closeModal, openModal } from './modal.js';
import { resketch, sketchAll, unsketchAll } from './sketch.js';
import { $, encreDeCategorie, escapeHtml } from './util.js';

// un jeton, pas une couleur : le surligneur change d'encre avec le thème
const HIGHLIGHTER = 'var(--highlighter)';
const NEUTRAL_COLOR = 'var(--ink-faint)';

/**
 * @param {{
 *   getState: () => {category: string, categories: Array, stats: object},
 *   setState: (patch: object) => void,
 *   api: {listCategories: Function, createCategory: Function, deleteCategory: Function},
 *   refresh: (options?: object) => Promise<void>,
 *   toast: Function,
 * }} deps
 * @returns {{charger: () => Promise<void>, dessiner: () => void}}
 */
export const initCategories = ({ getState, setState, api, refresh, toast }) => {
  const liste = $('categories-list');
  const formulaire = $('category-form');
  const champNom = $('category-input');
  const champCouleur = $('category-color-input');
  const modaleSuppression = $('delete-category-modal');
  const messageSuppression = $('delete-category-message');

  /** La catégorie dont la suppression attend confirmation. */
  let aSupprimer = null;

  const remplirMenus = () => {
    [$('task-category'), $('edit-category')].forEach((select) => {
      const current = select.value;
      select.innerHTML = '<option value="">Sans catégorie</option>';
      getState().categories.forEach((category) => {
        const opt = document.createElement('option');
        opt.value = category.name;
        opt.textContent = category.name;
        select.appendChild(opt);
      });
      if (current) select.value = current;
      // la largeur du croquis est mesurée à l'attache : on redessine après coup
      resketch(select.closest('[data-sketch="select"]'));
    });
  };

  const charger = async () => {
    try {
      setState({ categories: await api.listCategories() });
      remplirMenus();
    } catch (error) {
      toast('Impossible de charger les catégories.', 'error');
    }
  };

  const ajouter = async (name, color) => {
    if (getState().categories.some((c) => c.name === name)) {
      toast('Cette catégorie existe déjà.', 'error');
      return;
    }
    try {
      await api.createCategory(name, color);
      await charger();
      await refresh({ silent: true });
      toast(`Catégorie « ${name} » ajoutée.`, 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const supprimer = async (name) => {
    try {
      await api.deleteCategory(name);
      if (getState().category === name) setState({ category: 'all' });
      await charger();
      await refresh({ page: 1 });
      closeModal(modaleSuppression);
      toast('Catégorie supprimée.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const ligne = (name, label, color, count) => {
    const isActive = getState().category === name;
    const li = document.createElement('li');
    li.className = 'cat-item';
    li.dataset.category = name;
    li.innerHTML = `
    <span class="cat-dot" style="background: ${escapeHtml(color)}"></span>
    <span class="cat-name"${isActive ? ` data-sketch="highlight" data-stroke="${HIGHLIGHTER}"` : ''}>${escapeHtml(label)}</span>
    <span class="cat-count">${count}</span>
    ${name === 'all' ? '' : `<button class="cat-delete" type="button" data-category="${escapeHtml(name)}" aria-label="Supprimer ${escapeHtml(name)}">×</button>`}
  `;
    return li;
  };

  const dessiner = () => {
    const { stats, categories } = getState();
    const counts = new Map(stats.byCategory.map(({ category, count }) => [category, count]));

    unsketchAll(liste);
    liste.innerHTML = '';
    liste.appendChild(ligne('all', 'Toutes les tâches', NEUTRAL_COLOR, stats.total));
    categories.forEach((category) => {
      liste.appendChild(
        ligne(
          category.name,
          category.name,
          encreDeCategorie(category.color, NEUTRAL_COLOR),
          counts.get(category.name) || 0
        )
      );
    });

    liste.querySelectorAll('.cat-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.cat-delete')) return;
        setState({ category: item.dataset.category });
        refresh({ page: 1 });
      });
    });

    liste.querySelectorAll('.cat-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        aSupprimer = btn.dataset.category;
        messageSuppression.textContent = `La catégorie « ${aSupprimer} » sera retirée des tâches associées.`;
        openModal(modaleSuppression);
      });
    });

    sketchAll(liste);
  };

  const soumettre = () => {
    const name = champNom.value.trim();
    const color = champCouleur.value || '#1f2f5c';
    if (!name) {
      champNom.focus();
      return;
    }
    ajouter(name, color);
    champNom.value = '';
    champNom.focus();
  };

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();
    soumettre();
  });

  $('add-category-btn').addEventListener('click', (e) => {
    e.preventDefault();
    soumettre();
  });

  $('confirm-delete-category').addEventListener('click', () => {
    if (aSupprimer) {
      supprimer(aSupprimer);
      aSupprimer = null;
    }
  });

  $('cancel-delete-category').addEventListener('click', () => {
    closeModal(modaleSuppression);
    aSupprimer = null;
  });

  return { charger, dessiner };
};
