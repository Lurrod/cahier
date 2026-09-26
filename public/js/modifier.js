/* ---------------------------------------------------------------------------
   Cahier — la fenêtre « Modifier » : ouvrir une tâche, l'enregistrer, ou en
   faire une copie.

   Elle retient elle-même la tâche ouverte : aucune autre partie de la page
   n'a besoin de le savoir. Sortie d'app.js, qui dépassait la taille que se
   donne le projet.
   --------------------------------------------------------------------------- */

import { closeModal, openModal } from './modal.js';
import { lierAEcheance, recurrenceModifiee } from './serie.js';
import { $, toIso, toLocalDatetimeInput } from './util.js';

/**
 * @param {{
 *   getTask: (id: string) => object|undefined,
 *   updateTask: (id: string, patch: object) => Promise<object>,
 *   refresh: (options?: object) => Promise<void>,
 *   toast: Function,
 *   dupliquerTache: (task: object) => Promise<void>,
 * }} deps
 * @returns {{ouvrir: (task: object) => void}}
 */
export const initModifier = ({ getTask, updateTask, refresh, toast, dupliquerTache }) => {
  const modale = $('edit-modal');
  const titre = $('edit-title');
  const notes = $('edit-desc');
  const echeance = $('edit-due-date');
  const categorie = $('edit-category');
  const priorite = $('edit-priority');
  const recurrence = $('edit-recurrence');
  const rappel = $('edit-reminder');

  const synchroniser = lierAEcheance(echeance, [recurrence, rappel]);

  /** L'identifiant de la tâche ouverte, relu dans la liste au moment d'agir. */
  let ouverte = null;

  const ouvrir = (task) => {
    ouverte = task._id;
    titre.value = task.title || '';
    notes.value = task.description || '';
    echeance.value = toLocalDatetimeInput(task.dueDate);
    categorie.value = task.category || '';
    priorite.value = task.priority || '';
    recurrence.value = task.recurrence?.freq || '';
    rappel.value = task.reminder?.offset || '';
    synchroniser();
    openModal(modale);
  };

  $('save-edit').addEventListener('click', async () => {
    if (!ouverte) return;
    const actuelle = getTask(ouverte);
    try {
      await updateTask(ouverte, {
        title: titre.value.trim(),
        description: notes.value.trim(),
        dueDate: toIso(echeance.value),
        category: categorie.value,
        priority: priorite.value,
        recurrence: recurrenceModifiee(recurrence.value, actuelle?.recurrence),
        reminder: { offset: rappel.value },
      });
      closeModal(modale);
      await refresh();
      toast('Tâche modifiée.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('close-modal').addEventListener('click', () => closeModal(modale));

  /** Copie de la tâche ouverte : on ferme d'abord, la copie paraît dans la liste. */
  $('duplicate-edit').addEventListener('click', () => {
    const task = getTask(ouverte);
    closeModal(modale);
    if (task) dupliquerTache(task);
  });

  return { ouvrir };
};
