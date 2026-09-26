/* ---------------------------------------------------------------------------
   Cahier — lire l'ancre posée par le processus principal (voir lib/ancre.js).

   Une notification cliquée pose `#tache=<id>` ou `#vue=today`, le raccourci
   global `#saisir`. L'ancre vient de la barre d'adresse : n'importe qui peut
   y écrire n'importe quoi. Seules des formes connues et bornées passent.
   --------------------------------------------------------------------------- */

const RE_ID = /^[a-f0-9]{24}$/i;
const VUES = ['today', 'overdue', 'myday'];

/**
 * @param {string} hash `location.hash`
 * @returns {{tache: string}|{vue: string}|{saisir: true}|null}
 */
export const lireAncre = (hash) => {
  const texte = String(hash || '').replace(/^#/, '');
  if (texte === 'saisir') return { saisir: true };

  const [cle, valeur] = texte.split('=');
  if (cle === 'tache' && RE_ID.test(valeur || '')) return { tache: valeur };
  if (cle === 'vue' && VUES.includes(valeur)) return { vue: valeur };
  return null;
};
