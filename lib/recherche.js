/* ---------------------------------------------------------------------------
   Cahier — recherche dans les étapes. La liste ne montre que les racines ;
   une étape qui répond à la recherche fait donc remonter son dossier, en
   disant laquelle a répondu. Le modèle est injecté, pour que la logique se
   teste sans base.
   --------------------------------------------------------------------------- */

// une recherche ne dessine qu'une page : au-delà, ce ne serait plus une
// recherche mais un inventaire, et la requête doit rester bornée
const MAX_ETAPES = 500;

/**
 * Les étapes vivantes qui répondent à `aiguille`, rangées par dossier.
 * @param {RegExp} aiguille le terme, déjà échappé
 * @param {{find: Function}} Task le modèle Mongoose
 * @returns {Promise<Map<string, string[]>>} identifiant du dossier → titres des étapes
 */
async function etapesTrouvees(aiguille, Task) {
  const etapes = await Task.find({
    parentId: { $ne: null },
    deletedAt: null,
    $or: [{ title: aiguille }, { description: aiguille }],
  })
    .select('parentId title')
    .sort({ order: 1, createdAt: 1 })
    .limit(MAX_ETAPES)
    .lean();

  return etapes.reduce((parDossier, { parentId, title }) => {
    const cle = String(parentId);
    return new Map(parDossier).set(cle, [...(parDossier.get(cle) || []), title]);
  }, new Map());
}

/**
 * Pose `matchedSteps` sur les dossiers qui ne répondent QUE par leurs étapes :
 * un dossier trouvé par son propre titre n'a rien à justifier.
 * @param {object[]} taches la page de racines
 * @param {Map<string, string[]>} parDossier
 * @param {RegExp} aiguille
 */
function annoterEtapes(taches, parDossier, aiguille) {
  return taches.map((t) => {
    const titres = parDossier.get(String(t._id));
    const parLuiMeme = aiguille.test(t.title) || aiguille.test(t.description || '');
    return titres && !parLuiMeme ? { ...t, matchedSteps: titres } : t;
  });
}

module.exports = { etapesTrouvees, annoterEtapes, MAX_ETAPES };
