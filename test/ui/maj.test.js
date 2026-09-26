import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';

/* ---------------------------------------------------------------------------
   Le bandeau de mise à jour. Tout ce qu'il ne peut pas faire seul — interroger
   le serveur, agir sur la mise à jour, lire la préférence, battre la mesure —
   lui est injecté : ces tests n'ouvrent aucune connexion et ne dorment jamais.
   --------------------------------------------------------------------------- */

const HTML = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf8');
const BODY = HTML.slice(HTML.indexOf('<body>') + '<body>'.length, HTML.indexOf('</body>')).replace(
  /<script[\s\S]*?<\/script>/g,
  ''
);

const { initMisesAJour } = await import('../../public/js/maj.js');

/**
 * Un faux minuteur : on déclenche ses battements à la main.
 * Il retire vraiment ce qu'on lui demande de retirer — sinon le test « on
 * cesse d'interroger » passerait quoi qu'il arrive.
 */
const fauxMinuteur = () => ({
  battements: new Map(),
  intervalles: new Map(),
  suivant: 0,
  arrets: 0,
  poser(rappel, ms) {
    this.suivant += 1;
    this.battements.set(this.suivant, rappel);
    this.intervalles.set(this.suivant, ms);
    return this.suivant;
  },
  /** L'intervalle du battement en cours, s'il y en a un. */
  cadence() {
    const [id] = [...this.battements.keys()];
    return id === undefined ? null : this.intervalles.get(id);
  },
  retirer(id) {
    this.arrets += 1;
    this.battements.delete(id);
  },
  async battre() {
    for (const rappel of [...this.battements.values()]) await rappel();
  },
});

const systeme = (maj) => ({ version: '3.0.1', dossierDonnees: 'C:\\Cahier\\db', maj });

/**
 * Arme le bandeau sur une suite de réponses serveur.
 * @param {object[]} reponses servies dans l'ordre ; la dernière se répète
 */
const armer = (reponses, options = {}) => {
  const appels = { lectures: 0, gestes: [] };
  const minuteur = fauxMinuteur();

  const bandeau = initMisesAJour({
    lireSysteme: () => {
      const reponse = reponses[Math.min(appels.lectures, reponses.length - 1)];
      appels.lectures += 1;
      return reponse instanceof Error ? Promise.reject(reponse) : Promise.resolve(reponse);
    },
    agir: (quoi) => {
      appels.gestes.push(quoi);
      return Promise.resolve(systeme({ etape: 'repos' }));
    },
    prevenir: () => true,
    toast: () => {},
    minuteur,
    ...options,
  });

  return { bandeau, appels, minuteur };
};

const el = (id) => document.getElementById(id);
const visible = () => !el('maj-banner').hidden;

beforeEach(() => {
  document.body.innerHTML = BODY;
});

