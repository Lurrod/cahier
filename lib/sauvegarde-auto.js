/* ---------------------------------------------------------------------------
   Cahier — la sauvegarde que personne n'a besoin de penser à faire.

   Tout vit dans une base locale : un disque qui lâche, une base abîmée, et il
   ne reste que ce que l'utilisateur a pensé à exporter. Une fois par jour au
   plus, le serveur dépose donc une copie complète, et ne garde que les
   dernières.

   La rotation ne touche qu'aux fichiers qu'elle a écrits (préfixe `auto-`) :
   une sauvegarde faite à la main, ou déposée avant un remplacement, n'est
   jamais la sienne à effacer.
   --------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');

const PREFIXE = 'auto';
const GARDER = 14;
const INTERVALLE_MS = 24 * 60 * 60 * 1000;

/** `auto-2026-09-26T08-42-11.json` — l'horodatage UTC d'un nom de fichier. */
const MOTIF = /^auto-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})\.json$/;

const horodatage = (date) => date.toISOString().replace(/:/g, '-').slice(0, 19);

/**
 * @param {string} nom
 * @returns {Date|null} la date d'une sauvegarde automatique, null pour le reste
 */
const dateDuFichier = (nom) => {
  const trouve = MOTIF.exec(nom);
  if (!trouve) return null;
  const [, jour, h, m, s] = trouve;
  const date = new Date(`${jour}T${h}:${m}:${s}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Les sauvegardes automatiques, de la plus récente à la plus ancienne. */
const automatiques = (fichiers) =>
  fichiers
    .map((nom) => ({ nom, date: dateDuFichier(nom) }))
    .filter((f) => f.date)
    .sort((a, b) => b.date - a.date);

/**
 * @param {string[]} fichiers le contenu du dossier
 * @param {Date} maintenant
 * @returns {boolean} vrai si aucune copie automatique n'a moins d'un jour
 */
const doitSauvegarder = (fichiers, maintenant) =>
  !automatiques(fichiers).some(
    // une date à venir ne compte pas : l'horloge a été reculée, et la croire
    // suspendrait les sauvegardes jusqu'à ce que l'heure la rattrape
    ({ date }) => date <= maintenant && maintenant - date < INTERVALLE_MS
  );

/**
 * @param {string[]} fichiers
 * @param {number} [garder]
 * @returns {string[]} les copies automatiques de trop, les plus anciennes
 */
const aEvincer = (fichiers, garder = GARDER) =>
  automatiques(fichiers)
    .slice(garder)
    .map((f) => f.nom);

const estVide = (instantane) =>
  (instantane?.tasks?.length ?? 0) === 0 && (instantane?.categories?.length ?? 0) === 0;

/**
 * Dépose une copie si la dernière date d'un jour ou plus, puis fait tourner.
 *
 * @param {object} options
 * @param {string} options.dossier où écrire ; créé au besoin
 * @param {() => Promise<object>} options.collecter l'instantané à écrire
 * @param {Date} [options.maintenant]
 * @returns {Promise<{ecrit: string|null, evincees: string[]}>}
 */
const sauvegarderSiBesoin = async ({ dossier, collecter, maintenant = new Date() }) => {
  const rien = { ecrit: null, evincees: [] };

  fs.mkdirSync(dossier, { recursive: true });
  if (!doitSauvegarder(fs.readdirSync(dossier), maintenant)) return rien;

  const instantane = await collecter();
  // une base qui repart vide est plus probablement abîmée que vidée exprès :
  // écrire la copie ferait tourner la série et chasserait une bonne sauvegarde
  if (estVide(instantane)) return rien;

  const ecrit = path.join(dossier, `${PREFIXE}-${horodatage(maintenant)}.json`);
  fs.writeFileSync(ecrit, JSON.stringify(instantane, null, 2), 'utf8');

  const evincees = aEvincer(fs.readdirSync(dossier));
  evincees.forEach((nom) => fs.unlinkSync(path.join(dossier, nom)));

  return { ecrit, evincees };
};

module.exports = {
  GARDER,
  INTERVALLE_MS,
  dateDuFichier,
  doitSauvegarder,
  aEvincer,
  sauvegarderSiBesoin,
};
