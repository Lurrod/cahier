/* ---------------------------------------------------------------------------
   Cahier — le bandeau de mise à jour.

   Il ne s'ouvre que sur une version déjà téléchargée, prête à se poser : la
   recherche et le téléchargement se font en fond, sans rien dire. Le Cahier ne
   coupe jamais la parole à quelqu'un qui écrit.

   Tout ce que ce module ne peut pas faire seul lui est injecté — interroger le
   serveur, agir sur la mise à jour, lire la préférence, battre la mesure. Les
   tests n'ouvrent donc aucune connexion et ne dorment jamais.
   --------------------------------------------------------------------------- */

import { sketchAll, unsketchAll } from './sketch.js';
import { $ } from './util.js';

/** Une minute : assez pour ne rien manquer, assez peu pour ne rien coûter. */
const INTERVALLE_MS = 60_000;

/**
 * Quand quelque chose bouge, ou que quelqu'un regarde : une minute entre deux
 * lectures, c'était une progression qui sautait de 0 à 100 %, et une version
 * prête annoncée jusqu'à une minute en retard.
 */
const INTERVALLE_RAPIDE_MS = 1500;

/** Les étapes où l'état change d'une seconde à l'autre. */
const EN_MOUVEMENT = ['recherche', 'telechargement'];

/** Les seules étapes qui méritent d'interrompre la page. */
const PARLANTES = ['prete', 'echec'];

/**
 * @param {object} deps
 * @param {() => Promise<object>} deps.lireSysteme `GET /systeme`
 * @param {(quoi: 'chercher'|'installer'|'reporter') => Promise<object>} deps.agir
 * @param {() => boolean} deps.prevenir la préférence « prévenir quand une
 *   version est prête », lue à chaque fois : elle peut changer en cours de route
 * @param {(message: string, variante?: string) => void} deps.toast
 * @param {{poser: Function, retirer: Function}} [deps.minuteur]
 * @param {number} [deps.intervalleMs]
 * @param {() => boolean} [deps.regarde] vrai quand la page Réglages est à
 *   l'écran : relu à chaque battement, car rien ne prévient d'une fermeture
 *   par Échap ou d'un clic à côté
 * @returns {{rafraichir: () => Promise<object|null>, dernier: () => object|null, surEtat: Function}}
 */
