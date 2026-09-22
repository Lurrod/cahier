/* ---------------------------------------------------------------------------
   Récurrence et rappel suivent l'échéance : sans date, ni l'une ni l'autre n'a
   de sens, et le serveur refuserait l'enregistrement entier. Le composeur et
   la fenêtre « Modifier » obéissent à la même règle — elle vit donc ici, une
   seule fois.
   --------------------------------------------------------------------------- */

const SANS_SERIE = { freq: '', interval: 1, until: null };

/**
 * Verrouille et vide `champs` tant que `echeance` est vide.
 * @param {HTMLInputElement} echeance le champ de date
 * @param {HTMLSelectElement[]} champs ce qui en dépend
 * @returns {() => void} à rappeler quand la date change par programme
 */
export function lierAEcheance(echeance, champs) {
  const synchroniser = () => {
    const avecDate = echeance.value !== '';
    champs.forEach((champ) => {
      champ.disabled = !avecDate;
      if (!avecDate) champ.value = '';
    });
  };
  echeance.addEventListener('input', synchroniser);
  synchroniser();
  return synchroniser;
}

/**
 * La récurrence à enregistrer depuis la fenêtre « Modifier ».
 *
 * Le menu ne connaît que la fréquence. Si elle n'a pas bougé, l'intervalle et
 * la fin de série déjà posés sont gardés tels quels : corriger une faute dans
 * le titre ne doit pas ramener « toutes les 2 semaines » à « chaque semaine ».
 *
 * @param {string} freq la fréquence choisie ('' pour aucune)
 * @param {{freq: string, interval: number, until: string|null}|undefined} avant
 */
export function recurrenceModifiee(freq, avant) {
  if (!freq) return { ...SANS_SERIE };
  if (avant?.freq === freq) {
    return { freq, interval: avant.interval ?? 1, until: avant.until ?? null };
  }
  return { ...SANS_SERIE, freq };
}
