/* ---------------------------------------------------------------------------
   Cahier — replanifier en bloc : chaque tâche reçoit sa propre échéance.
   Les dates arrivent calculées ; ce module les valide et les pose. Le modèle
   et le calcul du rappel sont injectés, pour qu'il se teste sans base.
   --------------------------------------------------------------------------- */

// même borne que les actions groupées : au-delà, c'est un traitement de masse
const MAX_ITEMS = 100;

// un ObjectId en chaîne, et rien d'autre : `{"$ne": null}` à la place d'un
// identifiant serait un opérateur Mongo fourni par le client
const RE_ID = /^[a-f0-9]{24}$/i;

const dateLisible = (valeur) =>
  typeof valeur === 'string' && !Number.isNaN(new Date(valeur).getTime());

/**
 * Valide le corps reçu.
 * @param {unknown} brut
 * @returns {{items: Array<{id: string, dueDate: Date}>}|{erreur: string}}
 */
function lireReplanification(brut) {
  if (!Array.isArray(brut)) return { erreur: 'Champ « items » invalide : un tableau est attendu.' };
  if (brut.length > MAX_ITEMS) {
    return { erreur: `Trop de tâches : ${brut.length} pour un maximum de ${MAX_ITEMS}.` };
  }
  // une échéance retirée n'est pas un report : elle couperait une série
  // récurrente de son ancrage, et c'est à « Modifier » de le faire, en le disant
  const valides = brut.every(
    (item) => typeof item?.id === 'string' && RE_ID.test(item.id) && dateLisible(item.dueDate)
  );
  if (!valides) return { erreur: 'Chaque élément veut un identifiant et une échéance lisible.' };
  return { items: brut.map(({ id, dueDate }) => ({ id, dueDate: new Date(dueDate) })) };
}

/**
 * Pose les nouvelles échéances et recalcule chaque rappel.
 * @param {Array<{id: string, dueDate: Date}>} items
 * @param {{Task: object, poserHeureDeRappel: Function}} deps
 * @returns {Promise<number>} le nombre de tâches modifiées
 */
async function replanifier(items, { Task, poserHeureDeRappel }) {
  if (items.length === 0) return 0;
  const cible = new Map(items.map(({ id, dueDate }) => [id, dueDate]));

  const avant = await Task.find({ _id: { $in: [...cible.keys()] }, deletedAt: null }).lean();
  if (avant.length === 0) return 0;

  const ecritures = avant.map((tache) => {
    const dueDate = cible.get(String(tache._id));
    return {
      updateOne: {
        filter: { _id: tache._id, deletedAt: null },
        update: {
          $set: { dueDate, reminder: poserHeureDeRappel({ ...tache, dueDate }, tache) },
        },
      },
    };
  });

  const { modifiedCount } = await Task.bulkWrite(ecritures);
  return modifiedCount;
}

module.exports = { lireReplanification, replanifier, MAX_ITEMS };
