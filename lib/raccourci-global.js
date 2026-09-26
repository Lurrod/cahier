/* ---------------------------------------------------------------------------
   Cahier — la saisie rapide de partout : Ctrl+Alt+N, depuis n'importe quelle
   application, ramène le Cahier le curseur dans la saisie.

   Une idée qui passe se note en deux secondes, ou se perd. Avec le Cahier
   rangé dans la zone de notification, il fallait jusqu'ici le retrouver,
   l'ouvrir, cliquer dans le champ.

   `globalShortcut` est reçu en argument : les tests ne réservent aucune touche
   du poste.
   --------------------------------------------------------------------------- */

const ACCELERATEUR = 'CommandOrControl+Alt+N';

/**
 * @param {object} deps
 * @param {{register: Function, unregister: Function}} deps.globalShortcut
 * @param {() => void} deps.declencher ramène le Cahier sur la saisie
 * @param {{warn: Function}} [deps.journal]
 */
const creerRaccourciGlobal = ({ globalShortcut, declencher, journal = console }) => {
  let actif = false;

  const liberer = () => {
    if (!actif) return;
    globalShortcut.unregister(ACCELERATEUR);
    actif = false;
  };

  /**
   * Suit le réglage, au lancement puis à chaque changement. Une combinaison
   * refusée sera redemandée au prochain enregistrement des réglages.
   * @param {{arrierePlan?: {raccourciGlobal?: boolean}}|null} preferences
   */
  const appliquer = (preferences) => {
    const voulu = preferences?.arrierePlan?.raccourciGlobal !== false;
    if (!voulu) {
      liberer();
      return;
    }
    if (actif) return;

    actif = globalShortcut.register(ACCELERATEUR, declencher);
    if (!actif) {
      // une autre application l'a réservé avant nous : pas une panne, un
      // raccourci que le Cahier n'aura pas
      journal.warn(`Raccourci ${ACCELERATEUR} : combinaison déjà prise par une autre application.`);
    }
  };

  return { appliquer, liberer, actif: () => actif };
};

module.exports = { ACCELERATEUR, creerRaccourciGlobal };
