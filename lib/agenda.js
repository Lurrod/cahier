/* ---------------------------------------------------------------------------
   Cahier — le cahier vu par un agenda : les tâches datées en iCalendar
   (RFC 5545), à importer dans Outlook, Google Agenda ou Thunderbird.

   Fonctions pures, sans base ni serveur. Le format est strict sur trois
   points que ce module tient seul : les caractères qui structurent une ligne
   s'échappent, les lignes se plient à 75 octets, et elles finissent en CRLF.
   --------------------------------------------------------------------------- */

const FIN = '\r\n';
const LARGEUR = 75;

/** Un créneau court : une tâche a une échéance, pas une durée. */
const DUREE = 'PT30M';

const REGLES = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

const DECLENCHEURS = { atDue: 'PT0M', '1h': '-PT1H', '1d': '-P1D' };

/** `20260928T120000Z` : l'instant en UTC, sans ambiguïté de fuseau. */
const horodatage = (date) =>
  new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/**
 * Échappe un texte de propriété. Sans cela, une virgule, un point-virgule ou
 * un retour à la ligne dans un titre casserait l'événement — ou y ajouterait
 * des propriétés.
 */
const echapper = (texte) =>
  String(texte ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');

/**
 * Plie une ligne à 75 octets, chaque suite commençant par une espace.
 * On avance caractère par caractère : couper sur un compte d'octets brut
 * tranche un « é » en deux, et le fichier cesse d'être de l'UTF-8.
 */
const plier = (ligne) => {
  const morceaux = [];
  let courant = '';
  let octets = 0;

  for (const car of ligne) {
    const taille = Buffer.byteLength(car, 'utf8');
    // la suite perd un octet à l'espace qui l'ouvre
    const limite = morceaux.length === 0 ? LARGEUR : LARGEUR - 1;
    if (octets + taille > limite) {
      morceaux.push(courant);
      courant = '';
      octets = 0;
    }
    courant += car;
    octets += taille;
  }
  morceaux.push(courant);

  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`)).join(FIN);
};

/**
 * @param {{freq?: string, interval?: number, until?: string|Date|null}|undefined} recurrence
 * @returns {string|null} la valeur de RRULE, ou null
 */
const regleDeRecurrence = (recurrence) => {
  const base = REGLES[recurrence?.freq];
  if (!base) return null;
  // « tous les N jours ouvrés » n'a pas d'équivalent en RFC 5545 : WEEKLY avec
  // INTERVAL=N voudrait dire « chaque jour ouvré, une semaine sur N ». Pas de
  // règle vaut mieux qu'une série que l'agenda dessinerait autrement
  if (recurrence.freq === 'weekdays' && (recurrence.interval || 1) > 1) return null;

  const parties = [base, `INTERVAL=${recurrence.interval || 1}`];
  if (recurrence.freq === 'weekdays') parties.push('BYDAY=MO,TU,WE,TH,FR');
  if (recurrence.until) parties.push(`UNTIL=${horodatage(recurrence.until)}`);
  return parties.join(';');
};

const evenement = (task, maintenant) => {
  const categories = [task.category, ...(task.tags || [])].filter(Boolean);
  const regle = regleDeRecurrence(task.recurrence);
  const declencheur = DECLENCHEURS[task.reminder?.offset];

  return [
    'BEGIN:VEVENT',
    // stable d'un export à l'autre : un agenda qui réimporte met à jour
    // l'événement au lieu de le dédoubler
    `UID:${task._id}@cahier`,
    `DTSTAMP:${horodatage(maintenant)}`,
    `DTSTART:${horodatage(task.dueDate)}`,
    `DURATION:${DUREE}`,
    `SUMMARY:${echapper(task.title)}`,
    ...(task.description ? [`DESCRIPTION:${echapper(task.description)}`] : []),
    ...(categories.length ? [`CATEGORIES:${categories.map(echapper).join(',')}`] : []),
    ...(regle ? [`RRULE:${regle}`] : []),
    ...(declencheur
      ? [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${echapper(task.title)}`,
          `TRIGGER:${declencheur}`,
          'END:VALARM',
        ]
      : []),
    'END:VEVENT',
  ];
};

/**
 * Le calendrier des tâches datées qui restent à faire.
 *
 * Les tâches rayées restent dehors : un agenda sert à prévoir, et y retrouver
 * le travail fait l'encombrerait. Les étapes datées y vont, elles : une
 * échéance est une échéance, qu'elle soit posée sur un dossier ou dedans.
 *
 * @param {Array<object>} tasks
 * @param {{maintenant?: Date}} [options]
 * @returns {string}
 */
const toIcs = (tasks, { maintenant = new Date() } = {}) => {
  const retenues = tasks.filter((t) => t.dueDate && !t.completed && !t.deletedAt);

  const contenu = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cahier//Taches//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Cahier',
    ...retenues.flatMap((t) => evenement(t, maintenant)),
    'END:VCALENDAR',
  ];

  return contenu.map(plier).join(FIN) + FIN;
};

module.exports = { echapper, plier, regleDeRecurrence, toIcs };
