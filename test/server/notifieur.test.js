const { GARDER_AU_PLUS, creerNotifieur } = require('../../lib/notifieur');

/** Une fausse `Notification` d'Electron : on déclenche ses événements à la main. */
const creerFaux = ({ echoue = false } = {}) => {
  const creees = [];
  class Notification {
    constructor(options) {
      this.options = options;
      this.ecouteurs = {};
      creees.push(this);
    }
    on(evt, cb) {
      this.ecouteurs[evt] = cb;
    }
    show() {
      if (echoue) throw new Error('toasts désactivés');
      this.ecouteurs.show?.();
    }
    emettre(evt) {
      this.ecouteurs[evt]?.();
    }
  }
  return { Notification, creees };
};

const armer = (options = {}) => {
  const { Notification, creees } = creerFaux(options);
  const clics = [];
  const notifier = creerNotifieur({
    Notification,
    icone: 'icone.ico',
    surClic: (cible) => clics.push(cible),
  });
  return { notifier, creees, clics };
};

describe('creerNotifieur', () => {
  test('montre le titre et le message, avec l’icône du Cahier', async () => {
    const { notifier, creees } = armer();

    await expect(notifier({ title: 'Cahier — rappel', message: 'Dentiste' })).resolves.toBe(true);

    expect(creees[0].options).toEqual({
      title: 'Cahier — rappel',
      body: 'Dentiste',
      icon: 'icone.ico',
    });
  });

  test('un clic rend la cible de la notification', async () => {
    const { notifier, creees, clics } = armer();
    await notifier({ title: 't', message: 'm', cible: { tache: '6ab7ef1cd86dcf1f05745db8' } });

    creees[0].emettre('click');

    expect(clics).toEqual([{ tache: '6ab7ef1cd86dcf1f05745db8' }]);
  });

  test('sans cible, un clic ouvre quand même le Cahier', async () => {
    const { notifier, creees, clics } = armer();
    await notifier({ title: 't', message: 'm' });

    creees[0].emettre('click');

    expect(clics).toEqual([null]);
  });

  test('garde la notification vivante jusqu’à sa fermeture', async () => {
    // Electron ne retient pas l'objet : ramassé par le ramasse-miettes, le
    // toast resterait à l'écran mais son clic ne mènerait plus nulle part
    const { notifier, creees } = armer();
    await notifier({ title: 't', message: 'm' });

    expect(notifier.vivantes()).toBe(1);
    creees[0].emettre('close');
    expect(notifier.vivantes()).toBe(0);
  });

  test('n’en garde qu’un nombre borné', async () => {
    const { notifier } = armer();

    for (let i = 0; i < GARDER_AU_PLUS + 5; i += 1) {
      await notifier({ title: 't', message: `m${i}` });
    }

    expect(notifier.vivantes()).toBe(GARDER_AU_PLUS);
  });

  test('un échec du canal ne fait pas tomber l’appelant', async () => {
    const { notifier } = armer({ echoue: true });

    await expect(notifier({ title: 't', message: 'm' })).resolves.toBe(false);
    expect(notifier.vivantes()).toBe(0);
  });
});