export const initMisesAJour = ({
  lireSysteme,
  agir,
  prevenir,
  toast,
  // `{ poser: setInterval }` a l'air équivalent et ne l'est pas : appelée
  // comme méthode d'un objet ordinaire, `setInterval` reçoit cet objet pour
  // `this` et Chromium refuse — « Illegal invocation ». L'exception remontait
  // jusqu'au corps de `app.js`, qui cessait de s'évaluer. D'où les fonctions
  // qui enveloppent, et qui appellent la fenêtre comme elle veut l'être.
  minuteur = {
    poser: (rappel, ms) => setInterval(rappel, ms),
    retirer: (id) => clearInterval(id),
  },
  intervalleMs = INTERVALLE_MS,
  regarde = () => false,
}) => {
  const bandeau = $('maj-banner');
  const titre = $('maj-title');
  const detail = $('maj-detail');
  const boutonInstaller = $('maj-install');
  const boutonPlusTard = $('maj-later');

  /** Dernier état lu, partagé avec la page Réglages pour ne pas demander deux fois. */
  let dernierEtat = null;
  let battement = null;
  let cadence = null;
  const abonnes = [];

  /** Chaque lecture, à qui suit l'état — la page Réglages. */
  const annoncer = (systeme) =>
    abonnes.forEach((abonne) => {
      try {
        abonne(systeme);
      } catch {
        // un abonné en panne ne doit priver ni le bandeau ni les autres
      }
    });
  /** Ce que l'utilisateur a rangé à la main ne doit pas revenir au battement suivant. */
  let rangeALaMain = false;

  const ranger = () => {
    if (bandeau.hidden) return;
    unsketchAll(bandeau);
    bandeau.hidden = true;
  };

  const montrer = (titreTexte, detailTexte, { avecInstallation }) => {
    titre.textContent = titreTexte;
    detail.textContent = detailTexte;
    boutonInstaller.hidden = !avecInstallation;

    if (bandeau.hidden) {
      bandeau.hidden = false;
      // les traits se mesurent à l'attache : rien à dessiner tant que le
      // bandeau est caché, tout à dessiner dès qu'il paraît
      sketchAll(bandeau);
    }
  };

  const arreter = () => {
    if (battement === null) return;
    minuteur.retirer(battement);
    battement = null;
    cadence = null;
  };

  /** Bat vite si quelque chose bouge ou si quelqu'un regarde, lentement sinon. */
  const recadrer = (etape) => {
    const voulue = EN_MOUVEMENT.includes(etape) || regarde() ? INTERVALLE_RAPIDE_MS : intervalleMs;
    if (voulue === cadence) return;
    arreter();
    cadence = voulue;
    battement = minuteur.poser(rafraichir, voulue);
  };

  /** Ce que le bandeau dit de chaque étape. Le silence est la règle. */
  const rendre = (maj) => {
    if (rangeALaMain || !prevenir() || !PARLANTES.includes(maj.etape)) return ranger();

    if (maj.etape === 'echec') {
      // proposer « Redémarrer » après un redémarrage impossible serait une
      // impasse : la version se posera d'elle-même à la fermeture
      return montrer('Le Cahier n’a pas pu redémarrer.', maj.message || '', {
        avecInstallation: false,
      });
    }

    const version = maj.version ? `La version ${maj.version} est prête.` : 'Une version est prête.';
    return montrer(version, 'Elle se posera à la fermeture si tu préfères finir d’abord.', {
      avecInstallation: true,
    });
  };

  /**
   * Va lire l'état du serveur.
   * @returns {Promise<object|null>} null quand le serveur n'a pas répondu —
   *   une panne ne doit rien faire apparaître : le Cahier s'utilise hors ligne
   */
  const rafraichir = async () => {
    try {
      const systeme = await lireSysteme();
      dernierEtat = systeme;

      // dans un navigateur ou en développement, il n'y aura jamais de mise à
      // jour : continuer à demander toutes les minutes serait du bruit. Une
      // réponse sans état — serveur plus ancien, réponse tronquée — se traite
      // pareil : on ne devine pas ce qu'on n'a pas reçu.
      if (!systeme?.maj || systeme.maj.etape === 'inactive') {
        arreter();
        ranger();
        annoncer(systeme);
        return systeme;
      }

      rendre(systeme.maj);
      annoncer(systeme);
      recadrer(systeme.maj.etape);
      return systeme;
    } catch {
      return null;
    }
  };

  const demander = async (quoi) => {
    try {
      dernierEtat = await agir(quoi);
      annoncer(dernierEtat);
      // « Chercher » ouvre une recherche : la suivre de près sans attendre
      if (dernierEtat?.maj) recadrer(dernierEtat.maj.etape);
    } catch (erreur) {
      toast(erreur.message, 'error');
    }
  };

  boutonPlusTard.addEventListener('click', async () => {
    rangeALaMain = true;
    ranger();
    // sans le dire au serveur, le bandeau reviendrait au prochain battement
    await demander('reporter');
  });

  boutonInstaller.addEventListener('click', async () => {
    titre.textContent = 'Fermeture du Cahier…';
    await demander('installer');
    // encore là, c'est que la pose a échoué : le dire maintenant, et non au
    // battement suivant — une minute à annoncer une fermeture qui n'aura pas
    // lieu, c'est une minute à passer pour cassé
    if (dernierEtat?.maj) rendre(dernierEtat.maj);
  });

  cadence = intervalleMs;
  battement = minuteur.poser(rafraichir, intervalleMs);

  /** @returns {() => void} de quoi se désabonner */
  const surEtat = (abonne) => {
    abonnes.push(abonne);
    return () => abonnes.splice(abonnes.indexOf(abonne), 1);
  };

  return { rafraichir, arreter, dernier: () => dernierEtat, surEtat, agir: demander };
};
