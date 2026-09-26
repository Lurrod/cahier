const {
  ARG_CACHE,
  creerArrierePlan,
  demarreCache,
  reglageDemarrage,
} = require('../../lib/arriere-plan');

/** Un faux `app` d'Electron : on déclenche ses événements à la main. */
const fausseApp = () => {
  const ecouteurs = {};
  return {
    quitte: 0,
    inscriptions: [],
    on(evt, cb) {
      ecouteurs[evt] = cb;
    },
    emettre(evt, ...args) {
      ecouteurs[evt]?.(...args);
    },
    quit() {
      this.quitte += 1;
    },
    setLoginItemSettings(reglage) {
      this.inscriptions.push(reglage);
    },
  };
};

/** Une fausse zone de notification, qui retient ce qu'on lui a demandé. */
const creerFaux = () => {
  const zones = [];
  class Tray {
    constructor(icone) {
      this.icone = icone;
      this.detruite = false;
      this.ecouteurs = {};
      zones.push(this);
    }
    setToolTip(texte) {
      this.info = texte;
    }
    setContextMenu(menu) {
      this.menu = menu;
    }
    on(evt, cb) {
      this.ecouteurs[evt] = cb;
    }
    destroy() {
      this.detruite = true;
    }
  }
  const Menu = { buildFromTemplate: (modele) => ({ modele }) };
  return { Tray, Menu, zones };
};

const fausseFenetre = () => ({
  cachee: false,
  hide() {
    this.cachee = true;
  },
});

const fermeture = () => {
  const evt = { empechee: false };
  evt.preventDefault = () => {
    evt.empechee = true;
  };
  return evt;
};

const armer = (options = {}) => {
  const app = fausseApp();
  const { Tray, Menu, zones } = creerFaux();
  const montres = [];
  const arriere = creerArrierePlan({
    app,
    Tray,
    Menu,
    icone: 'icone.png',
    enPaquet: true,
    montrer: () => montres.push('montrer'),
    ...options,
  });
  return { app, arriere, zones, montres };
};

const reglages = (arrierePlan) => ({ arrierePlan });

describe('demarreCache', () => {
  test('reconnaît un lancement par l’ouverture de session', () => {
    expect(demarreCache(['cahier.exe', ARG_CACHE])).toBe(true);
    expect(demarreCache(['cahier.exe'])).toBe(false);
  });
});

describe('reglageDemarrage', () => {
  test('inscrit le Cahier, avec l’argument qui le fait démarrer caché', () => {
    expect(reglageDemarrage(true)).toEqual({ openAtLogin: true, args: [ARG_CACHE] });
  });

  test('désinscrit sans argument', () => {
    expect(reglageDemarrage(false)).toEqual({ openAtLogin: false, args: [] });
  });
});

describe('creerArrierePlan', () => {
  test('fermer la fenêtre la range, et le Cahier continue de tourner', () => {
    const { arriere } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));
    const fenetre = fausseFenetre();
    const evt = fermeture();

    arriere.surFermeture(evt, fenetre);

    // c'est tout l'enjeu : un rappel ne part que si le serveur tourne
    expect(evt.empechee).toBe(true);
    expect(fenetre.cachee).toBe(true);
  });

  test('réglage décoché : fermer la fenêtre ferme le Cahier, comme avant', () => {
    const { arriere } = armer();
    arriere.appliquer(reglages({ garder: false, demarrage: false }));
    const evt = fermeture();

    arriere.surFermeture(evt, fausseFenetre());

    expect(evt.empechee).toBe(false);
  });

  test('quitter pour de bon — menu, mise à jour — n’est jamais retenu', () => {
    const { app, arriere } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    // la pose d'une mise à jour passe par app.quit, donc par before-quit :
    // retenir la fenêtre à ce moment bloquerait la mise à jour
    app.emettre('before-quit');
    const evt = fermeture();
    arriere.surFermeture(evt, fausseFenetre());

    expect(evt.empechee).toBe(false);
  });

  test('la pose d’une mise à jour peut lever la garde elle-même, sans compter sur before-quit', () => {
    // updates.js arrête les services puis appelle quitAndInstall ; l'ordre de
    // before-quit par rapport à la fermeture de la fenêtre n'y est pas garanti
    const { arriere } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    arriere.autoriserDepart();
    const evt = fermeture();
    arriere.surFermeture(evt, fausseFenetre());

    expect(evt.empechee).toBe(false);
  });

  test('une icône paraît dans la zone de notification, avec son menu', () => {
    const { arriere, zones } = armer();

    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    expect(zones).toHaveLength(1);
    expect(zones[0].info).toBe('Cahier');
    const libelles = zones[0].menu.modele.map((e) => e.label).filter(Boolean);
    expect(libelles).toEqual(['Ouvrir le Cahier', 'Quitter']);
  });

  test('le menu ouvre la fenêtre, et « Quitter » quitte pour de bon', () => {
    const { app, arriere, zones, montres } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));
    const [ouvrir, , quitter] = zones[0].menu.modele;

    ouvrir.click();
    quitter.click();
    const evt = fermeture();
    arriere.surFermeture(evt, fausseFenetre());

    expect(montres).toEqual(['montrer']);
    expect(app.quitte).toBe(1);
    expect(evt.empechee).toBe(false);
  });

  test('un clic sur l’icône rouvre la fenêtre', () => {
    const { arriere, zones, montres } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    zones[0].ecouteurs.click();

    expect(montres).toEqual(['montrer']);
  });

  test('réappliquer les mêmes réglages ne multiplie pas les icônes', () => {
    const { arriere, zones } = armer();

    arriere.appliquer(reglages({ garder: true, demarrage: false }));
    arriere.appliquer(reglages({ garder: true, demarrage: true }));

    expect(zones).toHaveLength(1);
  });

  test('décocher le réglage retire l’icône', () => {
    const { arriere, zones } = armer();
    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    arriere.appliquer(reglages({ garder: false, demarrage: false }));

    expect(zones[0].detruite).toBe(true);
  });

  test('le démarrage avec Windows suit le réglage', () => {
    const { app, arriere } = armer();

    arriere.appliquer(reglages({ garder: true, demarrage: true }));
    arriere.appliquer(reglages({ garder: true, demarrage: false }));

    expect(app.inscriptions).toEqual([reglageDemarrage(true), reglageDemarrage(false)]);
  });

  test('en développement, on n’inscrit rien au démarrage de Windows', () => {
    // app.setLoginItemSettings y inscrirait electron.exe, pas le Cahier
    const { app, arriere } = armer({ enPaquet: false });

    arriere.appliquer(reglages({ garder: true, demarrage: true }));

    expect(app.inscriptions).toEqual([]);
  });

  test('démarrer caché n’a de sens que s’il y a une icône pour revenir', () => {
    const { arriere } = armer();

    arriere.appliquer(reglages({ garder: true, demarrage: true }));
    expect(arriere.demarrerCache([ARG_CACHE])).toBe(true);

    // sans icône, une fenêtre cachée au lancement serait une application
    // invisible, qu'on ne pourrait ni rouvrir ni quitter
    arriere.appliquer(reglages({ garder: false, demarrage: true }));
    expect(arriere.demarrerCache([ARG_CACHE])).toBe(false);
  });

  test('des réglages illisibles gardent le Cahier en arrière-plan', () => {
    const { arriere, zones } = armer();

    arriere.appliquer(null);

    expect(zones).toHaveLength(1);
  });
});
