/* ---------------------------------------------------------------------------
   Cahier — reporter une tâche : à quelle date elle glisse. Module pur, horloge
   injectée, pour que le calcul se teste sans fenêtre ni serveur.
   --------------------------------------------------------------------------- */

// une tâche sans heure reçoit la matinée, comme dans la saisie rapide
const HEURE_PAR_DEFAUT = 9;

const minuit = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Nouvelle échéance d'une tâche reportée.
 *
 * Le report part du plus tard entre aujourd'hui et l'échéance actuelle :
 * reporter ne doit jamais avancer une tâche. L'heure est gardée — un
 * rendez-vous à 14h30 reste à 14h30.
 *
 * @param {string|null} echeance échéance actuelle (ISO), ou null
 * @param {'demain'|'semaine'} cible au lendemain, ou au lundi qui suit
 * @param {Date} [now]
 * @returns {string|null} la nouvelle échéance (ISO), ou null si la cible est inconnue
 */
export function reporter(echeance, cible, now = new Date()) {
  const actuelle = echeance ? new Date(echeance) : null;
  const depart = new Date(Math.max(minuit(now), actuelle ? minuit(actuelle) : 0));

  if (cible === 'demain') {
    depart.setDate(depart.getDate() + 1);
  } else if (cible === 'semaine') {
    // lundi strictement après le départ : un lundi vise le lundi suivant
    depart.setDate(depart.getDate() + ((8 - depart.getDay()) % 7 || 7));
  } else {
    return null;
  }

  depart.setHours(
    actuelle ? actuelle.getHours() : HEURE_PAR_DEFAUT,
    actuelle ? actuelle.getMinutes() : 0,
    0,
    0
  );
  return depart.toISOString();
}
