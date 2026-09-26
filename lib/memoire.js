/* ---------------------------------------------------------------------------
   Cahier — ce que le Cahier retient pour lui-même d'un lancement à l'autre.

   Pas des réglages — l'utilisateur ne les choisit pas, et le document des
   réglages jette à chaque écriture toute clé que son schéma ignore. Une
   collection à part, clé → valeur, pour les petits états de fonctionnement :
   le jour du dernier point du matin, par exemple.
   --------------------------------------------------------------------------- */

/**
 * @param {import('mongoose')} mongoose injecté : ce module ne se connecte à rien
 * @returns {{lire: (cle: string) => Promise<any>, ecrire: (cle: string, valeur: any) => Promise<void>}}
 */
const creerMemoire = (mongoose) => {
  const schema = new mongoose.Schema({
    cle: { type: String, required: true, unique: true },
    valeur: { type: mongoose.Schema.Types.Mixed, default: null },
  });

  // le module est rechargé d'un test à l'autre ; redéclarer un modèle déjà
  // enregistré lève une OverwriteModelError
  const Modele = mongoose.models.Memoire || mongoose.model('Memoire', schema);

  const lire = async (cle) => (await Modele.findOne({ cle }).lean())?.valeur ?? null;

  const ecrire = async (cle, valeur) => {
    await Modele.updateOne({ cle }, { $set: { valeur } }, { upsert: true });
  };

  return { lire, ecrire };
};

module.exports = { creerMemoire };
