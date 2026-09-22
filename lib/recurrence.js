/* ---------------------------------------------------------------------------
   Cahier — récurrence : à quelle date revient une tâche qu'on vient de cocher.
   Fonction pure, sans base ni horloge : la date de départ est toujours donnée.
   --------------------------------------------------------------------------- */

const FREQUENCES = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

/** Nombre de jours du mois visé, pour ne pas déborder sur le suivant. */
const dernierJourDuMois = (annee, mois) => new Date(annee, mois + 1, 0).getDate();

const estWeekEnd = (date) => date.getDay() === 0 || date.getDay() === 6;

/**
 * Avance de `mois` mois en gardant le quantième. `setMonth` déborde en
 * silence : le 31 janvier + 1 mois donnerait le 3 mars, le 29 février + 1 an
 * le 1er mars. On vise le mois, puis on rabat le quantième sur sa fin.
 */
const avancerDeMois = (date, mois) => {
  const quantieme = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + mois);
  date.setDate(Math.min(quantieme, dernierJourDuMois(date.getFullYear(), date.getMonth())));
};

/**
 * Échéance suivante d'une tâche récurrente.
 *
 * Le calcul part de l'échéance **précédente**, jamais de la date de
 * complétion : sinon une hebdomadaire cochée avec trois jours de retard
 * replanifierait sur le vendredi, et « tous les mardis » dériverait à chaque
 * retard.
 *
 * @param {Date|string|null} depart échéance de l'occurrence qu'on vient de cocher
 * @param {{freq: string, interval: number, until: Date|string|null}} recurrence
 * @returns {Date|null} la date suivante, ou null s'il n'y a pas de suite
 *   (pas de récurrence, pas d'échéance de départ, fréquence inconnue, ou
 *   série arrivée au bout de `until`)
 */
const nextDueDate = (depart, recurrence) => {
  if (!depart || !recurrence || !FREQUENCES.includes(recurrence.freq)) return null;

  const pas = Math.max(1, Math.min(99, Number(recurrence.interval) || 1));
  const suite = new Date(depart);

  if (recurrence.freq === 'daily') {
    suite.setDate(suite.getDate() + pas);
  } else if (recurrence.freq === 'weekdays') {
    // on compte des jours ouvrés : « tous les 2 jours ouvrés » depuis un
    // jeudi tombe le lundi, pas le samedi
    for (let restant = pas; restant > 0;) {
      suite.setDate(suite.getDate() + 1);
      if (!estWeekEnd(suite)) restant -= 1;
    }
  } else if (recurrence.freq === 'weekly') {
    suite.setDate(suite.getDate() + 7 * pas);
  } else if (recurrence.freq === 'monthly') {
    avancerDeMois(suite, pas);
  } else {
    avancerDeMois(suite, 12 * pas);
  }

  if (recurrence.until && suite > new Date(recurrence.until)) return null;

  return suite;
};

module.exports = { FREQUENCES, nextDueDate };
