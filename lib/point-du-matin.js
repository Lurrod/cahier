/* ---------------------------------------------------------------------------
   Cahier — le point du matin : une notification, une fois par jour, qui dit
   ce qui attend.

   Il n'a de sens que parce que le Cahier vit désormais dans la zone de
   notification : c'est lui qui vient à l'utilisateur, au lieu d'attendre
   qu'on l'ouvre. Désactivé tant qu'on ne l'a pas demandé.

   Le jour du dernier point vit en base, pas en mémoire : un Cahier relancé à
   10 h ne doit pas redire ce qu'il a dit à 9 h. Tout est injecté — la base,
   l'horloge, l'émetteur — pour que les tests n'affichent rien.
   --------------------------------------------------------------------------- */

/** La clé sous laquelle la mémoire retient le jour du dernier point. */
const CLE_MEMOIRE = 'pointDuMatin.dernier';

/** Passé midi, ce n'est plus le matin. */
const FIN_DU_MATIN = 12;

const deux = (n) => String(n).padStart(2, '0');

/** `2026-09-26` : le jour du poste, pas le jour UTC. */
const jourLocal = (date) =>
  `${date.getFullYear()}-${deux(date.getMonth() + 1)}-${deux(date.getDate())}`;

/**
 * @param {{maintenant: Date, heure: string, dernier: string|null}} etat
 *   `heure` est le réglage : '' pour désactivé, sinon l'heure en chaîne
 */
const doitEnvoyer = ({ maintenant, heure, dernier }) => {
  const h = Number.parseInt(heure, 10);
  if (!Number.isInteger(h)) return false;
  if (dernier === jourLocal(maintenant)) return false;
  const actuelle = maintenant.getHours();
  return actuelle >= h && actuelle < FIN_DU_MATIN;
};

const compte = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`;

/**
 * @param {{aujourdhui: number, retard: number, journee: number}} comptes
 * @returns {{title: string, message: string}|null} null s'il n'y a rien à dire
 */
const messageDuPoint = ({ aujourdhui = 0, retard = 0, journee = 0 }) => {
  const parties = [
    aujourdhui > 0 && compte(aujourdhui, 'tâche aujourd’hui', 'tâches aujourd’hui'),
    retard > 0 && `${retard} en retard`,
    journee > 0 && `${journee} dans ma journée`,
  ].filter(Boolean);

  // une notification pour dire qu'il n'y a rien serait du bruit, tous les jours
  if (parties.length === 0) return null;
  return { title: 'Le point du matin', message: parties.join(' · ') };
};

/**
 * Envoie le point s'il est temps. Appelé à chaque balayage, soit chaque minute.
 *
 * @param {object} deps
 * @param {() => Promise<string>} deps.lireHeure le réglage, relu à chaque fois
 * @param {() => Promise<{aujourdhui: number, retard: number, journee: number}>} deps.compter
 * @param {{lire: (cle: string) => Promise<any>, ecrire: (cle: string, valeur: any) => Promise<void>}} deps.memoire
 * @param {(notification: {title: string, message: string}) => Promise<boolean>} deps.envoyer
 * @param {Date} [deps.maintenant]
 * @returns {Promise<boolean>} vrai si une notification est partie
 */
const envoyerLePoint = async ({
  lireHeure,
  compter,
  memoire,
  envoyer,
  maintenant = new Date(),
}) => {
  const heure = await lireHeure();
  const dernier = await memoire.lire(CLE_MEMOIRE);
  if (!doitEnvoyer({ maintenant, heure, dernier })) return false;

  const message = messageDuPoint(await compter());
  // rien à dire : le jour est retenu quand même, sans quoi on recompterait
  // chaque minute jusqu'à midi
  if (message && !(await envoyer(message))) {
    // un envoi raté n'est pas un point donné : la minute suivante réessaiera
    return false;
  }

  await memoire.ecrire(CLE_MEMOIRE, jourLocal(maintenant));
  return Boolean(message);
};

module.exports = { CLE_MEMOIRE, jourLocal, doitEnvoyer, messageDuPoint, envoyerLePoint };
