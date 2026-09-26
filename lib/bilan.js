/* ---------------------------------------------------------------------------
   Cahier — le bilan : ce qui a été rayé, et quand.

   Le Cahier savait combien de tâches étaient rayées, jamais quand. Ce module
   décide de la date de fin d'une tâche et range ces dates en jours. Il ne
   touche pas à la base : le serveur lui passe les dates, il rend des comptes.

   Les jours sont ceux du poste, pas des jours UTC : le serveur tourne sur la
   machine de l'utilisateur, et « aujourd'hui » doit s'arrêter à son minuit.
   --------------------------------------------------------------------------- */

/** La fenêtre du bilan, aujourd'hui compris. */
const JOURS = 7;

const minuit = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * La date de fin à écrire quand `completed` est posé sur une tâche.
 *
 * @param {{completed?: boolean, completedAt?: Date|null}} avant la tâche en base
 * @param {boolean} completed ce qui est demandé
 * @param {Date} maintenant
 * @returns {Date|null}
 */
const dateDeFin = (avant, completed, maintenant) => {
  if (!completed) return null;
  // une tâche déjà rayée garde sa date : « Modifier » renvoie completed: true
  // tel quel, et corriger un titre ne refait pas le travail
  if (avant?.completed && avant.completedAt) return avant.completedAt;
  return maintenant;
};

/** Minuit du premier jour de la fenêtre. */
const debutDuBilan = (maintenant) => {
  const debut = minuit(maintenant);
  debut.setDate(debut.getDate() - (JOURS - 1));
  return debut;
};

/**
 * Range des dates de fin en jours.
 *
 * @param {Array<Date|string|null>} dates
 * @param {Date} maintenant
 * @returns {Array<{jour: Date, n: number}>} du plus ancien à aujourd'hui
 */
const semaine = (dates, maintenant) => {
  const debut = debutDuBilan(maintenant);
  const jours = Array.from({ length: JOURS }, (_, i) => {
    const jour = new Date(debut);
    jour.setDate(debut.getDate() + i);
    return jour;
  });

  const comptes = new Array(JOURS).fill(0);
  dates.forEach((brute) => {
    if (!brute) return;
    const date = new Date(brute);
    if (Number.isNaN(date.getTime())) return;
    const index = jours.findIndex((j) => j.getTime() === minuit(date).getTime());
    if (index !== -1) comptes[index] += 1;
  });

  return jours.map((jour, i) => ({ jour, n: comptes[i] }));
};

module.exports = { JOURS, dateDeFin, debutDuBilan, semaine };
