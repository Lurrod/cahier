const { JOURS, dateDeFin, debutDuBilan, semaine } = require('../../lib/bilan');

/** Une date locale : le bilan compte en jours du poste, pas en jours UTC. */
const le = (jour, heure = 12) => new Date(2026, 8, jour, heure, 0, 0);

describe('dateDeFin', () => {
  const maintenant = le(26, 15);

  test('rayer une tâche la date de maintenant', () => {
    expect(dateDeFin({ completed: false, completedAt: null }, true, maintenant)).toEqual(
      maintenant
    );
  });

  test('la décocher efface sa date', () => {
    expect(dateDeFin({ completed: true, completedAt: le(20) }, false, maintenant)).toBeNull();
  });

  test('recocher une tâche déjà rayée garde sa date d’origine', () => {
    // enregistrer « Modifier » renvoie completed: true tel quel : sans cette
    // garde, corriger le titre d'une tâche rayée lundi la ferait compter
    // pour aujourd'hui
    expect(dateDeFin({ completed: true, completedAt: le(20) }, true, maintenant)).toEqual(le(20));
  });

  test('une tâche rayée avant que la date existe en reçoit une si on la recoche', () => {
    expect(dateDeFin({ completed: true, completedAt: null }, true, maintenant)).toEqual(maintenant);
  });
});

describe('debutDuBilan', () => {
  test('remonte à minuit, six jours avant aujourd’hui', () => {
    expect(debutDuBilan(le(26, 15))).toEqual(new Date(2026, 8, 20, 0, 0, 0, 0));
  });
});

describe('semaine', () => {
  const maintenant = le(26, 15);

  test('compte les tâches rayées jour par jour, du plus ancien à aujourd’hui', () => {
    const jours = semaine([le(26, 9), le(26, 10), le(24), le(20, 0)], maintenant);

    expect(jours).toHaveLength(JOURS);
    expect(jours.map((j) => j.n)).toEqual([1, 0, 0, 0, 1, 0, 2]);
    expect(jours.at(-1).jour).toEqual(new Date(2026, 8, 26));
  });

  test('ignore ce qui sort de la fenêtre, et les dates illisibles', () => {
    const jours = semaine([le(19, 23), le(27), null, 'pas une date'], maintenant);

    expect(jours.every((j) => j.n === 0)).toBe(true);
  });

  test('une semaine sans rien reste une semaine : sept jours à zéro', () => {
    expect(semaine([], maintenant).map((j) => j.n)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});
