/* ---------------------------------------------------------------------------
   Cahier — le composeur : la saisie d'une tâche, avec la saisie rapide lue à
   la volée (`Dentiste demain 14h #Santé !haute`) et son aperçu.

   Sorti d'app.js, qui dépassait la taille que se donne le projet. Tout ce qu'il
   ne détient pas — catégories connues, création, rechargement, notes — lui
   est injecté.
   --------------------------------------------------------------------------- */

import { parseQuickEntry } from './parse.js';
import { lierAEcheance } from './serie.js';
import { $, escapeHtml, formatDate, toIso } from './util.js';

/**
 * @param {{
 *   getCategories: () => Array<{name: string}>,
 *   createTask: (task: object) => Promise<object>,
 *   refresh: (options?: object) => Promise<void>,
 *   toast: Function,
 * }} deps
 */
export const initComposeur = ({ getCategories, createTask, refresh, toast }) => {
  const formulaire = $('task-form');
  const titre = $('task-title');
  const apercu = $('quick-preview');
  const notes = $('task-desc');
  const echeance = $('task-due-date');
  const categorie = $('task-category');
  const priorite = $('task-priority');
  const recurrence = $('task-recurrence');
  const rappel = $('task-reminder');

  /** Ce que le texte du champ titre contient en plus du titre lui-même. */
  const lireTitre = () =>
    parseQuickEntry(titre.value, { categories: getCategories().map((c) => c.name) });

  // dernier aperçu rendu : réécrire une zone aria-live à chaque frappe la ferait
  // crier pour rien
  let dernierApercu = '';

  /** L'aperçu rend l'interprétation réfutable avant l'envoi. */
  const dessinerApercu = () => {
    const { tokens, dueDate } = lireTitre();
    const pastilles = tokens.map(
      ({ type, text }) =>
        `<span class="chip" data-type="${escapeHtml(type)}">${escapeHtml(text)}</span>`
    );

    // « 8h » ne dit pas si l'échéance tombe aujourd'hui ou demain : la date
    // résolue, elle, le dit — et c'est elle qui sera envoyée
    const resolue = formatDate(dueDate);
    if (resolue) {
      pastilles.push(`<span class="chip" data-type="resolved">→ ${escapeHtml(resolue)}</span>`);
    }

    const html = pastilles.join('');
    if (html === dernierApercu) return;
    dernierApercu = html;
    apercu.innerHTML = html;
    apercu.hidden = pastilles.length === 0;
  };

  titre.addEventListener('input', dessinerApercu);

  const synchroniser = lierAEcheance(echeance, [recurrence, rappel]);

  /** Vide le composeur sans toucher au tri, qui vit dans le même <form>. */
  const vider = () => {
    titre.value = '';
    notes.value = '';
    echeance.value = '';
    categorie.value = '';
    priorite.value = '';
    recurrence.value = '';
    rappel.value = '';
    synchroniser();
  };

  /**
   * La récurrence à envoyer : le menu l'emporte, comme pour les autres champs,
   * sinon ce que le titre a laissé lire (« tous les mardis »).
   */
  const recurrenceAEnvoyer = (lu) => {
    if (recurrence.value) return { freq: recurrence.value, interval: 1, until: null };
    return lu.recurrence ? { ...lu.recurrence, until: null } : undefined;
  };

  formulaire.addEventListener('submit', async (e) => {
    e.preventDefault();
    const lu = lireTitre();
    if (!lu.title) {
      // le champ n'est pas vide à l'écran : ne rien faire du tout serait un bug
      // du point de vue de l'utilisateur
      if (titre.value.trim()) toast('Il faut un titre en plus des étiquettes.', 'error');
      titre.focus();
      return;
    }

    try {
      await createTask({
        title: lu.title,
        description: notes.value.trim(),
        // un choix fait à la souris l'emporte sur ce que le texte laisse deviner
        dueDate: toIso(echeance.value) || lu.dueDate,
        category: categorie.value || lu.category,
        priority: priorite.value || lu.priority,
        tags: lu.tags,
        recurrence: recurrenceAEnvoyer(lu),
        reminder: rappel.value ? { offset: rappel.value } : undefined,
      });
      vider();
      dessinerApercu();
      await refresh({ page: 1 });
      toast('Tâche ajoutée.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
};