describe('bandeau de mise à jour', () => {
  test('rien de prêt : le bandeau reste rangé', async () => {
    const { bandeau } = armer([systeme({ etape: 'repos' })]);

    await bandeau.rafraichir();

    expect(visible()).toBe(false);
  });

  test('un téléchargement en cours ne dérange pas non plus', async () => {
    const { bandeau } = armer([systeme({ etape: 'telechargement', version: '3.1.0' })]);

    await bandeau.rafraichir();

    // le téléchargement se fait en fond : l'annoncer serait une interruption
    // pour une chose que personne n'a demandée
    expect(visible()).toBe(false);
  });

  test('une version prête est annoncée, et nommée', async () => {
    const { bandeau } = armer([systeme({ etape: 'prete', version: '3.1.0' })]);

    await bandeau.rafraichir();

    expect(visible()).toBe(true);
    expect(el('maj-banner').textContent).toContain('3.1.0');
  });

  test('« Plus tard » range le bandeau et le dit au serveur', async () => {
    const { bandeau, appels } = armer([systeme({ etape: 'prete', version: '3.1.0' })]);
    await bandeau.rafraichir();

    el('maj-later').click();
    await Promise.resolve();

    expect(visible()).toBe(false);
    // sans le dire au serveur, le bandeau reviendrait au battement suivant
    expect(appels.gestes).toEqual(['reporter']);
  });

  test('« Redémarrer » demande l’installation', async () => {
    const { bandeau, appels } = armer([systeme({ etape: 'prete', version: '3.1.0' })]);
    await bandeau.rafraichir();

    el('maj-install').click();
    await Promise.resolve();

    expect(appels.gestes).toEqual(['installer']);
  });

  test('hors application installée, on cesse d’interroger le serveur', async () => {
    const { bandeau, appels, minuteur } = armer([systeme({ etape: 'inactive' })]);

    await bandeau.rafraichir();
    await minuteur.battre();

    // dans un navigateur, il n'y aura jamais de mise à jour : continuer à
    // demander toutes les minutes serait du bruit pour rien
    expect(minuteur.arrets).toBe(1);
    expect(appels.lectures).toBe(1);
    expect(visible()).toBe(false);
  });

  test('le minuteur par défaut n’appelle pas setInterval détaché de la fenêtre', () => {
    const vraiPoser = globalThis.setInterval;
    const vraiRetirer = globalThis.clearInterval;

    // Chromium refuse `setInterval` appelé sur autre chose que la fenêtre —
    // « Illegal invocation ». happy-dom l'accepte, et tous les autres tests
    // injectent un faux minuteur : le défaut n'était jamais joué. Il a suffi
    // à faire mourir `app.js` entier au chargement de la 3.1.0.
    const commeChromium = (vrai) =>
      function (...args) {
        if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
        return vrai.apply(globalThis, args);
      };
    globalThis.setInterval = commeChromium(vraiPoser);
    globalThis.clearInterval = commeChromium(vraiRetirer);

    try {
      const bandeau = initMisesAJour({
        lireSysteme: () => Promise.resolve(systeme({ etape: 'inactive' })),
        agir: () => Promise.resolve(null),
        prevenir: () => true,
        toast: () => {},
      });

      // `arreter` passe par `clearInterval`, qui tombe dans le même piège
      expect(() => bandeau.arreter()).not.toThrow();
    } finally {
      globalThis.setInterval = vraiPoser;
      globalThis.clearInterval = vraiRetirer;
    }
  });

  test('un élément marqué hidden est réellement caché, quelle que soit sa classe', () => {
    const feuilles = ['tokens.css', 'layout.css', 'components.css']
      .map((f) => readFileSync(resolve(process.cwd(), 'public/css', f), 'utf8'))
      .join('\n');

    // `.maj { display: flex }` l'emportait sur l'attribut `hidden` du bandeau,
    // qui restait donc à l'écran en permanence, boutons compris. Une règle
    // globale vaut mieux qu'un garde-fou par classe qu'on oublie.
    expect(feuilles).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });

  test('pendant la recherche, on continue d’interroger', async () => {
    const { bandeau, appels, minuteur } = armer([
      systeme({ etape: 'recherche' }),
      systeme({ etape: 'prete', version: '3.2.0' }),
    ]);

    await bandeau.rafraichir();
    await minuteur.battre();

    // une application installée annonce « recherche » le temps que le réseau
    // réponde : y voir une raison de se taire condamnerait le bandeau à ne
    // jamais rien annoncer de la session. Le rythme change en recherche
    // (plus rapide), mais un battement reste toujours armé
    expect(minuteur.battements.size).toBe(1);
    expect(visible()).toBe(true);
  });

  test('une pose qui échoue le dit, au lieu de rester sur « Fermeture du Cahier… »', async () => {
    const { bandeau } = armer([systeme({ etape: 'prete', version: '3.2.0' })], {
      agir: () =>
        Promise.resolve(
          systeme({ etape: 'echec', message: 'La nouvelle version ne s’est pas posée.' })
        ),
    });

    await bandeau.rafraichir();
    el('maj-install').click();
    await Promise.resolve();
    await Promise.resolve();

    // sans cela, le bandeau annonce une fermeture qui n'aura pas lieu, et
    // personne ne l'apprend avant le battement suivant — une minute plus tard
    expect(el('maj-title').textContent).not.toBe('Fermeture du Cahier…');
    expect(el('maj-detail').textContent).toContain('ne s’est pas posée');
  });

  test('une réponse sans état ne fait rien apparaître, et arrête les questions', async () => {
    const { bandeau, minuteur } = armer([{}]);

    await bandeau.rafraichir();

    // on ne devine pas ce qu'on n'a pas reçu
    expect(visible()).toBe(false);
    expect(minuteur.arrets).toBe(1);
  });

  test('une panne de réseau ne fait rien apparaître', async () => {
    const { bandeau } = armer([new Error('serveur injoignable')]);

    await expect(bandeau.rafraichir()).resolves.toBeNull();

    expect(visible()).toBe(false);
  });

  test('la préférence « ne pas prévenir » garde le bandeau fermé', async () => {
    const { bandeau } = armer([systeme({ etape: 'prete', version: '3.1.0' })], {
      prevenir: () => false,
    });

    await bandeau.rafraichir();

    // la mise à jour se posera quand même à la fermeture : ne pas prévenir
    // n'est pas refuser
    expect(visible()).toBe(false);
  });

  test('un redémarrage impossible s’explique, sans proposer de recommencer', async () => {
    const { bandeau } = armer([
      systeme({
        etape: 'echec',
        version: '3.1.0',
        message: 'Le redémarrage n’a pas pu se faire maintenant.',
      }),
    ]);

    await bandeau.rafraichir();

    expect(visible()).toBe(true);
    expect(el('maj-banner').textContent).toContain('pas pu se faire');
    // proposer « Redémarrer » après un échec de redémarrage serait une impasse
    expect(el('maj-install').hidden).toBe(true);
  });

  test('une version reportée ne revient pas s’imposer', async () => {
    const { bandeau } = armer([systeme({ etape: 'reportee', version: '3.1.0' })]);

    await bandeau.rafraichir();

    expect(visible()).toBe(false);
  });

  test('le dernier état lu reste consultable pour la page Réglages', async () => {
    const { bandeau } = armer([systeme({ etape: 'prete', version: '3.1.0' })]);

    await bandeau.rafraichir();

    // la page Réglages lit ce que le bandeau a déjà demandé, plutôt que de
    // poser la même question au serveur
    expect(bandeau.dernier()).toMatchObject({ version: '3.0.1', maj: { etape: 'prete' } });
  });
});

