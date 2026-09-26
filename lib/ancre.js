/* ---------------------------------------------------------------------------
   Cahier — l'ancre que le processus principal pose sur l'adresse de la page.

   La page n'a aucun pont vers Electron, et c'est voulu. Pour qu'un clic sur
   une notification ouvre une tâche, ou que le raccourci global ouvre la
   saisie, le processus principal ne fait que changer l'ancre ; la page la lit
   (public/js/ancre.js) et agit. Les deux moitiés sont reliées par un test.
   --------------------------------------------------------------------------- */

const RE_ID = /^[a-f0-9]{24}$/i;
const VUES = ['today', 'overdue', 'myday'];

/**
 * @param {{tache?: string, vue?: string, saisir?: boolean}|null} cible
 * @returns {string|null} `#tache=…`, `#vue=…`, `#saisir`, ou null si la cible est invalide
 */
const ancrePour = (cible) => {
  if (cible?.tache && RE_ID.test(cible.tache)) return `#tache=${cible.tache}`;
  if (cible?.vue && VUES.includes(cible.vue)) return `#vue=${cible.vue}`;
  if (cible?.saisir) return '#saisir';
  return null;
};

module.exports = { VUES, ancrePour };
