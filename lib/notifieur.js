/* ---------------------------------------------------------------------------
   Cahier — des notifications qu'on peut cliquer.

   Le toast par PowerShell (lib/notify.js) part sous l'identité de PowerShell :
   Windows ne sait à qui rendre un clic, et il ne mène nulle part. Dans
   l'application installée, les notifications passent donc par Electron, dont
   l'événement `click` revient au Cahier : la fenêtre se rouvre sur la tâche
   concernée. PowerShell reste le repli hors application (`npm start`).

   `Notification` est reçue en argument, comme le reste d'Electron ailleurs :
   les tests n'affichent rien.
   --------------------------------------------------------------------------- */

/** Au-delà, les plus anciennes sont lâchées : elles ont quitté l'écran depuis longtemps. */
const GARDER_AU_PLUS = 20;

/**
 * @param {object} deps
 * @param {Function} deps.Notification la classe `Notification` d'Electron
 * @param {string} deps.icone chemin de l'icône du Cahier
 * @param {(cible: object|null) => void} deps.surClic ce qu'un clic doit ouvrir
 * @returns {((contenu: {title: string, message: string, cible?: object}) => Promise<boolean>) & {vivantes: () => number}}
 *   même forme que `sendNotification`, pour s'y substituer sans autre changement
 */
const creerNotifieur = ({ Notification, icone, surClic }) => {
  /**
   * Electron ne retient pas l'objet : ramassé par le ramasse-miettes, le toast
   * resterait à l'écran mais son clic ne mènerait plus nulle part. On les garde
   * donc jusqu'à leur fermeture, en nombre borné.
   */
  const vivantes = new Set();

  const retenir = (notification) => {
    vivantes.add(notification);
    if (vivantes.size > GARDER_AU_PLUS) vivantes.delete(vivantes.values().next().value);
  };

  const notifier = ({ title, message, cible = null }) =>
    new Promise((resolve) => {
      try {
        const notification = new Notification({ title, body: message, icon: icone });
        notification.on('click', () => surClic(cible));
        notification.on('close', () => vivantes.delete(notification));
        notification.show();
        retenir(notification);
        resolve(true);
      } catch {
        // même contrat que sendNotification : un rappel qui ne s'affiche pas
        // ne fait tomber ni le balayage, ni le serveur
        resolve(false);
      }
    });

  notifier.vivantes = () => vivantes.size;
  return notifier;
};

module.exports = { GARDER_AU_PLUS, creerNotifieur };
