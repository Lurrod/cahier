/* ---------------------------------------------------------------------------
   Cahier — processus principal Electron.

   Le serveur Express tourne DANS ce processus : le charger ici plutôt que de
   l'engendrer évite d'embarquer un second exécutable Node et de gérer sa mort.

   Deux choses doivent être posées avant de le charger, et c'est tout l'enjeu
   de ce fichier :
     — où écrire les données (l'archive de l'application est en lecture seule) ;
     — où trouver mongod (rien ne doit se télécharger au premier lancement).
   --------------------------------------------------------------------------- */

const {
  app,
  BrowserWindow,
  shell,
  dialog,
  Menu,
  Tray,
  Notification,
  globalShortcut,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const { configurerMisesAJour } = require('../lib/updates');
const { creerArrierePlan } = require('../lib/arriere-plan');
const { creerNotifieur } = require('../lib/notifieur');
const { creerRaccourciGlobal } = require('../lib/raccourci-global');
const { ancrePour } = require('../lib/ancre');
const { BINAIRE_CACHE } = require('../lib/mongod-version');

/**
 * Un profil de test : un dossier jetable à la place de %APPDATA%\Cahier.
 *
 * Posé par les tests de bout en bout, qui lancent l'application empaquetée.
 * Avant le verrou d'instance unique, qui se prend dans le dossier de profil :
 * sinon un Cahier installé et ouvert sur le poste ferait refuser le lancement.
 * Avec lui, rien ne sort du dossier — ni inscription au démarrage de Windows,
 * ni mise à jour tirée de GitHub.
 */
const PROFIL_DE_TEST = process.env.CAHIER_USER_DATA || null;
if (PROFIL_DE_TEST) app.setPath('userData', PROFIL_DE_TEST);

/** Une seule instance : deux processus ouvriraient la même base, et WiredTiger la verrouille. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const EN_PAQUET = app.isPackaged;

/**
 * Emplacement des données, posé explicitement.
 *
 * `setName` ne suffit pas : Electron dérive le dossier du champ `name` du
 * package (`cahier`) en application empaquetée, et de « Electron » en
 * développement. Trois noms pour la même application, donc trois bases. On le
 * nomme une bonne fois.
 */
app.setName('Cahier');
app.setPath('userData', PROFIL_DE_TEST || path.join(app.getPath('appData'), 'Cahier'));

/**
 * L'identité Windows du Cahier, celle de son raccourci d'installation. Sans
 * elle, une notification ne sait à qui rendre son clic.
 */
app.setAppUserModelId('fr.cahier.todo');

/**
 * Données de l'utilisateur, hors de l'application.
 * `%APPDATA%\Cahier\db` — conservé lors d'une mise à jour, contrairement à
 * tout ce qui vit à côté de l'exécutable.
 */
const DOSSIER_DONNEES = path.join(app.getPath('userData'), 'db');

/**
 * Le binaire Mongo, empaqueté à côté de l'application.
 *
 * Sans cette variable, mongodb-memory-server irait le télécharger au premier
 * lancement : cent mégaoctets par le réseau, sur une application censée
 * fonctionner hors ligne.
 */
const MONGOD = EN_PAQUET
  ? path.join(process.resourcesPath, 'mongod.exe')
  : path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-memory-server', BINAIRE_CACHE);

process.env.CAHIER_DATA_DIR = DOSSIER_DONNEES;
process.env.NODE_ENV = 'production';

/**
 * Les sauvegardes, à côté des données. Le serveur les poserait sinon à côté
 * de son propre fichier, donc dans l'archive asar : l'écriture y échoue, et
 * même hors archive, la mise à jour suivante effacerait le dossier.
 */
process.env.BACKUP_DIR = path.join(app.getPath('userData'), 'sauvegardes');

/**
 * mongodb-memory-server veut un dossier de travail, et le calcule par défaut
 * à côté de son propre module — c'est-à-dire **dans l'archive asar**, qui est
 * un fichier. Toute écriture y échoue par ENOTDIR. On le renvoie donc dehors,
 * même quand le binaire est déjà fourni et qu'il n'a rien à télécharger.
 */
process.env.MONGOMS_DOWNLOAD_DIR = path.join(app.getPath('userData'), 'mongodb-binaries');
process.env.MONGOMS_DISABLE_POSTINSTALL = '1';
fs.mkdirSync(process.env.MONGOMS_DOWNLOAD_DIR, { recursive: true });

if (fs.existsSync(MONGOD)) {
  process.env.MONGOMS_SYSTEM_BINARY = MONGOD;
} else {
  console.warn(`mongod introuvable à ${MONGOD} — il sera téléchargé.`);
}

let fenetre = null;
let serveur = null;
let arretEnCours = false;

/** Ramène la fenêtre, qu'elle soit réduite ou rangée dans la zone de notification. */
const montrer = () => {
  if (!fenetre) return;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  fenetre.focus();
};

/**
 * Fermer la fenêtre la range au lieu de quitter : les rappels ne sonnent que
 * tant que le Cahier tourne. Voir lib/arriere-plan.js.
 */
const arrierePlan = creerArrierePlan({
  app,
  Tray,
  Menu,
  icone: path.join(__dirname, 'icon.ico'),
  // un profil de test n'inscrit rien : l'exécutable de test remplacerait
  // l'inscription du vrai Cahier
  enPaquet: EN_PAQUET && !PROFIL_DE_TEST,
  montrer,
});

/**
 * Ramène le Cahier et lui dit quoi montrer : une tâche, une vue, la saisie.
 *
 * La page n'a aucun pont vers Node : le processus principal ne fait que poser
 * une ancre sur son adresse, qu'elle lit et valide elle-même (public/js/ancre.js).
 * Une page encore en chargement lira l'ancre à son démarrage.
 */
const allerA = (cible) => {
  montrer();
  const ancre = ancrePour(cible);
  if (!fenetre || !ancre) return;
  const poser = () =>
    fenetre.webContents
      .executeJavaScript(`location.hash = ${JSON.stringify(ancre)}`)
      .catch((erreur) => console.warn(`Ancre : ${erreur?.message || erreur}`));
  if (fenetre.webContents.isLoading()) fenetre.webContents.once('did-finish-load', poser);
  else poser();
};

// un événement plutôt qu'un appel direct : c'est le même chemin pour un clic
// sur une notification, le raccourci global — et les tests de bout en bout,
// qui ne peuvent pas cliquer un toast Windows
app.on('cahier-aller', allerA);

const raccourci = creerRaccourciGlobal({
  globalShortcut,
  declencher: () => app.emit('cahier-aller', { saisir: true }),
});

// un raccourci global survit à la fenêtre : il doit être rendu en partant
app.on('will-quit', () => raccourci.liberer());

/**
 * Relâche Mongo — une fois, quelle que soit la porte de sortie.
 *
 * Deux chemins mènent ici : la fermeture de la fenêtre et la pose d'une mise à
 * jour. Le second ne passe pas forcément par `before-quit` au bon moment, d'où
 * une fonction plutôt qu'un gestionnaire d'événement.
 */
const arreterServices = () => {
  if (arretEnCours || !serveur?.stopServices) return Promise.resolve();
  arretEnCours = true;
  return serveur.stopServices();
};

/**
 * @param {string} url
 * @param {{cachee?: boolean}} [options] ouverte sans se montrer : lancement
 *   par l'ouverture de session, le Cahier attend dans la zone de notification
 */
const creerFenetre = (url, { cachee = false } = {}) => {
  fenetre = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    // la couleur du papier, pour que l'ouverture ne clignote pas en blanc
    backgroundColor: '#f6f1e4',
    title: 'Cahier',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      // la page n'a aucun besoin de Node : ne pas le lui donner
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  fenetre.once('ready-to-show', () => {
    if (!cachee) fenetre.show();
  });
  fenetre.on('close', (event) => arrierePlan.surFermeture(event, fenetre));
  fenetre.on('closed', () => {
    fenetre = null;
  });

  // un lien externe s'ouvre dans le navigateur, pas dans la fenêtre de l'app
  fenetre.webContents.setWindowOpenHandler(({ url: cible }) => {
    shell.openExternal(cible);
    return { action: 'deny' };
  });

  fenetre.loadURL(url);
};

app.whenReady().then(async () => {
  // pas de barre de menus : ce n'est pas un navigateur
  Menu.setApplicationMenu(null);

  try {
    serveur = require(path.join(__dirname, '..', 'server.js'));
    // les deux : le serveur peut écouter alors que la base a échoué, et une
    // fenêtre ouverte sur une application sans base ne montrerait que des
    // erreurs
    const [url] = await Promise.all([serveur.ready, serveur.dbReady]);

    // avant la fenêtre : c'est le réglage qui dit si elle s'ouvre cachée.
    // Illisible, il retombe sur les défauts — garder, sans rien inscrire
    const reglages = await serveur.preferences.lire().catch(() => null);
    arrierePlan.appliquer(reglages);
    raccourci.appliquer(reglages);
    serveur.preferences.surEcriture((valeurs) => {
      arrierePlan.appliquer(valeurs);
      raccourci.appliquer(valeurs);
    });

    // des notifications qui se cliquent. Hors paquet, Windows ne connaît pas
    // l'identité du Cahier, et le toast PowerShell reste le repli
    if (EN_PAQUET && Notification.isSupported()) {
      serveur.brancherNotifications(
        creerNotifieur({
          Notification,
          icone: path.join(__dirname, 'icon.ico'),
          surClic: (cible) => app.emit('cahier-aller', cible),
        })
      );
    }

    creerFenetre(url, { cachee: arrierePlan.demarrerCache(process.argv) });

    // après la fenêtre, jamais avant : la mise à jour ne doit pas retarder
    // l'ouverture du Cahier, ni l'empêcher si le réseau est absent.
    //
    // Rien ne s'affiche depuis ici : l'updater écrit dans l'état porté par le
    // serveur, et c'est la page qui en parle, avec ses mots et son papier.
    configurerMisesAJour({
      updater: autoUpdater,
      etat: serveur.etatMaj,
      // un profil de test ne va rien chercher sur GitHub
      enPaquet: EN_PAQUET && !PROFIL_DE_TEST,
      // la pose lève d'abord la garde de la fenêtre : retenue dans la zone de
      // notification, elle empêcherait l'installation de se faire
      arreterServices: () => {
        arrierePlan.autoriserDepart();
        return arreterServices();
      },
    });
  } catch (error) {
    dialog.showErrorBox(
      'Le Cahier n’a pas pu démarrer',
      `${error.message}\n\nDonnées : ${DOSSIER_DONNEES}\nMongo : ${MONGOD}\n\n${error.stack || ''}`
    );
    app.quit();
  }
});

// relancer le Cahier alors qu'il attend dans la zone de notification le ramène
app.on('second-instance', montrer);

app.on('window-all-closed', () => {
  // la fenêtre n'est vraiment fermée que lorsqu'on quitte, ou quand le
  // réglage « rester dans la zone de notification » est décoché
  app.quit();
});

/**
 * Mongo tient un verrou sur le dossier de données. Le laisser derrière soi
 * empêcherait le prochain lancement de s'ouvrir. On retarde donc la sortie le
 * temps de le relâcher — une seule fois, sans quoi `app.quit()` rappellerait
 * ce gestionnaire en boucle.
 */
app.on('before-quit', (event) => {
  if (arretEnCours || !serveur?.stopServices) return;
  event.preventDefault();
  // `.finally` ne consomme pas un rejet : sans ce `catch`, un arrêt de Mongo qui
  // échoue ferait sortir le Cahier sur une unhandledRejection
  arreterServices()
    .catch((erreur) => console.warn(`Arrêt des services : ${erreur?.message || erreur}`))
    .finally(() => app.quit());
});
