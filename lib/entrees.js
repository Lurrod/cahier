/* ---------------------------------------------------------------------------
   Cahier — ce qui entre par une requête, ramené à une forme sûre.
   --------------------------------------------------------------------------- */

/**
 * Express transforme `?category[$ne]=null` en objet : injecté tel quel dans un
 * filtre, c'est un opérateur Mongo fourni par le client (et `aggregate` ne
 * caste rien, contrairement à `find`). Tout paramètre est donc ramené à une
 * chaîne avant usage.
 */
const asString = (value, max = 100) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

module.exports = { asString };
