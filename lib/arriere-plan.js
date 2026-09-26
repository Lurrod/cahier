/* ---------------------------------------------------------------------------
   Cahier — l'arrière-plan : fermer la fenêtre ne ferme plus le Cahier.

   Un rappel ne part que tant que le serveur tourne, et il tourne dans le
   processus de la fenêtre. Quitter à la fermeture, c'était donc taire les
   rappels dès qu'on rangeait l'application — exactement quand on compte sur
   eux. La fenêtre se range désormais dans la zone de notification, d'où elle
   se rouvre ; « Quitter » y quitte pour de bon.

   Tout ce qui vient d'Electron est reçu en argument, comme dans updates.js :
   les tests n'ouvrent ni fenêtre ni icône.
   --------------------------------------------------------------------------- */

/** L'argument d'un lancement par l'ouverture de session : démarrer caché. */
const ARG_CACHE = '--cache';

/** @param {string[]} argv */
const demarreCache = (argv) => argv.includes(ARG_CACHE);

/**
 * Ce qu'on passe à `app.setLoginItemSettings`.
 * @param {boolean} actif
 */
const reglageDemarrage = (actif) => ({
  openAtLogin: Boolean(actif),
  args: actif ? [ARG_CACHE] : [],
});

/**
 * @param {object} deps
 * @param {object} deps.app l'`app` d'Electron
 * @param {Function} deps.Tray
 * @param {{buildFromTemplate: Function}} deps.Menu
 * @param {string} deps.icone chemin de l'image de l'icône
 * @param {boolean} deps.enPaquet `app.isPackaged`
 * @param {() => void} deps.montrer rouvre et met au premier plan la fenêtre
 */
const creerArrierePlan = ({ app, Tray, Menu, icone, enPaquet, montrer }) => {
  // par défaut, on garde : c'est ce qui fait sonner les rappels
  let garder = true;
  let quitter = false;
  let zone = null;

  // tout départ passe par ici — le menu, mais aussi la pose d'une mise à
  // jour : après, plus aucune fermeture ne doit être retenue
  app.on('before-quit', () => {
    quitter = true;
  });

  /**
   * Lève la garde sans quitter. Pour la pose d'une mise à jour : l'ordre de
   * `before-quit` par rapport à la fermeture de la fenêtre n'y est pas
   * garanti, et une fenêtre retenue à ce moment bloquerait l'installation.
   */
  const autoriserDepart = () => {
    quitter = true;
  };

  const quitterPourDeBon = () => {
    autoriserDepart();
    app.quit();
  };

  const poserZone = () => {
    if (zone) return;
    zone = new Tray(icone);
    zone.setToolTip('Cahier');
    zone.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir le Cahier', click: montrer },
        { type: 'separator' },
        { label: 'Quitter', click: quitterPourDeBon },
      ])
    );
    zone.on('click', montrer);
  };

  const retirerZone = () => {
    zone?.destroy();
    zone = null;
  };

  /**
   * Suit les réglages, au lancement puis à chaque changement.
   * @param {{arrierePlan?: {garder?: boolean, demarrage?: boolean}}|null} preferences
   */
  const appliquer = (preferences) => {
    const reglage = preferences?.arrierePlan || {};
    garder = reglage.garder !== false;
    if (garder) poserZone();
    else retirerZone();

    // en développement, l'exécutable est electron.exe : l'inscrire lancerait
    // Electron nu à chaque ouverture de session
    if (enPaquet) app.setLoginItemSettings(reglageDemarrage(reglage.demarrage === true));
  };

  /** À brancher sur l'événement `close` de la fenêtre. */
  const surFermeture = (event, fenetre) => {
    if (quitter || !garder) return;
    event.preventDefault();
    fenetre.hide();
  };

  /**
   * Faut-il ouvrir sans montrer la fenêtre ? Seulement s'il y a une icône pour
   * la retrouver : sinon, ce serait une application invisible.
   */
  const demarrerCache = (argv) => garder && demarreCache(argv);

  return { appliquer, surFermeture, demarrerCache, autoriserDepart, quitter: quitterPourDeBon };
};

module.exports = { ARG_CACHE, creerArrierePlan, demarreCache, reglageDemarrage };
