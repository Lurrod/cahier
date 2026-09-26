import { beforeEach, describe, expect, test } from 'vitest';

const { CLE_MEMOIRE, appliquerApparence, restaurerApparence, suivreLeSysteme } =
  await import('../../public/js/apparence.js');

const APPARENCE = { densite: 'compact', taille: 'grande', grain: false, crayon: false };

/** Un faux localStorage, pour ne pas dépendre de celui de l'environnement. */
const fausseMemoire = (depart = {}) => ({
  contenu: { ...depart },
  panne: false,
  getItem(cle) {
    if (this.panne) throw new Error('stockage refusé');
    return this.contenu[cle] ?? null;
  },
  setItem(cle, valeur) {
    if (this.panne) throw new Error('stockage refusé');
    this.contenu[cle] = valeur;
  },
});

let racine;
let crayons;

/**
 * Un faux `matchMedia` : Windows dit « sombre » ou non, et peut changer d'avis
 * pendant que le Cahier est ouvert.
 */
const fauxSysteme = (sombre) => {
  const ecoutes = [];
  const liste = {
    get matches() {
      return sombre;
    },
    addEventListener: (_evt, cb) => ecoutes.push(cb),
  };
  const media = () => liste;
  media.basculer = (valeur) => {
    sombre = valeur;
    ecoutes.forEach((cb) => cb());
  };
  media.ecoutes = ecoutes;
  return media;
};

const poserCrayon = (actif) => crayons.push(actif);

beforeEach(() => {
  document.body.innerHTML = '';
  racine = document.createElement('div');
  crayons = [];
});

describe('appliquerApparence', () => {
  test('pose chaque réglage sur la racine, là où le CSS le lira', () => {
    appliquerApparence(APPARENCE, { racine, memoire: fausseMemoire(), poserCrayon });

    expect(racine.dataset.densite).toBe('compact');
    expect(racine.dataset.taille).toBe('grande');
    expect(racine.dataset.grain).toBe('off');
    expect(racine.dataset.crayon).toBe('off');
  });

  test('« on » plutôt que rien : un attribut absent ne se distingue pas d’un oubli', () => {
    appliquerApparence(
      { densite: 'confort', taille: 'normale', grain: true, crayon: true },
      { racine, memoire: fausseMemoire(), poserCrayon }
    );

    expect(racine.dataset.grain).toBe('on');
    expect(racine.dataset.crayon).toBe('on');
  });

  test('prévient la couche de traits, qui n’est pas du CSS', () => {
    appliquerApparence(APPARENCE, { racine, memoire: fausseMemoire(), poserCrayon });

    expect(crayons).toEqual([false]);
  });

  test('retient l’apparence pour le prochain lancement', () => {
    const memoire = fausseMemoire();

    appliquerApparence(APPARENCE, { racine, memoire, poserCrayon });

    expect(JSON.parse(memoire.contenu[CLE_MEMOIRE])).toEqual(APPARENCE);
  });

  test('un stockage refusé ne casse pas l’affichage', () => {
    const memoire = fausseMemoire();
    memoire.panne = true;

    // navigation privée, stockage désactivé : l'apparence doit s'appliquer
    // quand même, elle sera simplement redemandée au serveur au prochain coup
    expect(() => appliquerApparence(APPARENCE, { racine, memoire, poserCrayon })).not.toThrow();
    expect(racine.dataset.densite).toBe('compact');
  });

  test('sans apparence, ne touche à rien', () => {
    appliquerApparence(null, { racine, memoire: fausseMemoire(), poserCrayon });

    expect(racine.dataset.densite).toBeUndefined();
    expect(crayons).toEqual([]);
  });
});

