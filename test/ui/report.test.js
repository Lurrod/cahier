import { describe, expect, test } from 'vitest';
import { reporter } from '../../public/js/report.js';

/* Horloge figée : mercredi 16 septembre 2026, 10h00 locales. Les assertions
   portent sur les champs locaux, jamais sur la chaîne ISO — sinon le fuseau
   de la machine ferait osciller le test. */
const NOW = new Date(2026, 8, 16, 10, 0, 0);

const lu = (iso) => {
  const d = new Date(iso);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

const le = (...args) => new Date(...args).toISOString();

describe('reporter à demain', () => {
  test('une tâche en retard passe à demain, à son heure', () => {
    const avant = le(2026, 8, 12, 14, 30);
    expect(lu(reporter(avant, 'demain', NOW))).toEqual([2026, 9, 17, 14, 30]);
  });

  test('une tâche du jour passe au lendemain', () => {
    expect(lu(reporter(le(2026, 8, 16, 18, 0), 'demain', NOW))).toEqual([2026, 9, 17, 18, 0]);
  });

  test('une tâche à venir recule d’un jour depuis sa propre échéance', () => {
    // reporter ne doit jamais avancer une tâche : « demain » depuis vendredi
    // serait un retour en arrière
    expect(lu(reporter(le(2026, 8, 18, 9, 0), 'demain', NOW))).toEqual([2026, 9, 19, 9, 0]);
  });

  test('une tâche sans date reçoit demain matin', () => {
    expect(lu(reporter(null, 'demain', NOW))).toEqual([2026, 9, 17, 9, 0]);
  });
});

describe('reporter à la semaine prochaine', () => {
  test('une tâche en retard passe au lundi qui vient, à son heure', () => {
    expect(lu(reporter(le(2026, 8, 12, 14, 30), 'semaine', NOW))).toEqual([2026, 9, 21, 14, 30]);
  });

  test('une tâche déjà au lundi qui vient passe au lundi d’après', () => {
    expect(lu(reporter(le(2026, 8, 21, 9, 0), 'semaine', NOW))).toEqual([2026, 9, 28, 9, 0]);
  });

  test('un lundi, « semaine prochaine » vise le lundi suivant, pas aujourd’hui', () => {
    const lundi = new Date(2026, 8, 21, 8, 0, 0);
    expect(lu(reporter(null, 'semaine', lundi))).toEqual([2026, 9, 28, 9, 0]);
  });
});

test('une cible inconnue ne produit rien plutôt qu’une date fausse', () => {
  expect(reporter(le(2026, 8, 12, 9, 0), 'plus-tard', NOW)).toBeNull();
});
