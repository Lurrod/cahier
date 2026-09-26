/* ---------------------------------------------------------------------------
   Cahier — le bilan de la semaine : sept barres sous la jauge d'avancement.

   La jauge dit où en est la liste ; le bilan dit ce qui a été fait, jour par
   jour. Les comptes viennent de GET /tasks/stats, qui les calcule sur toute la
   base — la page affichée n'en sait pas assez.
   --------------------------------------------------------------------------- */

import { $ } from './util.js';

const JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const INITIALE = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' });

/**
 * Dessine le bilan, ou le cache quand le serveur n'en fournit pas.
 *
 * @param {{aujourdhui: number, semaine: Array<{jour: string, n: number}>}|undefined} bilan
 */
export const dessinerBilan = (bilan) => {
  const bloc = $('bilan');
  const barres = $('bilan-barres');
  // un serveur plus ancien ne date pas les tâches rayées : une semaine à zéro
  // dirait qu'on n'a rien fait, alors qu'on n'en sait rien
  if (!Array.isArray(bilan?.semaine) || bilan.semaine.length === 0) {
    bloc.hidden = true;
    return;
  }

  const plus = Math.max(1, ...bilan.semaine.map((j) => j.n));
  const dernier = bilan.semaine.length - 1;

  barres.innerHTML = bilan.semaine
    .map(({ jour, n }, i) => {
      const date = new Date(jour);
      const titre = `${i === dernier ? 'Aujourd’hui' : JOUR_COURT.format(date)} : ${n}`;
      return `<span class="bilan-jour" title="${titre}">
        <span class="bilan-barre${i === dernier ? ' is-today' : ''}" style="--hauteur: ${Math.round((n / plus) * 100)}%"></span>
        <span class="bilan-initiale" aria-hidden="true">${INITIALE.format(date)}</span>
      </span>`;
    })
    .join('');

  const lecture = bilan.semaine
    .map(
      ({ jour, n }, i) =>
        `${i === dernier ? 'aujourd’hui' : JOUR_COURT.format(new Date(jour))} ${n}`
    )
    .join(', ');
  barres.setAttribute('aria-label', `Rayées ces sept derniers jours : ${lecture}`);
  bloc.hidden = false;
};

/**
 * Ce que le sous-titre ajoute quand du travail a été rayé aujourd'hui.
 * Rien sinon : « 0 rayée aujourd'hui » serait un reproche, pas un bilan.
 *
 * @param {{aujourdhui?: number}|undefined} bilan
 * @returns {string}
 */
export const noteDuJour = (bilan) => {
  const n = bilan?.aujourdhui || 0;
  if (n === 0) return '';
  return ` · ${n} rayée${n > 1 ? 's' : ''} aujourd’hui`;
};