describe('bandeau de mise à jour — en temps réel', () => {
  const telechargement = (progression) =>
    systeme({ etape: 'telechargement', version: '3.16.0', progression });

  test('au repos, il interroge une fois la minute', async () => {
    const { bandeau, minuteur } = armer([systeme({ etape: 'repos' })]);

    await bandeau.rafraichir();

    expect(minuteur.cadence()).toBe(60_000);
  });

  test('pendant un téléchargement, il suit de près', async () => {
    // une minute entre deux lectures, c'était une progression qui sautait de
    // 0 à 100 %, et une version prête annoncée jusqu'à une minute en retard
    const { bandeau, minuteur } = armer([telechargement(10)]);

    await bandeau.rafraichir();

    expect(minuteur.cadence()).toBe(1500);
  });

  test('pendant une recherche aussi', async () => {
    const { bandeau, minuteur } = armer([systeme({ etape: 'recherche' })]);

    await bandeau.rafraichir();

    expect(minuteur.cadence()).toBe(1500);
  });

  test('la version prête, il revient au pas lent, sans laisser deux battements', async () => {
    const { bandeau, minuteur } = armer([telechargement(90), systeme({ etape: 'prete' })]);

    await bandeau.rafraichir();
    await bandeau.rafraichir();

    expect(minuteur.cadence()).toBe(60_000);
    expect(minuteur.battements.size).toBe(1);
  });

  test('tant que les Réglages sont ouverts, il suit de près même au repos', async () => {
    let ouverts = true;
    const { bandeau, minuteur } = armer([systeme({ etape: 'repos' })], {
      regarde: () => ouverts,
    });

    await bandeau.rafraichir();
    expect(minuteur.cadence()).toBe(1500);

    // fermés par Échap ou d'un clic à côté : personne ne le lui dit, il le
    // constate au battement suivant
    ouverts = false;
    await bandeau.rafraichir();
    expect(minuteur.cadence()).toBe(60_000);
  });

  test('chaque lecture est annoncée à qui s’est abonné', async () => {
    const { bandeau } = armer([telechargement(10), telechargement(55)]);
    const vus = [];
    bandeau.surEtat((s) => vus.push(s.maj.progression));

    await bandeau.rafraichir();
    await bandeau.rafraichir();

    expect(vus).toEqual([10, 55]);
  });

  test('un abonné en panne n’arrête ni le bandeau ni les autres', async () => {
    const { bandeau } = armer([telechargement(10)]);
    const vus = [];
    bandeau.surEtat(() => {
      throw new Error('page Réglages démontée');
    });
    bandeau.surEtat((s) => vus.push(s.maj.etape));

    await expect(bandeau.rafraichir()).resolves.toBeTruthy();
    expect(vus).toEqual(['telechargement']);
  });
});
