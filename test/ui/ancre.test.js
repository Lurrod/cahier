import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

// l'ancre est écrite par le processus principal (CommonJS) et lue par la page
// (module ES) : le test d'aller-retour relie les deux moitiés
const require = createRequire(import.meta.url);
const { ancrePour } = require('../../lib/ancre.js');
const { lireAncre } = await import('../../public/js/ancre.js');

describe('lireAncre', () => {
  test('une tâche à ouvrir', () => {
    expect(lireAncre('#tache=6ab7ef1cd86dcf1f05745db8')).toEqual({
      tache: '6ab7ef1cd86dcf1f05745db8',
    });
  });

  test('une vue à montrer', () => {
    expect(lireAncre('#vue=today')).toEqual({ vue: 'today' });
    expect(lireAncre('#vue=overdue')).toEqual({ vue: 'overdue' });
  });

  test('la saisie à ouvrir', () => {
    expect(lireAncre('#saisir')).toEqual({ saisir: true });
  });

  test('rien de reconnu : rien à faire', () => {
    // l'ancre vient de la barre d'adresse : n'importe qui peut y écrire
    // n'importe quoi, seules des formes connues et bornées passent
    expect(lireAncre('')).toBeNull();
    expect(lireAncre('#main')).toBeNull();
    expect(lireAncre('#tache=pas-un-identifiant')).toBeNull();
    expect(lireAncre('#tache={"$ne":null}')).toBeNull();
    expect(lireAncre('#vue=inventee')).toBeNull();
  });
});

describe('ancrePour, côté processus principal', () => {
  test('rend l’ancre qu’on relira', () => {
    expect(lireAncre(ancrePour({ tache: '6ab7ef1cd86dcf1f05745db8' }))).toEqual({
      tache: '6ab7ef1cd86dcf1f05745db8',
    });
    expect(lireAncre(ancrePour({ vue: 'today' }))).toEqual({ vue: 'today' });
    expect(lireAncre(ancrePour({ saisir: true }))).toEqual({ saisir: true });
  });

  test('une cible invalide ne produit pas d’ancre', () => {
    expect(ancrePour({ tache: 'x' })).toBeNull();
    expect(ancrePour(null)).toBeNull();
  });
});
