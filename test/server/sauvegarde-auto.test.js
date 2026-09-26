const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  GARDER,
  dateDuFichier,
  doitSauvegarder,
  aEvincer,
  sauvegarderSiBesoin,
} = require('../../lib/sauvegarde-auto');

const HEURE = 60 * 60 * 1000;
const JOUR = 24 * HEURE;
const nom = (iso) => `auto-${iso.replace(/:/g, '-').slice(0, 19)}.json`;

describe('dateDuFichier', () => {
  test('relit l’horodatage d’une sauvegarde automatique', () => {
    expect(dateDuFichier('auto-2026-09-26T08-42-11.json')).toEqual(
      new Date('2026-09-26T08:42:11Z')
    );
  });

  test('ignore tout ce qui n’est pas une sauvegarde automatique', () => {
    expect(dateDuFichier('cahier-2026-09-26T08-42-11.json')).toBeNull();
    expect(dateDuFichier('avant-remplacement-2026-09-26T08-42-11.json')).toBeNull();
    expect(dateDuFichier('auto-pas-une-date.json')).toBeNull();
    expect(dateDuFichier('notes.txt')).toBeNull();
  });
});

describe('doitSauvegarder', () => {
  const maintenant = new Date('2026-09-26T12:00:00Z');

  test('sauvegarde quand il n’y en a encore aucune', () => {
    expect(doitSauvegarder([], maintenant)).toBe(true);
  });

  test('ne refait rien moins d’un jour après la précédente', () => {
    const recente = nom(new Date(maintenant - 3 * HEURE).toISOString());
    expect(doitSauvegarder([recente], maintenant)).toBe(false);
  });

  test('refait une sauvegarde passé un jour', () => {
    const ancienne = nom(new Date(maintenant - JOUR - HEURE).toISOString());
    expect(doitSauvegarder([ancienne], maintenant)).toBe(true);
  });

  test('une sauvegarde manuelle récente ne dispense pas de l’automatique', () => {
    // la rotation ne compte que les automatiques : s'en remettre à une copie
    // qu'elle ne gère pas laisserait un trou dans la série
    expect(doitSauvegarder(['cahier-2026-09-26T11-00-00.json'], maintenant)).toBe(true);
  });

  test('une sauvegarde datée du futur ne bloque pas la suivante', () => {
    // l'horloge a été reculée : sans cette garde, plus rien ne serait écrit
    // jusqu'à ce que l'heure rattrape la date du fichier
    const future = nom(new Date(maintenant.getTime() + 10 * JOUR).toISOString());
    expect(doitSauvegarder([future], maintenant)).toBe(true);
  });
});

describe('aEvincer', () => {
  test('garde les plus récentes et rend les plus anciennes', () => {
    const fichiers = [
      'auto-2026-09-20T08-00-00.json',
      'auto-2026-09-22T08-00-00.json',
      'auto-2026-09-21T08-00-00.json',
      'auto-2026-09-23T08-00-00.json',
    ];
    expect(aEvincer(fichiers, 2)).toEqual([
      'auto-2026-09-21T08-00-00.json',
      'auto-2026-09-20T08-00-00.json',
    ]);
  });

  test('ne touche jamais une sauvegarde faite à la main', () => {
    const fichiers = [
      'cahier-2020-01-01T00-00-00.json',
      'avant-remplacement-2020-01-01T00-00-00.json',
      'auto-2026-09-23T08-00-00.json',
    ];
    expect(aEvincer(fichiers, 1)).toEqual([]);
  });

  test('en garde quatorze par défaut', () => {
    expect(GARDER).toBe(14);
  });
});

describe('sauvegarderSiBesoin', () => {
  let dossier;
  const pleine = { tasks: [{ _id: 'a', title: 'Lait' }], categories: [] };

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'cahier-auto-'));
  });

  afterEach(() => {
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  test('écrit une sauvegarde lisible dans un dossier qui n’existait pas', async () => {
    const cible = path.join(dossier, 'sous', 'dossier');
    const maintenant = new Date('2026-09-26T12:00:00Z');

    const { ecrit } = await sauvegarderSiBesoin({
      dossier: cible,
      collecter: async () => pleine,
      maintenant,
    });

    expect(path.basename(ecrit)).toBe('auto-2026-09-26T12-00-00.json');
    expect(JSON.parse(fs.readFileSync(ecrit, 'utf8'))).toEqual(pleine);
  });

  test('ne collecte rien quand la dernière est assez fraîche', async () => {
    fs.writeFileSync(path.join(dossier, 'auto-2026-09-26T10-00-00.json'), '{}');
    const collecter = jest.fn(async () => pleine);

    const resultat = await sauvegarderSiBesoin({
      dossier,
      collecter,
      maintenant: new Date('2026-09-26T12:00:00Z'),
    });

    expect(resultat).toEqual({ ecrit: null, evincees: [] });
    expect(collecter).not.toHaveBeenCalled();
  });

  test('une base vide ne chasse pas les bonnes sauvegardes', async () => {
    // si la base est abîmée et repart vide, quatorze jours de copies vides
    // évinceraient une à une les dernières copies qui contiennent encore tout
    const anciennes = Array.from({ length: GARDER }, (_, i) =>
      nom(new Date(Date.UTC(2026, 8, 1 + i, 8)).toISOString())
    );
    anciennes.forEach((f) => fs.writeFileSync(path.join(dossier, f), '{}'));

    const resultat = await sauvegarderSiBesoin({
      dossier,
      collecter: async () => ({ tasks: [], categories: [] }),
      maintenant: new Date('2026-09-26T12:00:00Z'),
    });

    expect(resultat).toEqual({ ecrit: null, evincees: [] });
    expect(fs.readdirSync(dossier).sort()).toEqual(anciennes.sort());
  });

  test('fait tourner les copies une fois la nouvelle écrite', async () => {
    const anciennes = Array.from({ length: GARDER }, (_, i) =>
      nom(new Date(Date.UTC(2026, 8, 1 + i, 8)).toISOString())
    );
    anciennes.forEach((f) => fs.writeFileSync(path.join(dossier, f), '{}'));
    fs.writeFileSync(path.join(dossier, 'cahier-2020-01-01T00-00-00.json'), '{}');

    const { ecrit, evincees } = await sauvegarderSiBesoin({
      dossier,
      collecter: async () => pleine,
      maintenant: new Date('2026-09-26T12:00:00Z'),
    });

    expect(evincees).toEqual([anciennes[0]]);
    const restants = fs.readdirSync(dossier);
    expect(restants).toContain(path.basename(ecrit));
    expect(restants).toContain('cahier-2020-01-01T00-00-00.json');
    expect(restants.filter((f) => f.startsWith('auto-'))).toHaveLength(GARDER);
  });
});
