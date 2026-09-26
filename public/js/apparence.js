/* ---------------------------------------------------------------------------
   Cahier — l'apparence, posée sur la racine du document.

   Chaque réglage devient un attribut `data-…` que le CSS lit. Une seule
   exception : les traits au crayon ne sont pas du CSS mais des SVG attachés
   par drawably — il faut le dire à `sketch.js`, d'où le rappel injecté.

   Un miroir dans le stockage local permet de reposer l'apparence AVANT la
   réponse du serveur. Sans lui, la page s'ouvrirait en « confort » puis
   sauterait en « compact » une fraction de seconde plus tard. Ce miroir n'est
   qu'un cache d'affichage : la vérité reste dans la base, et un stockage
   refusé (navigation privée) ne coûte que ce clignotement.

   Le thème se pose en deux attributs : `data-theme` dit ce qui a été choisi,
   `data-nuit` ce qui s'affiche. « Comme Windows » se résout ici plutôt qu'en
   CSS : les jetons de nuit n'existent ainsi qu'en un seul bloc, au lieu d'être
   recopiés sous une requête média.
   --------------------------------------------------------------------------- */

/** Clé du miroir. Préfixée : le stockage est partagé avec toute l'origine. */
const CLE_MEMOIRE = 'cahier.apparence';

const SOMBRE = '(prefers-color-scheme: dark)';

/** `matchMedia` du navigateur, s'il y en a un. */
const mediaParDefaut = globalThis.matchMedia ? (q) => globalThis.matchMedia(q) : undefined;

const nuitDemandee = (theme, media) =>
  theme === 'nuit' || (theme === 'systeme' && Boolean(media?.(SOMBRE)?.matches));

const poserNuit = (racine, media) => {
  racine.dataset.nuit = nuitDemandee(racine.dataset.theme, media) ? 'on' : 'off';
};

/** Ce qui se dit par un attribut, et comment. */
const ATTRIBUTS = {
  theme: (valeur) => valeur,
  densite: (valeur) => valeur,
  taille: (valeur) => valeur,
  // « on » plutôt que rien : un attribut absent ne se distingue pas d'un oubli
  grain: (valeur) => (valeur ? 'on' : 'off'),
  crayon: (valeur) => (valeur ? 'on' : 'off'),
};

const poserAttributs = (apparence, racine, media) => {
  Object.entries(ATTRIBUTS).forEach(([nom, dire]) => {
    if (apparence[nom] === undefined) return;
    racine.dataset[nom] = dire(apparence[nom]);
  });
  if (apparence.theme !== undefined) poserNuit(racine, media);
};

/**
 * Applique l'apparence et la retient pour le prochain lancement.
 *
 * @param {object|null} apparence la section « apparence » des réglages
 * @param {object} deps
 * @param {HTMLElement} [deps.racine]
 * @param {Storage} [deps.memoire]
 * @param {(actif: boolean) => void} deps.poserCrayon
 * @param {(requete: string) => MediaQueryList} [deps.media] `matchMedia`
 */
export const appliquerApparence = (
  apparence,
  {
    racine = document.documentElement,
    memoire = globalThis.localStorage,
    poserCrayon,
    media = mediaParDefaut,
  }
) => {
  if (!apparence) return;

  poserAttributs(apparence, racine, media);
  if (apparence.crayon !== undefined) poserCrayon(apparence.crayon);

  try {
    memoire?.setItem(CLE_MEMOIRE, JSON.stringify(apparence));
  } catch {
    // stockage refusé ou plein : l'apparence est posée, c'est l'essentiel.
    // Elle sera simplement redemandée au serveur au prochain lancement.
  }
};

/**
 * Repose l'apparence du dernier lancement, avant toute réponse du serveur.
 *
 * @returns {object|null} ce qui a été reposé, ou null au premier lancement
 */
export const restaurerApparence = ({
  racine = document.documentElement,
  memoire = globalThis.localStorage,
  poserCrayon,
  media = mediaParDefaut,
}) => {
  let apparence = null;

  try {
    const brut = memoire?.getItem(CLE_MEMOIRE);
    apparence = brut ? JSON.parse(brut) : null;
  } catch {
    // stockage inaccessible, ou contenu qui n'est plus du JSON : on n'en sait
    // pas plus qu'au premier lancement, et ce n'est pas un incident
    return null;
  }

  if (!apparence || typeof apparence !== 'object') return null;

  poserAttributs(apparence, racine, media);
  if (apparence.crayon !== undefined) poserCrayon(apparence.crayon);

  return apparence;
};

/**
 * Suit Windows quand il bascule entre clair et sombre, Cahier ouvert.
 *
 * À n'appeler qu'une fois : l'écoute relit le thème courant sur la racine à
 * chaque bascule, elle n'a pas à être refaite quand les réglages changent.
 */
export const suivreLeSysteme = ({ racine = document.documentElement, media = mediaParDefaut }) => {
  const liste = media?.(SOMBRE);
  liste?.addEventListener?.('change', () => {
    if (racine.dataset.theme === 'systeme') poserNuit(racine, media);
  });
};

export { CLE_MEMOIRE };
