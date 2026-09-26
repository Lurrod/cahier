const {
  CLE_MEMOIRE,
  jourLocal,
  doitEnvoyer,
  messageDuPoint,
  envoyerLePoint,
} = require('../../lib/point-du-matin');

/** Une heure locale, le 26 septembre 2026. */
const a = (heure, minute = 0) => new Date(2026, 8, 26, heure, minute);

describe('jourLocal', () => {
  test('le jour du poste, pas le jour UTC', () => {
    // à 0 h 30 à Paris, il est encore la veille en UTC
    expect(jourLocal(new Date(2026, 8, 26, 0, 30))).toBe('2026-09-26');
  });
});

describe('doitEnvoyer', () => {
  test('désactivé, il ne part jamais', () => {
    expect(doitEnvoyer({ maintenant: a(9), heure: '', dernier: null })).toBe(false);
  });

  test('part à l’heure dite, une fois', () => {
    expect(doitEnvoyer({ maintenant: a(8, 59), heure: '9', dernier: null })).toBe(false);
    expect(doitEnvoyer({ maintenant: a(9), heure: '9', dernier: null })).toBe(true);
    expect(doitEnvoyer({ maintenant: a(9, 30), heure: '9', dernier: '2026-09-26' })).toBe(false);
  });

  test('un poste allumé à 10 h le reçoit quand même', () => {
    expect(doitEnvoyer({ maintenant: a(10, 15), heure: '9', dernier: '2026-09-25' })).toBe(true);
  });

  test('passé midi, ce n’est plus le matin : on ne l’envoie plus', () => {
    // un « point du matin » reçu à 17 h parce que le poste vient de s'allumer
    // ne dirait rien d'utile, et surprendrait
    expect(doitEnvoyer({ maintenant: a(12), heure: '9', dernier: null })).toBe(false);
  });

  test('une heure illisible vaut désactivé', () => {
    expect(doitEnvoyer({ maintenant: a(9), heure: 'midi', dernier: null })).toBe(false);
  });
});

describe('messageDuPoint', () => {
  test('dit ce qui tombe aujourd’hui, le retard et ma journée', () => {
    expect(messageDuPoint({ aujourdhui: 3, retard: 2, journee: 1 })).toEqual({
      title: 'Le point du matin',
      message: '3 tâches aujourd’hui · 2 en retard · 1 dans ma journée',
    });
  });

  test('accorde au singulier et tait ce qui vaut zéro', () => {
    expect(messageDuPoint({ aujourdhui: 1, retard: 0, journee: 0 }).message).toBe(
      '1 tâche aujourd’hui'
    );
  });

  test('rien à dire : pas de notification', () => {
    expect(messageDuPoint({ aujourdhui: 0, retard: 0, journee: 0 })).toBeNull();
  });
});

describe('envoyerLePoint', () => {
  /** Une mémoire en clair, comme celle que tient la base. */
  const fausseMemoire = (depart = {}) => {
    const contenu = { ...depart };
    return {
      contenu,
      lire: async (cle) => contenu[cle] ?? null,
      ecrire: async (cle, valeur) => {
        contenu[cle] = valeur;
      },
    };
  };

  const armer = ({ heure = '9', comptes = { aujourdhui: 2, retard: 1, journee: 0 }, memoire }) => {
    const envois = [];
    return {
      envois,
      deps: {
        lireHeure: async () => heure,
        compter: async () => comptes,
        memoire: memoire || fausseMemoire(),
        envoyer: async (notification) => {
          envois.push(notification);
          return true;
        },
      },
    };
  };

  test('envoie le point et retient le jour', async () => {
    const memoire = fausseMemoire();
    const { envois, deps } = armer({ memoire });

    await envoyerLePoint({ ...deps, maintenant: a(9, 1) });

    expect(envois).toHaveLength(1);
    expect(memoire.contenu[CLE_MEMOIRE]).toBe('2026-09-26');
  });

  test('ne renvoie pas le même jour, même après un redémarrage', async () => {
    // la mémoire vit en base : un Cahier relancé à 10 h ne redit pas le point
    const memoire = fausseMemoire({ [CLE_MEMOIRE]: '2026-09-26' });
    const { envois, deps } = armer({ memoire });

    await envoyerLePoint({ ...deps, maintenant: a(10) });

    expect(envois).toHaveLength(0);
  });

  test('un matin sans rien : pas de notification, mais le jour est retenu', async () => {
    const memoire = fausseMemoire();
    const { envois, deps } = armer({ memoire, comptes: { aujourdhui: 0, retard: 0, journee: 0 } });

    await envoyerLePoint({ ...deps, maintenant: a(9) });

    // retenir le jour évite de recompter chaque minute jusqu'à midi
    expect(envois).toHaveLength(0);
    expect(memoire.contenu[CLE_MEMOIRE]).toBe('2026-09-26');
  });

  test('un envoi qui échoue sera retenté à la minute suivante', async () => {
    const memoire = fausseMemoire();
    const { deps } = armer({ memoire });

    await envoyerLePoint({ ...deps, envoyer: async () => false, maintenant: a(9) });

    expect(memoire.contenu[CLE_MEMOIRE]).toBeUndefined();
  });

  test('désactivé, il ne compte même pas', async () => {
    let comptes = 0;
    const { deps } = armer({ heure: '' });

    await envoyerLePoint({
      ...deps,
      compter: async () => {
        comptes += 1;
        return {};
      },
      maintenant: a(9),
    });

    expect(comptes).toBe(0);
  });
});
