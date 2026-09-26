const { ACCELERATEUR, creerRaccourciGlobal } = require('../../lib/raccourci-global');

/** Un faux `globalShortcut` d'Electron, qui peut refuser une combinaison déjà prise. */
const fauxRaccourcis = ({ pris = false } = {}) => ({
  enregistres: new Map(),
  register(acc, cb) {
    if (pris) return false;
    this.enregistres.set(acc, cb);
    return true;
  },
  unregister(acc) {
    this.enregistres.delete(acc);
  },
});

const armer = (options = {}) => {
  const globalShortcut = fauxRaccourcis(options);
  const declenchements = [];
  const avertissements = [];
  const raccourci = creerRaccourciGlobal({
    globalShortcut,
    declencher: () => declenchements.push('saisir'),
    journal: { warn: (m) => avertissements.push(m) },
  });
  return { raccourci, globalShortcut, declenchements, avertissements };
};

const reglages = (raccourciGlobal) => ({ arrierePlan: { raccourciGlobal } });

describe('creerRaccourciGlobal', () => {
  test('Ctrl+Alt+N, de partout, ouvre la saisie', () => {
    const { raccourci, globalShortcut, declenchements } = armer();

    raccourci.appliquer(reglages(true));
    globalShortcut.enregistres.get(ACCELERATEUR)();

    expect(ACCELERATEUR).toBe('CommandOrControl+Alt+N');
    expect(declenchements).toEqual(['saisir']);
  });

  test('actif par défaut, y compris sur des réglages illisibles', () => {
    const { raccourci, globalShortcut } = armer();

    raccourci.appliquer(null);

    expect(globalShortcut.enregistres.has(ACCELERATEUR)).toBe(true);
  });

  test('décoché, il rend la combinaison aux autres applications', () => {
    const { raccourci, globalShortcut } = armer();
    raccourci.appliquer(reglages(true));

    raccourci.appliquer(reglages(false));

    expect(globalShortcut.enregistres.has(ACCELERATEUR)).toBe(false);
    expect(raccourci.actif()).toBe(false);
  });

  test('réappliquer ne l’enregistre pas deux fois', () => {
    const { raccourci, globalShortcut } = armer();
    const register = jest.spyOn(globalShortcut, 'register');

    raccourci.appliquer(reglages(true));
    raccourci.appliquer(reglages(true));

    expect(register).toHaveBeenCalledTimes(1);
  });

  test('une combinaison déjà prise le dit, sans rien casser', () => {
    // une autre application a pu la réserver avant nous : ce n'est pas une
    // panne du Cahier, seulement un raccourci qu'il n'aura pas
    const { raccourci, avertissements } = armer({ pris: true });

    expect(() => raccourci.appliquer(reglages(true))).not.toThrow();

    expect(raccourci.actif()).toBe(false);
    expect(avertissements[0]).toMatch(/déjà prise/);
  });

  test('libérer à la fermeture rend la combinaison', () => {
    // un raccourci global survit à la fenêtre : oublié, il resterait accaparé
    const { raccourci, globalShortcut } = armer();
    raccourci.appliquer(reglages(true));

    raccourci.liberer();

    expect(globalShortcut.enregistres.has(ACCELERATEUR)).toBe(false);
  });
});
