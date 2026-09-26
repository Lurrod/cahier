const { DEFAUTS, SCHEMA, normaliserPreferences } = require('../../lib/preferences');

describe('normaliserPreferences', () => {
  test('sans rien, rend les valeurs par défaut', () => {
    expect(normaliserPreferences()).toEqual(DEFAUTS);
    expect(normaliserPreferences(null)).toEqual(DEFAUTS);
    expect(normaliserPreferences('pas un objet')).toEqual(DEFAUTS);
  });

  test('le Cahier peut s’ouvrir sur Ma journée', () => {
    const prefs = normaliserPreferences({ ouverture: { horizon: 'myday' } });

    expect(prefs.ouverture.horizon).toBe('myday');
  });

  test('garde une valeur reconnue', () => {
    const prefs = normaliserPreferences({ apparence: { densite: 'compact' } });

    expect(prefs.apparence.densite).toBe('compact');
  });

  test('remplace une valeur inconnue par le défaut plutôt que de la refuser', () => {
    // un réglage venu d'une version plus ancienne ou bricolé à la main ne doit
    // pas rendre tout le cahier inutilisable : on retombe sur ce qu'on sait
    const prefs = normaliserPreferences({ apparence: { densite: 'gigantesque' } });

    expect(prefs.apparence.densite).toBe(DEFAUTS.apparence.densite);
  });

  test('ignore une clé qui ne fait pas partie du schéma', () => {
    const prefs = normaliserPreferences({ apparence: { couleurDuCiel: 'bleu' }, inventé: 1 });

    expect(prefs.apparence.couleurDuCiel).toBeUndefined();
    expect(prefs.inventé).toBeUndefined();
  });

  test('rend toujours un document complet, même partiellement renseigné', () => {
    const prefs = normaliserPreferences({ ouverture: { tri: 'priority' } });

    expect(prefs.ouverture.tri).toBe('priority');
    expect(prefs.ouverture.statut).toBe(DEFAUTS.ouverture.statut);
    expect(prefs.apparence).toEqual(DEFAUTS.apparence);
  });

  test('applique le patch par-dessus une base, sans perdre le reste', () => {
    const base = normaliserPreferences({ apparence: { densite: 'compact', grain: false } });

    const prefs = normaliserPreferences({ ouverture: { tri: 'dueDate' } }, base);

    // le patch ne parle que de l'ouverture : l'apparence déjà choisie reste
    expect(prefs.apparence.densite).toBe('compact');
    expect(prefs.apparence.grain).toBe(false);
    expect(prefs.ouverture.tri).toBe('dueDate');
  });

  test('ne modifie ni l’entrée ni la base', () => {
    const entree = { apparence: { densite: 'compact' } };
    const base = normaliserPreferences();

    normaliserPreferences(entree, base);

    expect(entree).toEqual({ apparence: { densite: 'compact' } });
    expect(base).toEqual(DEFAUTS);
  });

  test('un booléen n’accepte qu’un vrai booléen', () => {
    // « false » en texte est vrai en JavaScript : l'accepter inverserait le
    // réglage d'un utilisateur qui poste du formulaire mal typé
    expect(normaliserPreferences({ apparence: { grain: 'false' } }).apparence.grain).toBe(
      DEFAUTS.apparence.grain
    );
    expect(normaliserPreferences({ apparence: { grain: false } }).apparence.grain).toBe(false);
  });

  test('une section qui n’est pas un objet est ignorée', () => {
    expect(normaliserPreferences({ apparence: 'compact' })).toEqual(DEFAUTS);
    expect(normaliserPreferences({ apparence: null })).toEqual(DEFAUTS);
  });

  test('le schéma décrit chaque réglage pour que la page Réglages se construise seule', () => {
    Object.entries(SCHEMA).forEach(([section, reglages]) => {
      expect(typeof section).toBe('string');
      Object.entries(reglages).forEach(([nom, regle]) => {
        expect(regle.libelle).toEqual(expect.any(String));
        expect(['choix', 'booleen']).toContain(regle.type);
        if (regle.type === 'choix') {
          expect(regle.valeurs.map((v) => v.valeur)).toContain(regle.defaut);
        }
        expect(DEFAUTS[section][nom]).toEqual(regle.defaut);
      });
    });
  });
});

describe('le thème', () => {
  test('s’ouvre sur le papier : un changement de version ne plonge personne dans le noir', () => {
    expect(DEFAUTS.apparence.theme).toBe('papier');
  });

  test.each(['papier', 'nuit', 'systeme'])('accepte « %s »', (theme) => {
    expect(normaliserPreferences({ apparence: { theme } }).apparence.theme).toBe(theme);
  });

  test('un thème inconnu retombe sur le papier', () => {
    expect(normaliserPreferences({ apparence: { theme: 'fluo' } }).apparence.theme).toBe('papier');
  });
});

describe('le nombre de tâches par page', () => {
  test('reste à cinq par défaut : personne ne voit sa liste changer sans l’avoir demandé', () => {
    expect(DEFAUTS.liste.parPage).toBe('5');
  });

  test.each(['5', '10', '20', '50'])('accepte %s', (parPage) => {
    expect(normaliserPreferences({ liste: { parPage } }).liste.parPage).toBe(parPage);
  });

  test('refuse une valeur hors de la liste, et le nombre nu', () => {
    // la page Réglages envoie la valeur d'un <select>, donc une chaîne : un
    // nombre ne vient que d'un client qui ne passe pas par elle
    expect(normaliserPreferences({ liste: { parPage: '7' } }).liste.parPage).toBe('5');
    expect(normaliserPreferences({ liste: { parPage: 1000 } }).liste.parPage).toBe('5');
  });
});

describe('l’arrière-plan', () => {
  test('garde le Cahier dans la zone de notification, sans l’inscrire au démarrage', () => {
    // garder : c'est ce qui fait sonner les rappels fenêtre fermée ;
    // démarrer avec Windows : personne n'y est inscrit sans l'avoir demandé
    expect(DEFAUTS.arrierePlan).toEqual({ garder: true, demarrage: false });
  });
});
