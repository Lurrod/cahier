const { echapper, plier, regleDeRecurrence, toIcs } = require('../../lib/agenda');

const task = (extra = {}) => ({
  _id: 'abc123',
  title: 'Dentiste',
  description: '',
  completed: false,
  dueDate: '2026-09-28T12:00:00.000Z',
  category: '',
  tags: [],
  deletedAt: null,
  parentId: null,
  recurrence: { freq: '', interval: 1, until: null },
  reminder: { offset: '', at: null, sentAt: null },
  ...extra,
});

const MAINTENANT = new Date('2026-09-26T10:00:00.000Z');

/** Les lignes logiques, une fois le pliage défait. */
const lignes = (ics) => ics.replace(/\r\n /g, '').split('\r\n');

describe('echapper', () => {
  test('neutralise ce qui structure le format', () => {
    // sans cela, un titre contenant « ;RRULE:… » ou un retour à la ligne
    // ajouterait des propriétés à l'événement
    expect(echapper('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  test('ramène les retours chariot à un seul saut', () => {
    expect(echapper('ligne 1\r\nligne 2')).toBe('ligne 1\\nligne 2');
  });
});

describe('plier', () => {
  test('laisse une ligne courte telle quelle', () => {
    expect(plier('SUMMARY:Dentiste')).toBe('SUMMARY:Dentiste');
  });

  test('plie à 75 octets, la suite commençant par une espace', () => {
    const pliee = plier(`SUMMARY:${'a'.repeat(200)}`);

    pliee.split('\r\n').forEach((morceau, i) => {
      expect(Buffer.byteLength(morceau, 'utf8')).toBeLessThanOrEqual(75);
      if (i > 0) expect(morceau.startsWith(' ')).toBe(true);
    });
    expect(pliee.replace(/\r\n /g, '')).toBe(`SUMMARY:${'a'.repeat(200)}`);
  });

  test('ne coupe jamais un caractère accentué en deux', () => {
    // « é » tient sur deux octets : une coupe au milieu rendrait le fichier
    // illisible pour les agendas qui valident l'UTF-8
    const texte = `SUMMARY:${'é'.repeat(120)}`;
    const pliee = plier(texte);

    expect(pliee.replace(/\r\n /g, '')).toBe(texte);
    pliee.split('\r\n').forEach((morceau) => {
      expect(Buffer.byteLength(morceau, 'utf8')).toBeLessThanOrEqual(75);
      expect(morceau).not.toContain('�');
    });
  });
});

describe('regleDeRecurrence', () => {
  test.each([
    [{ freq: 'daily', interval: 1 }, 'FREQ=DAILY;INTERVAL=1'],
    [{ freq: 'weekdays', interval: 1 }, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR'],
    [{ freq: 'weekly', interval: 2 }, 'FREQ=WEEKLY;INTERVAL=2'],
    [{ freq: 'monthly', interval: 1 }, 'FREQ=MONTHLY;INTERVAL=1'],
    [{ freq: 'yearly', interval: 1 }, 'FREQ=YEARLY;INTERVAL=1'],
  ])('%o → %s', (recurrence, attendu) => {
    expect(regleDeRecurrence({ until: null, ...recurrence })).toBe(attendu);
  });

  test('« tous les N jours ouvrés » n’a pas d’équivalent : pas de règle plutôt qu’une fausse', () => {
    // FREQ=WEEKLY;INTERVAL=2;BYDAY=… voudrait dire « chaque jour ouvré, une
    // semaine sur deux » — l'agenda montrerait une autre série que le Cahier
    expect(regleDeRecurrence({ freq: 'weekdays', interval: 2, until: null })).toBeNull();
  });

  test('porte la fin de série', () => {
    expect(
      regleDeRecurrence({ freq: 'daily', interval: 1, until: '2026-12-31T23:00:00.000Z' })
    ).toBe('FREQ=DAILY;INTERVAL=1;UNTIL=20261231T230000Z');
  });

  test('rien pour une tâche qui ne se répète pas, ou une fréquence inconnue', () => {
    expect(regleDeRecurrence({ freq: '', interval: 1 })).toBeNull();
    expect(regleDeRecurrence({ freq: 'hourly', interval: 1 })).toBeNull();
    expect(regleDeRecurrence(undefined)).toBeNull();
  });
});

describe('toIcs', () => {
  test('un calendrier valide, en CRLF, avec un événement par tâche datée', () => {
    const ics = toIcs([task()], { maintenant: MAINTENANT });

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const l = lignes(ics);
    expect(l).toContain('VERSION:2.0');
    expect(l).toContain('BEGIN:VEVENT');
    expect(l).toContain('UID:abc123@cahier');
    expect(l).toContain('DTSTAMP:20260926T100000Z');
    expect(l).toContain('DTSTART:20260928T120000Z');
    expect(l).toContain('DURATION:PT30M');
    expect(l).toContain('SUMMARY:Dentiste');
  });

  test('l’identifiant est stable : réimporter met l’événement à jour', () => {
    // un agenda reconnaît un événement à son UID : le changer à chaque export
    // dédoublerait tout le calendrier à chaque réimport
    const a = toIcs([task()], { maintenant: MAINTENANT });
    const b = toIcs([task()], { maintenant: new Date('2026-10-01T00:00:00Z') });

    expect(lignes(a).find((x) => x.startsWith('UID:'))).toBe(
      lignes(b).find((x) => x.startsWith('UID:'))
    );
  });

  test('ne garde que les tâches datées, à faire, hors corbeille, étapes comprises', () => {
    const ics = toIcs(
      [
        task({ _id: 'garde', title: 'Garde' }),
        task({ _id: 'sans', title: 'Sans date', dueDate: null }),
        task({ _id: 'faite', title: 'Faite', completed: true }),
        task({ _id: 'jetee', title: 'Jetée', deletedAt: '2026-09-20T00:00:00Z' }),
        task({ _id: 'etape', title: 'Étape datée', parentId: 'garde' }),
      ],
      { maintenant: MAINTENANT }
    );

    const uids = lignes(ics).filter((x) => x.startsWith('UID:'));
    expect(uids).toEqual(['UID:garde@cahier', 'UID:etape@cahier']);
  });

  test('traduit la récurrence et le rappel', () => {
    const ics = toIcs(
      [
        task({
          recurrence: { freq: 'weekly', interval: 1, until: null },
          reminder: { offset: '1h', at: null, sentAt: null },
        }),
      ],
      { maintenant: MAINTENANT }
    );

    const l = lignes(ics);
    expect(l).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1');
    expect(l).toContain('BEGIN:VALARM');
    expect(l).toContain('TRIGGER:-PT1H');
    expect(l).toContain('ACTION:DISPLAY');
  });

  test.each([
    ['atDue', 'TRIGGER:PT0M'],
    ['1d', 'TRIGGER:-P1D'],
  ])('rappel « %s » → %s', (offset, trigger) => {
    const ics = toIcs([task({ reminder: { offset, at: null, sentAt: null } })], {
      maintenant: MAINTENANT,
    });
    expect(lignes(ics)).toContain(trigger);
  });

  test('description, catégorie et étiquettes voyagent, échappées', () => {
    const ics = toIcs(
      [task({ description: 'Apporter, la carte; vitale', category: 'Santé', tags: ['perso'] })],
      { maintenant: MAINTENANT }
    );

    const l = lignes(ics);
    expect(l).toContain('DESCRIPTION:Apporter\\, la carte\\; vitale');
    expect(l).toContain('CATEGORIES:Santé,perso');
  });

  test('un titre piégé ne crée aucune propriété', () => {
    const ics = toIcs([task({ title: 'Réunion\r\nRRULE:FREQ=SECONDLY' })], {
      maintenant: MAINTENANT,
    });

    expect(lignes(ics).filter((x) => x.startsWith('RRULE'))).toEqual([]);
  });

  test('un cahier sans rien de daté reste un calendrier valide', () => {
    const ics = toIcs([], { maintenant: MAINTENANT });

    expect(lignes(ics)).toContain('BEGIN:VCALENDAR');
    expect(lignes(ics)).not.toContain('BEGIN:VEVENT');
  });
});