describe('restaurerApparence', () => {
  test('repose l’apparence du dernier lancement, sans attendre le serveur', () => {
    const memoire = fausseMemoire({ [CLE_MEMOIRE]: JSON.stringify(APPARENCE) });

    const rendue = restaurerApparence({ racine, memoire, poserCrayon });

    // sans ce rappel, la page s'ouvrirait en « confort » avant de sauter en
    // « compact » dès la réponse du serveur
    expect(racine.dataset.densite).toBe('compact');
    expect(rendue).toEqual(APPARENCE);
  });

  test('un premier lancement ne pose rien', () => {
    expect(restaurerApparence({ racine, memoire: fausseMemoire(), poserCrayon })).toBeNull();
    expect(racine.dataset.densite).toBeUndefined();
  });

  test('une mémoire illisible est ignorée sans bruit', () => {
    const memoire = fausseMemoire({ [CLE_MEMOIRE]: 'ceci n’est pas du JSON' });

    expect(restaurerApparence({ racine, memoire, poserCrayon })).toBeNull();
    expect(racine.dataset.densite).toBeUndefined();
  });

  test('un stockage inaccessible est ignoré sans bruit', () => {
    const memoire = fausseMemoire();
    memoire.panne = true;

    expect(restaurerApparence({ racine, memoire, poserCrayon })).toBeNull();
  });

  test('une mémoire qui ne dit pas tout ne pose que ce qu’elle dit', () => {
    const memoire = fausseMemoire({ [CLE_MEMOIRE]: JSON.stringify({ densite: 'compact' }) });

    restaurerApparence({ racine, memoire, poserCrayon });

    // le reste viendra du serveur ; inventer un défaut ici le ferait clignoter
    expect(racine.dataset.densite).toBe('compact');
    expect(racine.dataset.taille).toBeUndefined();
  });
});

describe('le thème', () => {
  const appliquer = (theme, media) =>
    appliquerApparence({ theme }, { racine, memoire: fausseMemoire(), poserCrayon, media });

  test('« nuit » éteint la lumière, quel que soit Windows', () => {
    appliquer('nuit', fauxSysteme(false));

    expect(racine.dataset.theme).toBe('nuit');
    expect(racine.dataset.nuit).toBe('on');
  });

  test('« papier » reste clair, même sous un Windows sombre', () => {
    appliquer('papier', fauxSysteme(true));

    expect(racine.dataset.nuit).toBe('off');
  });

  test('« comme Windows » suit le réglage du système', () => {
    appliquer('systeme', fauxSysteme(true));
    expect(racine.dataset.nuit).toBe('on');

    appliquer('systeme', fauxSysteme(false));
    expect(racine.dataset.nuit).toBe('off');
  });

  test('sans matchMedia, « comme Windows » reste sur le papier', () => {
    appliquer('systeme', undefined);

    expect(racine.dataset.nuit).toBe('off');
  });

  test('le thème est reposé dès le lancement, avant la réponse du serveur', () => {
    const memoire = fausseMemoire({ [CLE_MEMOIRE]: JSON.stringify({ theme: 'nuit' }) });

    restaurerApparence({ racine, memoire, poserCrayon, media: fauxSysteme(false) });

    // sans cela, la page s'ouvrirait en blanc crème puis s'assombrirait :
    // l'éclair est exactement ce que quelqu'un qui travaille de nuit veut éviter
    expect(racine.dataset.nuit).toBe('on');
  });
});

describe('suivreLeSysteme', () => {
  test('Windows passe en sombre pendant la séance : le Cahier suit', () => {
    const media = fauxSysteme(false);
    appliquerApparence(
      { theme: 'systeme' },
      { racine, memoire: fausseMemoire(), poserCrayon, media }
    );

    suivreLeSysteme({ racine, media });
    media.basculer(true);

    expect(racine.dataset.nuit).toBe('on');
  });

  test('un thème choisi à la main ne bouge pas quand Windows change', () => {
    const media = fauxSysteme(false);
    appliquerApparence(
      { theme: 'papier' },
      { racine, memoire: fausseMemoire(), poserCrayon, media }
    );

    suivreLeSysteme({ racine, media });
    media.basculer(true);

    expect(racine.dataset.nuit).toBe('off');
  });

  test('sans matchMedia, ne fait rien et ne lève pas', () => {
    expect(() => suivreLeSysteme({ racine, media: undefined })).not.toThrow();
  });
});
