import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/* ---------------------------------------------------------------------------
   app.js est un module à effets de bord : l'importer amorce l'application sur
   le DOM courant. On lui sert donc le vrai index.html et un faux serveur dont
   on peut retenir les réponses, pour vérifier ce qui se passe quand elles
   reviennent dans le désordre.
   --------------------------------------------------------------------------- */

// import.meta.url pointe sur http:// dans l'environnement de test : on part de
// la racine du projet, où vitest est lancé
const HTML = readFileSync(resolve(process.cwd(), 'public/index.html'), 'utf8');
const BODY = HTML.slice(HTML.indexOf('<body>') + '<body>'.length, HTML.indexOf('</body>')).replace(
  /<script[\s\S]*?<\/script>/g,
  ''
);

const task = (title, extra = {}) => ({
  _id: `id-${title}`,
  title,
  description: '',
  completed: false,
  dueDate: null,
  category: '',
  priority: '',
  ...extra,
});

let server;

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

const listFor = (url) => {
  const params = new URL(url, 'http://test').searchParams;
  const q = (params.get('q') || '').toLowerCase();
  const status = params.get('status') || 'all';

  let tasks = server.tasks;
  if (q) tasks = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (status === 'done') tasks = tasks.filter((t) => t.completed);
  if (status === 'active') tasks = tasks.filter((t) => !t.completed);
  if (params.get('due') === 'overdue') {
    tasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date());
  }

  return { tasks, total: tasks.length, totalPages: 1, currentPage: 1 };
};

const idFrom = (url) => url.replace('/tasks/', '').replace('/restore', '').replace('/purge', '');

/** Applique la mutation au faux serveur, comme le ferait l'API. */
const mutate = (url, method, body) => {
  const id = idFrom(url);

  if (method === 'DELETE' && url.endsWith('/purge')) {
    const purged = url.replace('/tasks/', '').replace('/purge', '');
    server.trash = server.trash.filter((entry) => entry.task._id !== purged);
    return { message: 'Tâche supprimée définitivement' };
  }

  if (method === 'DELETE') {
    const index = server.tasks.findIndex((t) => t._id === id);
    server.trash.push({ index, task: server.tasks[index] });
    server.tasks = server.tasks.filter((t) => t._id !== id);
    return { message: 'Tâche supprimée' };
  }

  if (method === 'POST' && url.endsWith('/restore')) {
    const entry = server.trash.pop();
    server.tasks = [
      ...server.tasks.slice(0, entry.index),
      entry.task,
      ...server.tasks.slice(entry.index),
    ];
    return entry.task;
  }

  // avant la branche générique : sans cela, un PUT /preferences serait pris
  // pour la modification d'une tâche nommée « preferences »
  if (method === 'PUT' && url === '/preferences') {
    server.preferences = Object.fromEntries(
      Object.entries(server.preferences).map(([section, reglages]) => [
        section,
        { ...reglages, ...(body[section] || {}) },
      ])
    );
    return server.preferences;
  }

  if (method === 'PUT') {
    server.tasks = server.tasks.map((t) => (t._id === id ? { ...t, ...body } : t));
    return server.tasks.find((t) => t._id === id);
  }

  if (method === 'PATCH' && url === '/tasks/due') {
    const cible = new Map(body.items.map(({ id, dueDate }) => [id, dueDate]));
    server.tasks = server.tasks.map((t) =>
      cible.has(t._id) ? { ...t, dueDate: cible.get(t._id) } : t
    );
    return { modified: cible.size };
  }

  if (method === 'POST' && url === '/tasks/bulk') {
    const pris = new Set(body.ids);
    const champ = {
      complete: { completed: true },
      uncomplete: { completed: false },
      category: { category: body.value },
      priority: { priority: body.value },
    }[body.action];
    if (body.action === 'delete') {
      server.tasks.forEach((t, index) => {
        if (pris.has(t._id)) server.trash.push({ index, task: t });
      });
      server.tasks = server.tasks.filter((t) => !pris.has(t._id));
    } else {
      server.tasks = server.tasks.map((t) => (pris.has(t._id) ? { ...t, ...champ } : t));
    }
    return { modified: pris.size };
  }

  if (method === 'PATCH' && url.endsWith('/order')) {
    return { message: 'ordre mis à jour' };
  }

  if (method === 'POST' && url.startsWith('/systeme/maj/')) return server.systeme;

  return {};
};

const bodyFor = (url, method, body) => {
  if (method !== 'GET') return mutate(url, method, body);
  if (url.startsWith('/preferences/schema')) return server.schema;
  if (url.startsWith('/preferences')) return server.preferences;
  if (url.startsWith('/systeme')) return server.systeme;
  if (/^\/tasks\/[^/]+\/children$/.test(url)) {
    const id = url.split('/')[2];
    return { tasks: server.children[id] || [], total: (server.children[id] || []).length };
  }
  if (url.startsWith('/tasks/stats')) return server.stats;
  if (url.startsWith('/tasks/trash')) {
    const tasks = server.trash.map((entry) => entry.task);
    return { tasks, total: tasks.length, totalPages: 1, currentPage: 1 };
  }
  if (url.startsWith('/tasks?')) return listFor(url);
  if (url.startsWith('/categories')) return server.categories;
  return {};
};

// app.js (et les modules qu'il importe en cascade, tel modal.js) posent des
// écouteurs sur `document`, qui survit au remplacement du <body> : sans ce
// suivi, chaque test traînerait les écouteurs de tous les tests précédents,
// qui rejoueraient leurs actions sur les données du test en cours.
let bootListeners = [];

const boot = async () => {
  document.body.innerHTML = BODY;
  // l'apparence est mise en miroir dans le stockage local : sans ce nettoyage,
  // un test ouvrirait la page sur l'apparence reglee par le precedent
  document.documentElement.removeAttribute('data-densite');
  document.documentElement.removeAttribute('data-crayon');
  localStorage.clear();
  vi.resetModules();

  const add = document.addEventListener.bind(document);
  const spy = vi.spyOn(document, 'addEventListener').mockImplementation((...args) => {
    bootListeners.push(args);
    add(...args);
  });
  await import('../../public/js/app.js');
  spy.mockRestore();

  await settle();
};

/** Laisse les promesses en attente se dénouer (et le debounce s'écouler). */
const settle = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

const titles = () =>
  [...document.querySelectorAll('.task-title')].map((el) => el.textContent.trim());

const calls = (method = 'GET') => server.calls.filter((c) => c.method === method).map((c) => c.url);

beforeEach(() => {
  server = {
    tasks: [task('Relire le brief'), task('Arroser les plantes', { completed: true })],
    stats: { total: 2, done: 1, active: 1, byCategory: [{ category: 'Perso', count: 1 }] },
    categories: [{ _id: 'c1', name: 'Perso', color: '#2f7d51' }],
    calls: [],
    held: [],
    trash: [],
    children: {},
    hold: false,
    failNextPost: false,
    preferences: {
      apparence: { densite: 'confort', taille: 'normale', grain: true, crayon: true },
      ouverture: { statut: 'all', horizon: 'all', tri: 'creation' },
      misesAJour: { prevenir: true },
    },
    schema: {
      sections: { apparence: { titre: 'Apparence', note: null } },
      schema: {
        apparence: {
          densite: {
            libelle: 'Densité',
            type: 'choix',
            valeurs: [
              { valeur: 'confort', libelle: 'Confort' },
              { valeur: 'compact', libelle: 'Compact' },
            ],
            defaut: 'confort',
          },
        },
      },
    },
    systeme: {
      version: '3.0.1',
      dossierDonnees: 'C:\Cahier\db',
      maj: { etape: 'inactive', version: null, progression: 0, message: null },
    },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn((url, options = {}) => {
      const method = options.method || 'GET';
      server.calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null });

      if (server.failBulk && url === '/tasks/bulk') {
        server.failBulk = false;
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: 'Trop d’identifiants' }),
        });
      }

      if (server.failNextPost && method === 'POST' && url === '/tasks') {
        server.failNextPost = false;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Erreur interne du serveur' }),
        });
      }

      // les listes peuvent être retenues pour rejouer un désordre de réponses
      if (server.hold && url.startsWith('/tasks?')) {
        return new Promise((resolve) => {
          server.held.push(() => resolve(ok(listFor(url))));
        });
      }
      const body = options.body ? JSON.parse(options.body) : null;
      return Promise.resolve(ok(bodyFor(url, method, body)));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  bootListeners.forEach((args) => document.removeEventListener(...args));
  bootListeners = [];
  document.body.innerHTML = '';
});

describe('chargement initial', () => {
  test('affiche la page reçue et les compteurs du serveur', async () => {
    await boot();

    expect(titles()).toEqual(['Relire le brief', 'Arroser les plantes']);
    expect(document.getElementById('stat-total').textContent).toBe('2');
    expect(document.getElementById('stat-done').textContent).toBe('1');
    expect(document.getElementById('stat-active').textContent).toContain('1');
  });

  test('demande la première page avec le tri et les filtres par défaut', async () => {
    await boot();

    const url = calls().find((u) => u.startsWith('/tasks?'));
    const params = new URL(url, 'http://test').searchParams;
    expect(params.get('page')).toBe('1');
    expect(params.get('limit')).toBe('5');
    expect(params.get('sort')).toBe('creation');
    expect(params.get('status')).toBe('all');
  });

  test('les compteurs de catégorie viennent de /tasks/stats, pas de la page', async () => {
    await boot();

    const rows = [...document.querySelectorAll('.cat-item')].map((li) =>
      li.querySelector('.cat-count').textContent.trim()
    );
    expect(rows[0]).toBe('2'); // toutes les tâches
    expect(rows[1]).toBe('1'); // Perso, compté sur toute la base
  });

  test('barre les tâches terminées d’un trait', async () => {
    await boot();

    const done = document.querySelector('.task.is-done .task-title');
    expect(done.dataset.sketched).toBe('strike');
  });
});

describe('sélection', () => {
  const ligne = (titre) =>
    [...document.querySelectorAll('.task')].find((li) =>
      li.querySelector('.task-title').textContent.includes(titre)
    );
  const ctrlClic = (el) =>
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  const barre = () => document.getElementById('barre-lot');
  const lot = () => server.calls.filter((c) => c.method === 'POST' && c.url === '/tasks/bulk');
  const press = (key) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  test('la barre reste cachée tant que rien n’est pris', async () => {
    await boot();

    expect(barre().hidden).toBe(true);
  });

  test('Ctrl+clic prend une ligne et fait paraître la barre', async () => {
    await boot();

    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    expect(ligne('Relire le brief').classList.contains('is-selected')).toBe(true);
    expect(barre().hidden).toBe(false);
    expect(document.getElementById('barre-lot-compte').textContent).toBe('1 tâche choisie');
  });

  test('un second Ctrl+clic la rend', async () => {
    await boot();
    const corps = ligne('Relire le brief').querySelector('.task-body');

    ctrlClic(corps);
    ctrlClic(corps);

    expect(barre().hidden).toBe(true);
  });

  test('Ctrl+clic sur un bouton de la ligne garde le sens du bouton', async () => {
    await boot();

    // sélectionner en voulant ouvrir « Modifier » serait surprendre
    ctrlClic(ligne('Relire le brief').querySelector('.edit'));

    expect(barre().hidden).toBe(true);
  });

  test('« Rayer » part en un seul envoi, puis vide la sélection', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    ctrlClic(ligne('Arroser les plantes').querySelector('.task-body'));

    document.querySelector('[data-lot="rayer"]').click();
    await settle();

    expect(lot()).toHaveLength(1);
    expect(lot()[0].body).toEqual({
      ids: ['id-Relire le brief', 'id-Arroser les plantes'],
      action: 'complete',
    });
    expect(barre().hidden).toBe(true);
    expect(document.querySelectorAll('.task.is-selected')).toHaveLength(0);
  });

  test('« Annuler » défait le lot', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    document.querySelector('[data-lot="rayer"]').click();
    await settle();

    document.querySelector('.toast-action').click();
    await settle();

    expect(lot().at(-1).body).toEqual({ ids: ['id-Relire le brief'], action: 'uncomplete' });
    expect(ligne('Relire le brief').classList.contains('is-done')).toBe(false);
  });

  test('supprimer en lot puis annuler rend chaque tâche', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    ctrlClic(ligne('Arroser les plantes').querySelector('.task-body'));

    document.querySelector('[data-lot="supprimer"]').click();
    await settle();
    expect(titles()).toEqual([]);

    document.querySelector('.toast-action').click();
    await settle();

    const restaurees = server.calls.filter((c) => c.url.endsWith('/restore'));
    expect(restaurees).toHaveLength(2);
    expect(titles()).toHaveLength(2);
  });

  test('ranger la sélection dans une catégorie', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    const menu = document.getElementById('barre-lot-categorie');

    menu.dispatchEvent(new Event('focus'));
    menu.value = 'Perso';
    menu.dispatchEvent(new Event('change'));
    await settle();

    expect(lot()[0].body).toEqual({
      ids: ['id-Relire le brief'],
      action: 'category',
      value: 'Perso',
    });
    // le menu revient sur son invite : il sert de bouton, pas de réglage
    expect(menu.selectedIndex).toBe(0);
  });

  test('le menu des catégories est à jour dès que la barre paraît', async () => {
    await boot();

    // les catégories arrivent après l'amorçage : un menu rempli une fois pour
    // toutes au démarrage resterait vide, sauf pour qui passe par le focus
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    const noms = [...document.querySelectorAll('#barre-lot-categorie option')].map(
      (o) => o.textContent
    );
    expect(noms).toContain('Perso');
  });

  test('« Sans catégorie » retire la catégorie', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    const menu = document.getElementById('barre-lot-categorie');

    menu.dispatchEvent(new Event('focus'));
    menu.value = '∅';
    menu.dispatchEvent(new Event('change'));
    await settle();

    expect(lot()[0].body.value).toBe('');
  });

  test('reporter la sélection à demain passe par le report en bloc', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    document.querySelector('[data-lot="demain"]').click();
    await settle();

    const patch = server.calls.find((c) => c.method === 'PATCH' && c.url === '/tasks/due');
    expect(patch.body.items).toHaveLength(1);
    expect(patch.body.items[0].id).toBe('id-Relire le brief');
  });

  test('`s` prend la ligne du curseur, Échap vide la sélection', async () => {
    await boot();

    press('j');
    press('s');
    expect(ligne('Relire le brief').classList.contains('is-selected')).toBe(true);

    press('Escape');
    expect(barre().hidden).toBe(true);
  });

  test('mettre la sélection dans ma journée, puis annuler', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    document.querySelector('[data-lot="journee"]').click();
    await settle();
    const poses = server.calls.filter((c) => c.method === 'PUT' && c.body?.myDay !== undefined);
    expect(poses).toHaveLength(1);
    expect(typeof poses[0].body.myDay).toBe('string');

    document.querySelector('.toast-action').click();
    await settle();

    // la tâche n'était dans aucune journée : l'annulation l'en retire
    const retrait = server.calls.filter((c) => c.method === 'PUT').at(-1);
    expect(retrait.body).toEqual({ myDay: null });
  });

  test('changer la priorité de la sélection, puis annuler tâche par tâche', async () => {
    server.tasks = [task('Relire le brief', { priority: 'low' }), task('Arroser les plantes')];
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    ctrlClic(ligne('Arroser les plantes').querySelector('.task-body'));
    const menu = document.getElementById('barre-lot-priorite');

    menu.value = 'high';
    menu.dispatchEvent(new Event('change'));
    await settle();
    expect(lot()[0].body).toMatchObject({ action: 'priority', value: 'high' });

    document.querySelector('.toast-action').click();
    await settle();

    // chacune retrouve SA priorité d'avant, pas une valeur commune
    const remises = server.calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(remises).toEqual([{ priority: 'low' }, { priority: '' }]);
  });

  test('« Sans priorité » efface la priorité', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    const menu = document.getElementById('barre-lot-priorite');

    menu.value = '∅';
    menu.dispatchEvent(new Event('change'));
    await settle();

    expect(lot()[0].body.value).toBe('');
  });

  test('annuler un report rend sa date à chacune, et l’absence de date aussi', async () => {
    const hier = new Date(Date.now() - 86400000).toISOString();
    server.tasks = [task('Relire le brief', { dueDate: hier }), task('Arroser les plantes')];
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    ctrlClic(ligne('Arroser les plantes').querySelector('.task-body'));

    document.querySelector('[data-lot="demain"]').click();
    await settle();
    document.querySelector('.toast-action').click();
    await settle();

    const remises = server.calls.filter((c) => c.method === 'PATCH' && c.url === '/tasks/due');
    expect(remises.at(-1).body.items).toEqual([{ id: 'id-Relire le brief', dueDate: hier }]);
    // le report en bloc refuse une date vide : la tâche sans date repasse à l'unité
    const aLUnite = server.calls.find((c) => c.method === 'PUT');
    expect(aLUnite).toMatchObject({
      url: '/tasks/id-Arroser les plantes',
      body: { dueDate: null },
    });
  });

  test('le × vide la sélection sans rien envoyer', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    document.querySelector('[data-lot="vider"]').click();

    expect(barre().hidden).toBe(true);
    expect(lot()).toHaveLength(0);
  });

  test('un lot refusé le dit, et la liste est relue', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));
    server.failBulk = true;
    const lecturesAvant = calls().filter((u) => u.startsWith('/tasks?')).length;

    document.querySelector('[data-lot="rayer"]').click();
    await settle();

    expect(document.querySelector('.toast.error').textContent).toContain('Trop d’identifiants');
    expect(calls().filter((u) => u.startsWith('/tasks?')).length).toBeGreaterThan(lecturesAvant);
  });

  test('la palette prend toute la page', async () => {
    await boot();
    press('k', { ctrlKey: true });
    const input = document.getElementById('palette-input');
    input.value = 'Choisir';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('#palette-list .palette-item').click();
    await settle();

    expect(document.getElementById('barre-lot-compte').textContent).toBe('2 tâches choisies');
  });

  test('Échap sans sélection ne fait rien de plus', async () => {
    await boot();

    expect(() => press('Escape')).not.toThrow();
    expect(barre().hidden).toBe(true);
  });

  test('la sélection survit au rechargement de la liste', async () => {
    await boot();
    ctrlClic(ligne('Relire le brief').querySelector('.task-body'));

    // un rechargement redessine chaque ligne : la marque doit être reposée
    document.querySelector('.task-myday').click();
    await settle();

    expect(ligne('Relire le brief').classList.contains('is-selected')).toBe(true);
  });
});

describe('tâches par page', () => {
  const limites = () =>
    calls()
      .filter((u) => u.startsWith('/tasks?'))
      .map((u) => new URL(u, 'http://test').searchParams.get('limit'));

  test('la liste demande le nombre réglé dès le premier chargement', async () => {
    server.preferences = { ...server.preferences, liste: { parPage: '20' } };

    await boot();

    // pas de première page à cinq puis d'une seconde à vingt : ce serait une
    // requête de trop, et une liste qui saute sous les yeux
    expect(limites()).toEqual(['20']);
  });

  test('sans réglage, la page reste à cinq', async () => {
    await boot();

    expect(limites()).toEqual(['5']);
  });

  test('changer le réglage recharge la liste à la nouvelle taille', async () => {
    // un vrai serveur rend toujours le document complet, section neuve comprise
    server.preferences = { ...server.preferences, liste: { parPage: '5' } };
    server.schema = {
      sections: { liste: { titre: 'La liste', note: null } },
      schema: {
        liste: {
          parPage: {
            libelle: 'Tâches par page',
            type: 'choix',
            valeurs: ['5', '10', '20', '50'].map((v) => ({ valeur: v, libelle: v })),
            defaut: '5',
          },
        },
      },
    };
    await boot();
    document.getElementById('open-settings').click();
    await settle();

    const champ = document.querySelector('[data-reglage="liste.parPage"] .reglage-controle');
    champ.value = '50';
    champ.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(limites().at(-1)).toBe('50');
  });
});

describe('bilan', () => {
  /** Sept jours finissant aujourd'hui, avec les comptes donnés. */
  const semaineDe = (comptes) =>
    comptes.map((n, i) => {
      const jour = new Date();
      jour.setHours(0, 0, 0, 0);
      jour.setDate(jour.getDate() - (6 - i));
      return { jour: jour.toISOString(), n };
    });

  const avecBilan = (comptes) => {
    server.stats = {
      ...server.stats,
      bilan: { aujourdhui: comptes.at(-1), semaine: semaineDe(comptes) },
    };
  };

  test('sept barres, une par jour, la plus haute pour le jour le plus rempli', async () => {
    avecBilan([1, 0, 4, 0, 0, 2, 2]);
    await boot();

    const barres = [...document.querySelectorAll('#bilan .bilan-barre')];
    expect(barres).toHaveLength(7);
    expect(barres[2].style.getPropertyValue('--hauteur')).toBe('100%');
    expect(barres[1].style.getPropertyValue('--hauteur')).toBe('0%');
    expect(barres.at(-1).classList.contains('is-today')).toBe(true);
  });

  test('se lit aussi sans les yeux', async () => {
    avecBilan([1, 0, 4, 0, 0, 2, 3]);
    await boot();

    const label = document.getElementById('bilan-barres').getAttribute('aria-label');
    expect(label).toMatch(/^Rayées ces sept derniers jours : /);
    expect(label).toContain('aujourd’hui 3');
  });

  test('le sous-titre salue ce qui a été rayé aujourd’hui', async () => {
    avecBilan([0, 0, 0, 0, 0, 0, 2]);
    await boot();

    expect(document.getElementById('subtitle').textContent).toContain('2 rayées aujourd’hui');
  });

  test('rien de rayé aujourd’hui : le sous-titre n’en parle pas', async () => {
    avecBilan([3, 0, 0, 0, 0, 0, 0]);
    await boot();

    // « 0 rayée aujourd'hui » serait un reproche, pas un bilan
    expect(document.getElementById('subtitle').textContent).not.toContain('aujourd’hui');
  });

  test('un serveur qui ne sait pas faire de bilan ne montre pas une semaine vide', async () => {
    await boot();

    expect(document.getElementById('bilan').hidden).toBe(true);
  });
});

describe('thème', () => {
  test('la catégorie active est surlignée à l’encre du thème, pas d’un jaune figé', async () => {
    await boot();

    // un jaune vif en dur resterait sous l'encre pâle du carnet de nuit, et
    // rendrait le nom de la catégorie illisible
    const surligne = document.querySelector('.cat-name[data-sketch="highlight"]');
    expect(surligne.dataset.stroke).toBe('var(--highlighter)');
  });
});

describe('recherche', () => {
  test('envoie le terme au serveur après le délai de frappe', async () => {
    await boot();
    server.calls.length = 0;

    const input = document.getElementById('search-input');
    input.value = 'brief';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(250);

    const url = calls().find((u) => u.includes('q=brief'));
    expect(url).toBeDefined();
    expect(new URL(url, 'http://test').searchParams.get('page')).toBe('1');
    expect(titles()).toEqual(['Relire le brief']);
  });

  test('une réponse en retard n’écrase pas un résultat plus récent', async () => {
    await boot();
    server.hold = true;

    const input = document.getElementById('search-input');
    input.value = 'brief';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(200);

    input.value = 'plantes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(200);

    expect(server.held).toHaveLength(2);

    // la seconde requête répond d'abord, la première arrive en retard
    server.held[1]();
    await settle();
    server.held[0]();
    await settle();

    expect(titles()).toEqual(['Arroser les plantes']);
  });
});

describe('filtres', () => {
  test('la pastille de statut relance une requête filtrée', async () => {
    await boot();
    server.calls.length = 0;

    document.querySelector('[data-filter="done"]').click();
    await settle();

    const url = calls().find((u) => u.startsWith('/tasks?'));
    expect(new URL(url, 'http://test').searchParams.get('status')).toBe('done');
    expect(titles()).toEqual(['Arroser les plantes']);
  });

  test('la pastille active est redessinée pleine', async () => {
    await boot();

    const pill = document.querySelector('[data-filter="done"]');
    pill.click();
    await settle();

    expect(pill.dataset.variant).toBe('solid');
    expect(document.querySelector('[data-filter="all"]').dataset.variant).toBeUndefined();
  });
});

describe('bascule optimiste', () => {
  test('coche la tâche à l’écran avant la réponse du serveur', async () => {
    await boot();
    server.hold = true;

    const item = [...document.querySelectorAll('.task')].find((li) =>
      li.querySelector('.task-title').textContent.includes('Relire')
    );
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    // la liste est redessinée avant même que le PUT ait répondu
    expect(document.querySelectorAll('.task.is-done')).toHaveLength(2);
    expect(document.getElementById('stat-done').textContent).toBe('2');
    expect(document.getElementById('stat-active').textContent).toContain('0');

    const put = server.calls.find((c) => c.method === 'PUT');
    expect(put.url).toBe('/tasks/id-Relire le brief');
    expect(server.held.length).toBeGreaterThan(0); // le rafraîchissement est encore en vol
  });
});

describe('suppression annulable', () => {
  test('retire la carte, propose « Annuler », et restaure au clic', async () => {
    await boot();

    document.querySelector('.task .delete').click();
    await settle();

    expect(titles()).toEqual(['Arroser les plantes']);
    expect(server.calls.some((c) => c.method === 'DELETE')).toBe(true);

    const undo = document.querySelector('.toast-action');
    expect(undo.textContent).toBe('Annuler');

    undo.click();
    await settle();

    const restore = server.calls.find((c) => c.method === 'POST' && c.url.endsWith('/restore'));
    expect(restore.url).toBe('/tasks/id-Relire le brief/restore');
    expect(titles()).toEqual(['Relire le brief', 'Arroser les plantes']);
  });

  test('la note d’annulation disparaît une fois cliquée', async () => {
    await boot();

    document.querySelector('.task .delete').click();
    await settle();
    document.querySelector('.toast-action').click();
    await settle();

    expect(document.querySelector('.toast-action')).toBeNull();
  });
});

describe('état vide', () => {
  test('distingue une recherche sans résultat d’un cahier vierge', async () => {
    await boot();

    const input = document.getElementById('search-input');
    input.value = 'introuvable';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(250);

    expect(document.getElementById('empty-state').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.empty-title').textContent).toBe('Rien sous ce mot.');
    expect(document.querySelector('.empty-sub').textContent).toContain('introuvable');
  });
});

describe('onglets temporels', () => {
  const lastListUrl = () =>
    calls()
      .filter((u) => u.startsWith('/tasks?'))
      .pop();

  test('la vue par défaut ne contraint pas l’échéance', async () => {
    await boot();
    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('due')).toBe('all');
  });

  test('cliquer un onglet relance la liste sur cet horizon, page 1', async () => {
    await boot();
    server.calls = [];

    document.querySelector('.due-pill[data-due="today"]').click();
    await settle();

    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('due')).toBe('today');
    expect(params.get('page')).toBe('1');
  });

  test('l’onglet « en retard » aligne le statut sur ce que compte le badge', async () => {
    await boot();
    server.calls = [];

    document.querySelector('.due-pill[data-due="overdue"]').click();
    await settle();

    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('due')).toBe('overdue');
    expect(params.get('status')).toBe('active');
    // l'interface ne doit pas afficher « Toutes » en filtrant sur « À faire »
    const statusPill = document.querySelector('.pill[data-filter="active"]');
    expect(statusPill.classList.contains('is-active')).toBe(true);
  });

  test('élargir le statut quitte l’horizon « en retard » au lieu de le faire mentir', async () => {
    await boot();
    document.querySelector('.due-pill[data-due="overdue"]').click();
    await settle();
    server.calls = [];

    document.querySelector('.pill[data-filter="done"]').click();
    await settle();

    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('status')).toBe('done');
    expect(params.get('due')).toBe('all');
    expect(
      document.querySelector('.due-pill[data-due="all"]').classList.contains('is-active')
    ).toBe(true);
  });

  test('revenir sur « à faire » ne quitte pas l’horizon : rien ne se contredit', async () => {
    await boot();
    document.querySelector('.due-pill[data-due="overdue"]').click();
    await settle();
    server.calls = [];

    document.querySelector('.pill[data-filter="active"]').click();
    await settle();

    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('status')).toBe('active');
    expect(params.get('due')).toBe('overdue');
  });

  test('l’état de sélection est exposé aux aides techniques', async () => {
    await boot();
    document.querySelector('.due-pill[data-due="today"]').click();
    await settle();

    expect(document.querySelector('.due-pill[data-due="today"]').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(document.querySelector('.due-pill[data-due="all"]').getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  test('le badge nomme ce qu’il compte', async () => {
    server.stats = { ...server.stats, overdue: 2 };
    await boot();

    const pill = document.querySelector('.due-pill[data-due="overdue"]');
    expect(pill.getAttribute('aria-label')).toBe('En retard, 2 tâches');
  });

  test('les autres horizons laissent le statut tranquille', async () => {
    await boot();
    server.calls = [];

    document.querySelector('.due-pill[data-due="week"]').click();
    await settle();

    expect(new URL(lastListUrl(), 'http://test').searchParams.get('status')).toBe('all');
    expect(document.querySelector('.pill[data-filter="all"]').classList.contains('is-active')).toBe(
      true
    );
  });

  test('l’onglet actif est le seul marqué', async () => {
    await boot();
    document.querySelector('.due-pill[data-due="overdue"]').click();
    await settle();

    const active = [...document.querySelectorAll('.due-pill.is-active')].map(
      (el) => el.dataset.due
    );
    expect(active).toEqual(['overdue']);
  });

  test('le badge affiche le nombre de tâches en retard', async () => {
    server.stats = { ...server.stats, overdue: 3 };
    await boot();

    const badge = document.getElementById('due-overdue-count');
    expect(badge.textContent).toBe('3');
    expect(badge.hidden).toBe(false);
  });

  test('le badge disparaît quand rien n’est en retard', async () => {
    server.stats = { ...server.stats, overdue: 0 };
    await boot();

    expect(document.getElementById('due-overdue-count').hidden).toBe(true);
  });

  test('un horizon vide affiche un état vide qui le dit', async () => {
    server.tasks = [];
    server.stats = { total: 0, done: 0, active: 0, overdue: 0, byCategory: [] };
    await boot();

    document.querySelector('.due-pill[data-due="week"]').click();
    await settle();

    expect(document.getElementById('empty-state').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('.empty-title').textContent).toBe('Rien sur cet horizon.');
  });
});

describe('saisie rapide', () => {
  const type = (value) => {
    const input = document.getElementById('task-title');
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const posted = () => server.calls.filter((c) => c.method === 'POST' && c.url === '/tasks').length;

  test('l’aperçu montre ce qui a été compris', async () => {
    await boot();
    type('Dentiste demain 14h #Perso !haute');
    await settle();

    const chips = [...document.querySelectorAll('#quick-preview .chip')].map((el) =>
      el.textContent.trim()
    );
    expect(chips).toContain('demain');
    expect(chips).toContain('#Perso');
    expect(chips).toContain('!haute');
  });

  test('l’aperçu se vide quand le texte ne contient plus de motif', async () => {
    await boot();
    type('Dentiste demain');
    await settle();
    expect(document.getElementById('quick-preview').hidden).toBe(false);

    type('Dentiste');
    await settle();
    expect(document.getElementById('quick-preview').hidden).toBe(true);
  });

  test('envoyer poste le titre nettoyé et les champs déduits', async () => {
    await boot();
    type('Dentiste demain 14h #Perso !haute');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    const call = server.calls.find((c) => c.method === 'POST' && c.url === '/tasks');
    expect(call).toBeTruthy();
    expect(call.body.title).toBe('Dentiste');
    expect(call.body.category).toBe('Perso');
    expect(call.body.priority).toBe('high');
    expect(call.body.dueDate).not.toBeNull();
  });

  test('un choix fait à la souris l’emporte sur le texte', async () => {
    await boot();
    document.getElementById('task-priority').value = 'low';
    type('Dentiste !haute');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    const call = server.calls.find((c) => c.method === 'POST' && c.url === '/tasks');
    expect(call.body.priority).toBe('low');
  });

  test('un texte qui ne laisse aucun titre n’est pas envoyé', async () => {
    await boot();
    const before = posted();
    type('#Perso !haute');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    expect(posted()).toBe(before);
  });

  test('l’aperçu annonce la date à laquelle l’échéance retombe', async () => {
    await boot();
    type('Appel demain 14h');
    await settle();

    const resolved = document.querySelector('#quick-preview .chip[data-type="resolved"]');
    expect(resolved).toBeTruthy();
    expect(resolved.textContent).toContain('Demain');
  });

  test('un titre réduit aux étiquettes est refusé à voix haute', async () => {
    await boot();
    type('#Perso !haute');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    expect(document.querySelectorAll('#toast-container .toast').length).toBeGreaterThan(0);
    expect(document.activeElement.id).toBe('task-title');
  });

  test('une catégorie choisie à la souris l’emporte aussi', async () => {
    await boot();
    document.getElementById('task-category').value = 'Perso';
    type('Courses #Divers');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    const call = server.calls.find((c) => c.method === 'POST' && c.url === '/tasks');
    expect(call.body.category).toBe('Perso');
  });

  test('créer une tâche ne réinitialise pas le tri', async () => {
    await boot();
    const sort = document.getElementById('sort-select');
    sort.value = 'dueDate';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    server.calls = [];

    type('Courses');
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    expect(sort.value).toBe('dueDate');
    const url = server.calls.filter((c) => c.url.startsWith('/tasks?')).pop().url;
    expect(new URL(url, 'http://test').searchParams.get('sort')).toBe('dueDate');
  });

  test('un envoi qui échoue laisse l’aperçu intact', async () => {
    await boot();
    type('Dentiste demain');
    await settle();
    const before = document.getElementById('quick-preview').innerHTML;

    server.failNextPost = true;
    document.getElementById('task-form').dispatchEvent(new Event('submit', { bubbles: true }));
    await settle();

    expect(document.getElementById('quick-preview').innerHTML).toBe(before);
    expect(document.getElementById('quick-preview').hidden).toBe(false);
    expect(document.getElementById('task-title').value).toBe('Dentiste demain');
  });
});

describe('corbeille', () => {
  const trashFirstTask = async () => {
    document.querySelector('.task .delete').click();
    await settle();
  };

  test('ouvrir la corbeille liste les tâches supprimées', async () => {
    await boot();
    await trashFirstTask();

    document.getElementById('open-trash').click();
    await settle();

    expect(document.getElementById('trash-modal').classList.contains('active')).toBe(true);
    const rows = [...document.querySelectorAll('#trash-list .trash-title')].map((el) =>
      el.textContent.trim()
    );
    expect(rows).toEqual(['Relire le brief']);
  });

  test('restaurer remet la tâche dans la liste', async () => {
    await boot();
    await trashFirstTask();
    expect(titles()).not.toContain('Relire le brief');

    document.getElementById('open-trash').click();
    await settle();
    document.querySelector('#trash-list .trash-restore').click();
    await settle();

    expect(titles()).toContain('Relire le brief');
  });

  test('purger demande confirmation puis supprime définitivement', async () => {
    await boot();
    await trashFirstTask();

    document.getElementById('open-trash').click();
    await settle();
    document.querySelector('#trash-list .trash-purge').click();
    await settle();

    // premier clic : la ligne passe en mode confirmation, rien n'est envoyé
    expect(server.calls.some((c) => c.url.endsWith('/purge'))).toBe(false);

    document.querySelector('#trash-list .trash-purge').click();
    await settle();

    expect(server.calls.some((c) => c.url.endsWith('/purge'))).toBe(true);
    expect(document.querySelectorAll('#trash-list .trash-row')).toHaveLength(0);
  });

  test('une corbeille vide le dit', async () => {
    await boot();
    document.getElementById('open-trash').click();
    await settle();

    expect(document.getElementById('trash-empty').hidden).toBe(false);
  });

  test('purger la dernière ligne ne fait pas perdre le focus', async () => {
    await boot();
    await trashFirstTask();

    document.getElementById('open-trash').click();
    await settle();

    const purge = document.querySelector('#trash-list .trash-purge');
    purge.focus();
    purge.click();
    await settle();
    document.querySelector('#trash-list .trash-purge').click();
    await settle();

    // la ligne focalisée vient d'être détruite : le focus doit rester dans la
    // modale, pas retomber sur <body>
    expect(document.getElementById('trash-modal').contains(document.activeElement)).toBe(true);
    expect(document.activeElement.id).toBe('close-trash');
  });

  test('ouvrir la corbeille laisse openModal placer le focus', async () => {
    await boot();
    await trashFirstTask();

    document.getElementById('open-trash').click();
    await settle();

    // le garde hadFocus ne doit pas détourner le focus initial de openModal
    expect(document.getElementById('trash-modal').contains(document.activeElement)).toBe(true);
  });
});

describe('clavier', () => {
  const press = (key, options = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));

  test('n met le focus sur le champ de saisie', async () => {
    await boot();
    press('n');
    expect(document.activeElement.id).toBe('task-title');
  });

  test('les raccourcis ne se déclenchent pas depuis un champ', async () => {
    await boot();
    const search = document.getElementById('search-input');
    search.focus();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));

    expect(document.activeElement.id).toBe('search-input');
  });

  test('j et k déplacent la sélection dans la liste', async () => {
    await boot();
    press('j');
    expect(document.querySelectorAll('.task')[0].classList.contains('is-cursor')).toBe(true);

    press('j');
    expect(document.querySelectorAll('.task')[1].classList.contains('is-cursor')).toBe(true);

    press('k');
    expect(document.querySelectorAll('.task')[0].classList.contains('is-cursor')).toBe(true);
  });

  test('x coche la tâche sous le curseur', async () => {
    await boot();
    press('j');
    press('x');
    await settle();

    const call = server.calls.find((c) => c.method === 'PUT');
    expect(call.body.completed).toBe(true);
  });

  test('Ctrl+K ouvre la palette', async () => {
    await boot();
    press('k', { ctrlKey: true });

    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(true);
  });

  test('la palette filtre ses commandes', async () => {
    await boot();
    press('k', { ctrlKey: true });

    const input = document.getElementById('palette-input');
    input.value = 'retard';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const labels = [...document.querySelectorAll('#palette-list .palette-item')].map((el) =>
      el.textContent.trim()
    );
    expect(labels).toEqual(['Voir : en retard', 'Reporter les retards à demain']);
  });

  test('la palette sauvegarde sans dépendre d’un bouton de la page', async () => {
    await boot();
    const clics = [];
    const vraiClic = window.HTMLAnchorElement.prototype.click;
    window.HTMLAnchorElement.prototype.click = function () {
      clics.push({ href: this.getAttribute('href'), download: this.hasAttribute('download') });
    };

    try {
      press('k', { ctrlKey: true });
      const input = document.getElementById('palette-input');
      input.value = 'Sauvegarder';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#palette-list .palette-item').click();
      await settle();
    } finally {
      window.HTMLAnchorElement.prototype.click = vraiClic;
    }

    // le lien vit desormais dans les Réglages, donc nulle part tant qu'ils sont
    // fermés : la commande doit savoir télécharger toute seule
    expect(clics).toEqual([{ href: '/export', download: true }]);
  });

  test('choisir une commande de la palette l’exécute et ferme', async () => {
    await boot();
    press('k', { ctrlKey: true });

    const input = document.getElementById('palette-input');
    input.value = 'retard';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#palette-list .palette-item').click();
    await settle();

    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(false);
    const url = calls()
      .filter((u) => u.startsWith('/tasks?'))
      .pop();
    expect(new URL(url, 'http://test').searchParams.get('due')).toBe('overdue');
  });
});

describe('palette au clavier', () => {
  const press = (key, target) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  /** Ouvre la palette et rend son champ, point de départ de chaque test. */
  const openPalette = async () => {
    await boot();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
    return document.getElementById('palette-input');
  };

  const options = () => [...document.querySelectorAll('#palette-list [role="option"]')];

  test('la première commande est sélectionnée à l’ouverture', async () => {
    await openPalette();
    const rows = options();

    expect(rows[0].getAttribute('aria-selected')).toBe('true');
    expect(rows.slice(1).every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  test('flèche bas et flèche haut déplacent la sélection, avec bouclage', async () => {
    const input = await openPalette();
    const last = options().length - 1;

    press('ArrowDown', input);
    expect(options()[1].getAttribute('aria-selected')).toBe('true');

    press('ArrowUp', input);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    press('ArrowUp', input); // depuis la première, on boucle vers la dernière
    expect(options()[last].getAttribute('aria-selected')).toBe('true');

    press('ArrowDown', input); // depuis la dernière, on boucle vers la première
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  test('Entrée exécute la commande sélectionnée et referme la palette', async () => {
    const input = await openPalette();
    press('ArrowDown', input); // sélectionne « Chercher »
    press('Enter', input);

    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(false);
    expect(document.activeElement.id).toBe('search-input');
  });

  test('filtrer remet la sélection sur la première commande de la nouvelle liste', async () => {
    const input = await openPalette();
    press('ArrowDown', input);
    press('ArrowDown', input);
    expect(options()[2].getAttribute('aria-selected')).toBe('true');

    input.value = 'voir';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  test('aucun résultat : pas de sélection, et Entrée ne fait rien', async () => {
    const input = await openPalette();
    input.value = 'introuvable';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(options()).toHaveLength(0);

    press('Enter', input);
    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(true);
  });

  test('Échap continue de fermer la palette', async () => {
    const input = await openPalette();
    press('Escape', input);

    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(false);
  });

  test('le clic à la souris fonctionne toujours, même sur une commande non sélectionnée', async () => {
    await openPalette();
    // la sélection clavier pointe toujours la première commande ; on clique la troisième
    document.querySelectorAll('#palette-list .palette-item')[2].click();
    await settle();

    expect(document.getElementById('palette-modal').classList.contains('active')).toBe(false);
    const url = calls()
      .filter((u) => u.startsWith('/tasks?'))
      .pop();
    expect(new URL(url, 'http://test').searchParams.get('due')).toBe('all');
  });

  test('aria-activedescendant pointe l’identifiant de la commande sélectionnée', async () => {
    const input = await openPalette();
    press('ArrowDown', input);
    const selected = options()[1];

    expect(selected.id).toBeTruthy();
    expect(input.getAttribute('aria-activedescendant')).toBe(selected.id);
  });
});

describe('étapes', () => {
  test('une tâche qui porte des étapes affiche leur compte', async () => {
    server.tasks = [task('Devis', { childCount: 3, childDone: 1 })];
    await boot();

    expect(document.querySelector('.task-steps-count').textContent).toMatch(/1\s*\/\s*3/);
  });

  test('une tâche sans étape n’affiche pas de compte', async () => {
    server.tasks = [task('Simple', { childCount: 0, childDone: 0 })];
    await boot();

    expect(document.querySelector('.task-steps-count')).toBeNull();
  });

  test('déplier une tâche demande ses étapes et les affiche', async () => {
    server.tasks = [task('Devis', { childCount: 1, childDone: 0 })];
    server.children['id-Devis'] = [task('Verser l’acompte', { parentId: 'id-Devis' })];
    await boot();

    document.querySelector('.task-steps-toggle').click();
    await settle();

    const titres = [...document.querySelectorAll('.step-title')].map((e) => e.textContent.trim());
    expect(titres).toEqual(['Verser l’acompte']);
  });

  test('replier masque les étapes sans les redemander', async () => {
    server.tasks = [task('Devis', { childCount: 1, childDone: 0 })];
    server.children['id-Devis'] = [task('Une', { parentId: 'id-Devis' })];
    await boot();

    document.querySelector('.task-steps-toggle').click();
    await settle();
    const appelsApresOuverture = calls().filter((u) => u.includes('/children')).length;

    document.querySelector('.task-steps-toggle').click();
    await settle();

    expect(document.querySelectorAll('.step-title')).toHaveLength(0);
    expect(calls().filter((u) => u.includes('/children'))).toHaveLength(appelsApresOuverture);
  });
});

describe('récurrence', () => {
  test('une tâche récurrente porte un pictogramme', async () => {
    server.tasks = [
      task('Poubelles', { recurrence: { freq: 'weekly', interval: 1, until: null } }),
    ];
    await boot();

    const marque = document.querySelector('.task-recurrence');
    expect(marque).not.toBeNull();
    expect(marque.getAttribute('title')).toMatch(/semaine/i);
  });

  test('une tâche sans récurrence n’en porte pas', async () => {
    server.tasks = [task('Simple')];
    await boot();

    expect(document.querySelector('.task-recurrence')).toBeNull();
  });

  test('le composeur envoie la récurrence choisie', async () => {
    await boot();

    document.getElementById('task-title').value = 'Poubelles';
    document.getElementById('task-due-date').value = '2026-09-22T09:00';
    document.getElementById('task-recurrence').value = 'weekly';
    document
      .getElementById('task-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const creation = server.calls.find((c) => c.method === 'POST');
    expect(creation.body.recurrence.freq).toBe('weekly');
  });

  test('la récurrence écrite dans le titre part avec la tâche, et son échéance avec elle', async () => {
    await boot();

    document.getElementById('task-title').value = 'Poubelles tous les mardis';
    document
      .getElementById('task-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const creation = server.calls.find((c) => c.method === 'POST');
    expect(creation.body.title).toBe('Poubelles');
    expect(creation.body.recurrence).toEqual({ freq: 'weekly', interval: 1, until: null });
    // sans échéance, le serveur refuserait la récurrence
    expect(new Date(creation.body.dueDate).getDay()).toBe(2);
  });

  test('le choix fait dans le menu l’emporte sur ce que le titre laisse deviner', async () => {
    await boot();

    document.getElementById('task-title').value = 'Loyer chaque mois';
    document.getElementById('task-due-date').value = '2026-10-05T09:00';
    document.getElementById('task-recurrence').value = 'yearly';
    document
      .getElementById('task-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const creation = server.calls.find((c) => c.method === 'POST');
    expect(creation.body.recurrence.freq).toBe('yearly');
  });

  test.each([
    ['weekdays', /ouvré/i],
    ['yearly', /an/i],
  ])('le pictogramme nomme la fréquence %s', async (freq, attendu) => {
    server.tasks = [task('Série', { recurrence: { freq, interval: 1, until: null } })];
    await boot();

    expect(document.querySelector('.task-recurrence').getAttribute('title')).toMatch(attendu);
  });

  test('le champ de récurrence est désactivé tant qu’il n’y a pas d’échéance', async () => {
    await boot();

    const champ = document.getElementById('task-recurrence');
    expect(champ.disabled).toBe(true);

    const date = document.getElementById('task-due-date');
    date.value = '2026-09-22T09:00';
    date.dispatchEvent(new Event('input', { bubbles: true }));

    expect(champ.disabled).toBe(false);
  });
});

describe('ma journée', () => {
  const aujourdhui = () => new Date().toISOString();
  const hier = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  };
  const envoi = () => server.calls.find((c) => c.method === 'PUT' && c.url.startsWith('/tasks/'));
  const press = (key) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  const lastListUrl = () =>
    server.calls
      .map((c) => c.url)
      .filter((u) => u.startsWith('/tasks?'))
      .pop();

  test('la pastille « Ma journée » relance la liste sur ce qui a été choisi', async () => {
    await boot();
    server.calls = [];

    document.querySelector('.due-pill[data-due="myday"]').click();
    await settle();

    const params = new URL(lastListUrl(), 'http://test').searchParams;
    expect(params.get('due')).toBe('myday');
  });

  test('la pastille compte ce qui reste à faire dans la journée', async () => {
    server.stats = { ...server.stats, myDay: 3 };
    await boot();

    const pill = document.querySelector('.due-pill[data-due="myday"]');
    expect(document.getElementById('due-myday-count').textContent).toBe('3');
    expect(pill.getAttribute('aria-label')).toBe('Ma journée, 3 tâches');
  });

  test('le soleil d’une ligne pose la tâche dans la journée', async () => {
    server.tasks = [task('Appeler maman')];
    await boot();

    const soleil = document.querySelector('.task-myday');
    expect(soleil.getAttribute('aria-pressed')).toBe('false');
    soleil.click();
    await settle();

    const jour = new Date(envoi().body.myDay);
    expect(jour.toDateString()).toBe(new Date().toDateString());
  });

  test('une tâche déjà choisie aujourd’hui s’en retire', async () => {
    server.tasks = [task('Appeler maman', { myDay: aujourdhui() })];
    await boot();

    const soleil = document.querySelector('.task-myday');
    expect(soleil.getAttribute('aria-pressed')).toBe('true');
    soleil.click();
    await settle();

    expect(envoi().body).toEqual({ myDay: null });
  });

  test('un choix de la veille ne compte plus', async () => {
    server.tasks = [task('Appeler maman', { myDay: hier() })];
    await boot();

    expect(document.querySelector('.task-myday').getAttribute('aria-pressed')).toBe('false');
  });

  test('m pose la tâche sélectionnée dans la journée', async () => {
    server.tasks = [task('Appeler maman')];
    await boot();
    press('j');
    press('m');
    await settle();

    expect(envoi().body.myDay).not.toBeNull();
  });

  test('la palette ouvre la journée', async () => {
    await boot();
    server.calls = [];
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
    const input = document.getElementById('palette-input');
    input.value = 'journée';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#palette-list .palette-item').click();
    await settle();

    expect(new URL(lastListUrl(), 'http://test').searchParams.get('due')).toBe('myday');
  });
});

describe('reporter tous les retards', () => {
  const ilYA = (jours) => {
    const d = new Date();
    d.setDate(d.getDate() - jours);
    d.setHours(14, 30, 0, 0);
    return d.toISOString();
  };

  const lancer = async () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
    const input = document.getElementById('palette-input');
    input.value = 'retards';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#palette-list .palette-item').click();
    await settle();
  };

  const envois = () => server.calls.filter((c) => c.url === '/tasks/due');

  test('la palette reporte chaque retard à demain, chacun à son heure, en un envoi', async () => {
    server.tasks = [
      task('Plombier', { dueDate: ilYA(3) }),
      task('Banque', { dueDate: ilYA(1) }),
      task('Plus tard', { dueDate: null }),
    ];
    await boot();
    await lancer();

    expect(envois()).toHaveLength(1);
    const { items } = envois()[0].body;
    expect(items.map((i) => i.id).sort()).toEqual(['id-Banque', 'id-Plombier']);
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    items.forEach(({ dueDate }) => {
      expect(new Date(dueDate).getDate()).toBe(demain.getDate());
      expect(new Date(dueDate).getHours()).toBe(14);
    });
  });

  test('« Annuler » remet chaque tâche à son échéance d’avant', async () => {
    const avant = ilYA(3);
    server.tasks = [task('Plombier', { dueDate: avant })];
    await boot();
    await lancer();

    document.querySelector('.toast-action').click();
    await settle();

    expect(envois()).toHaveLength(2);
    expect(envois()[1].body.items).toEqual([{ id: 'id-Plombier', dueDate: avant }]);
  });

  test('sans retard, rien ne part et la note le dit', async () => {
    server.tasks = [task('Plus tard')];
    await boot();
    await lancer();

    expect(envois()).toHaveLength(0);
    expect(document.getElementById('toast-container').textContent).toMatch(/aucun retard/i);
  });
});

describe('recherche dans les étapes', () => {
  test('un dossier trouvé par ses étapes nomme celles qui ont répondu', async () => {
    server.tasks = [
      task('Devis cuisine', { childCount: 2, childDone: 0, matchedSteps: ['Verser l’acompte'] }),
    ];
    await boot();

    const trouvees = document.querySelector('.task-matched-steps');
    expect(trouvees).not.toBeNull();
    expect(trouvees.textContent).toContain('Verser l’acompte');
  });

  test('le titre d’une étape trouvée est échappé', async () => {
    server.tasks = [task('Devis', { matchedSteps: ['<img src=x onerror=alert(1)>'] })];
    await boot();

    expect(document.querySelector('.task-matched-steps img')).toBeNull();
  });

  test('sans recherche, rien de tel', async () => {
    server.tasks = [task('Devis cuisine', { childCount: 2, childDone: 0 })];
    await boot();

    expect(document.querySelector('.task-matched-steps')).toBeNull();
  });
});

describe('reporter', () => {
  const press = (key, options = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));

  const hier = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(14, 30, 0, 0);
    return d.toISOString();
  };

  const envoi = () => server.calls.find((c) => c.method === 'PUT');

  test('r reporte la tâche sélectionnée à demain, à son heure', async () => {
    server.tasks = [task('Relancer', { dueDate: hier() })];
    await boot();
    press('j');
    press('r');
    await settle();

    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const recu = new Date(envoi().body.dueDate);
    expect(recu.getDate()).toBe(demain.getDate());
    expect(recu.getHours()).toBe(14);
    expect(recu.getMinutes()).toBe(30);
    // le corps ne porte que l'échéance : rien d'autre ne doit bouger
    expect(Object.keys(envoi().body)).toEqual(['dueDate']);
  });

  test('R reporte la tâche sélectionnée au lundi qui vient', async () => {
    server.tasks = [task('Relancer', { dueDate: hier() })];
    await boot();
    press('j');
    press('R', { shiftKey: true });
    await settle();

    expect(new Date(envoi().body.dueDate).getDay()).toBe(1);
  });

  test('sans sélection, r ne fait rien', async () => {
    server.tasks = [task('Relancer', { dueDate: hier() })];
    await boot();
    press('r');
    await settle();

    expect(envoi()).toBeUndefined();
  });

  test('une tâche en retard offre « → demain » d’un clic', async () => {
    server.tasks = [task('Relancer', { dueDate: hier() }), task('Sans date')];
    await boot();

    const boutons = document.querySelectorAll('.task-postpone');
    // seulement sur la tâche en retard : ailleurs le bouton serait du bruit
    expect(boutons).toHaveLength(1);

    boutons[0].click();
    await settle();
    expect(envoi().url).toBe('/tasks/id-Relancer');
  });

  test('une tâche terminée n’offre pas de report', async () => {
    server.tasks = [task('Faite', { dueDate: hier(), completed: true })];
    await boot();

    expect(document.querySelector('.task-postpone')).toBeNull();
  });
});

describe('modifier une série et son rappel', () => {
  const ouvrir = (titre) => {
    const ligne = [...document.querySelectorAll('#task-list li.task')].find((li) =>
      li.textContent.includes(titre)
    );
    ligne.querySelector('.edit').click();
  };

  const enregistrer = async () => {
    document.getElementById('save-edit').click();
    await settle();
    return server.calls.find((c) => c.method === 'PUT');
  };

  test('la fenêtre reprend la récurrence et le rappel de la tâche', async () => {
    server.tasks = [
      task('Loyer', {
        dueDate: '2026-10-05T07:00:00.000Z',
        recurrence: { freq: 'monthly', interval: 1, until: null },
        reminder: { offset: '1d', at: null, sentAt: null },
      }),
    ];
    await boot();
    ouvrir('Loyer');

    expect(document.getElementById('edit-recurrence').value).toBe('monthly');
    expect(document.getElementById('edit-reminder').value).toBe('1d');
  });

  test('arrêter une série se fait sans la supprimer', async () => {
    server.tasks = [
      task('Loyer', {
        dueDate: '2026-10-05T07:00:00.000Z',
        recurrence: { freq: 'monthly', interval: 1, until: null },
      }),
    ];
    await boot();
    ouvrir('Loyer');
    document.getElementById('edit-recurrence').value = '';

    const envoi = await enregistrer();
    expect(envoi.body.recurrence).toEqual({ freq: '', interval: 1, until: null });
  });

  test('garder la même fréquence ne perd ni l’intervalle ni la fin de série', async () => {
    // « toutes les 2 semaines jusqu'en décembre » n'a pas de case dans le menu :
    // enregistrer un titre corrigé ne doit pas la ramener à « chaque semaine »
    const recurrence = { freq: 'weekly', interval: 2, until: '2026-12-31T00:00:00.000Z' };
    server.tasks = [task('Filtre', { dueDate: '2026-10-05T07:00:00.000Z', recurrence })];
    await boot();
    ouvrir('Filtre');
    document.getElementById('edit-title').value = 'Filtre à café';

    const envoi = await enregistrer();
    expect(envoi.body.recurrence).toEqual(recurrence);
  });

  test('poser un rappel depuis la fenêtre', async () => {
    server.tasks = [task('Dentiste', { dueDate: '2026-10-05T07:00:00.000Z' })];
    await boot();
    ouvrir('Dentiste');
    document.getElementById('edit-reminder').value = '1h';

    const envoi = await enregistrer();
    expect(envoi.body.reminder).toEqual({ offset: '1h' });
  });

  test('vider l’échéance vide et verrouille récurrence et rappel', async () => {
    server.tasks = [
      task('Loyer', {
        dueDate: '2026-10-05T07:00:00.000Z',
        recurrence: { freq: 'monthly', interval: 1, until: null },
        reminder: { offset: '1d', at: null, sentAt: null },
      }),
    ];
    await boot();
    ouvrir('Loyer');

    const date = document.getElementById('edit-due-date');
    date.value = '';
    date.dispatchEvent(new Event('input', { bubbles: true }));

    const serie = document.getElementById('edit-recurrence');
    const rappel = document.getElementById('edit-reminder');
    expect(serie.disabled).toBe(true);
    expect(rappel.disabled).toBe(true);

    // sans quoi le serveur refuserait l'enregistrement entier
    const envoi = await enregistrer();
    expect(envoi.body.recurrence.freq).toBe('');
    expect(envoi.body.reminder).toEqual({ offset: '' });
  });

  test('une tâche sans échéance ouvre la fenêtre avec les deux champs verrouillés', async () => {
    server.tasks = [task('Libre')];
    await boot();
    ouvrir('Libre');

    expect(document.getElementById('edit-recurrence').disabled).toBe(true);
    expect(document.getElementById('edit-reminder').disabled).toBe(true);
  });
});

describe('rappels', () => {
  test('une tâche avec rappel porte un pictogramme', async () => {
    server.tasks = [task('Dentiste', { reminder: { offset: '1h', at: null, sentAt: null } })];
    await boot();

    const marque = document.querySelector('.task-reminder');
    expect(marque).not.toBeNull();
    expect(marque.getAttribute('title')).toMatch(/heure avant/i);
  });

  test('une tâche sans rappel n’en porte pas', async () => {
    server.tasks = [task('Simple')];
    await boot();

    expect(document.querySelector('.task-reminder')).toBeNull();
  });

  test('le champ de rappel est désactivé tant qu’il n’y a pas d’échéance', async () => {
    await boot();

    const champ = document.getElementById('task-reminder');
    expect(champ.disabled).toBe(true);

    const date = document.getElementById('task-due-date');
    date.value = '2026-09-22T09:00';
    date.dispatchEvent(new Event('input', { bubbles: true }));

    expect(champ.disabled).toBe(false);
  });

  test('le composeur envoie le rappel choisi', async () => {
    await boot();

    document.getElementById('task-title').value = 'Dentiste';
    document.getElementById('task-due-date').value = '2026-09-22T09:00';
    const champ = document.getElementById('task-reminder');
    champ.disabled = false;
    champ.value = '1h';
    document
      .getElementById('task-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    const creation = server.calls.find((c) => c.method === 'POST');
    expect(creation.body.reminder).toEqual({ offset: '1h' });
  });
});

describe('étiquettes à l’écran', () => {
  test('une tâche marquée affiche ses étiquettes', async () => {
    server.tasks = [task('Courses', { tags: ['maison', 'urgent'] })];
    await boot();

    const vues = [...document.querySelectorAll('.task-tag')].map((e) => e.textContent.trim());
    expect(vues).toEqual(['+maison', '+urgent']);
  });

  test('cliquer une étiquette filtre la liste dessus', async () => {
    server.tasks = [task('Courses', { tags: ['maison'] })];
    await boot();
    server.calls = [];

    document.querySelector('.task-tag').click();
    await settle();

    const url = calls()
      .filter((u) => u.startsWith('/tasks?'))
      .pop();
    expect(new URL(url, 'http://test').searchParams.get('tag')).toBe('maison');
  });

  test('une tâche sans étiquette n’affiche rien', async () => {
    server.tasks = [task('Simple')];
    await boot();

    expect(document.querySelector('.task-tag')).toBeNull();
  });
});

describe('glisser-déposer', () => {
  const dragTo = (source, cible) => {
    source.dispatchEvent(new Event('dragstart', { bubbles: true }));
    cible.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    cible.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    source.dispatchEvent(new Event('dragend', { bubbles: true }));
  };

  test('les lignes ne sont saisissables que sous le tri manuel', async () => {
    server.tasks = [task('A'), task('B')];
    await boot();

    expect(document.querySelector('.task').draggable).toBe(false);

    const tri = document.getElementById('sort-select');
    tri.value = 'manual';
    tri.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    expect(document.querySelector('.task').draggable).toBe(true);
  });

  test('déposer une ligne envoie ses voisines au serveur', async () => {
    server.tasks = [task('A'), task('B'), task('C')];
    await boot();
    const tri = document.getElementById('sort-select');
    tri.value = 'manual';
    tri.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    server.calls = [];

    const lignes = document.querySelectorAll('.task');
    dragTo(lignes[2], lignes[0]);
    await settle();

    const appel = server.calls.find((c) => c.method === 'PATCH');
    expect(appel.url).toBe('/tasks/id-C/order');
    // déposé sur la première ligne : il n'y a personne au-dessus
    expect(appel.body).toEqual({ before: null, after: 'id-A' });
  });

  test('déposer une ligne sur elle-même ne demande rien au serveur', async () => {
    server.tasks = [task('A'), task('B')];
    await boot();
    const tri = document.getElementById('sort-select');
    tri.value = 'manual';
    tri.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    server.calls = [];

    const ligne = document.querySelector('.task');
    dragTo(ligne, ligne);
    await settle();

    expect(server.calls.find((c) => c.method === 'PATCH')).toBeUndefined();
  });
});

describe('restauration d’une sauvegarde', () => {
  /** Faux fichier : happy-dom n'a pas de sélecteur de fichiers. */
  const choisirFichier = (contenu) => {
    const champ = document.getElementById('reglages-fichier');
    Object.defineProperty(champ, 'files', {
      configurable: true,
      value: [{ text: async () => contenu }],
    });
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  };

  /** Les deux gestes vivent dans les Réglages : il faut les ouvrir d'abord. */
  const ouvrirReglages = async () => {
    document.getElementById('open-settings').click();
    await settle();
  };

  test('le bouton Restaurer ouvre le sélecteur de fichiers', async () => {
    await boot();
    await ouvrirReglages();
    let ouvert = false;
    document.getElementById('reglages-fichier').click = () => {
      ouvert = true;
    };

    document.getElementById('reglages-restaurer').click();

    expect(ouvert).toBe(true);
  });

  test('« Sauvegarder » télécharge l’export sans passer par un bouton mort', async () => {
    await boot();
    await ouvrirReglages();

    const lien = document.getElementById('reglages-sauvegarder');
    expect(lien.getAttribute('href')).toBe('/export');
    expect(lien.hasAttribute('download')).toBe(true);
  });

  test('choisir une sauvegarde l’envoie en fusion, jamais en remplacement', async () => {
    await boot();
    await ouvrirReglages();
    server.calls = [];

    choisirFichier(
      JSON.stringify({ tasks: [{ title: 'Venue de la sauvegarde' }], categories: [] })
    );
    await settle();

    const envoi = server.calls.find((c) => c.url === '/import');
    expect(envoi).toBeDefined();
    // un bouton qui efface la base à un clic de distance serait un piège
    expect(envoi.body.mode).toBe('merge');
    expect(envoi.body.tasks).toHaveLength(1);
  });

  test('un fichier qui n’est pas une sauvegarde le dit sans planter', async () => {
    await boot();
    await ouvrirReglages();
    server.calls = [];

    choisirFichier('ceci n’est pas du JSON');
    await settle();

    expect(server.calls.find((c) => c.url === '/import')).toBeUndefined();
    expect(document.querySelector('.toast').textContent).toMatch(/sauvegarde du Cahier/i);
  });

  test('rouvrir les réglages ne double pas l’envoi', async () => {
    await boot();
    await ouvrirReglages();
    document.getElementById('close-settings').click();
    // le corps des réglages est réécrit à chaque ouverture : un branchement
    // qui s'accumulerait enverrait la sauvegarde deux fois, puis trois
    await ouvrirReglages();
    server.calls = [];

    choisirFichier(JSON.stringify({ tasks: [], categories: [] }));
    await settle();

    expect(server.calls.filter((c) => c.url === '/import')).toHaveLength(1);
  });
});

describe('page Réglages', () => {
  test('le bouton de l’en-tête ouvre les réglages, remplis de ce qui est enregistré', async () => {
    server.preferences.apparence.densite = 'compact';
    await boot();

    document.getElementById('open-settings').click();
    await settle();

    expect(document.getElementById('settings-modal').classList.contains('active')).toBe(true);
    expect(document.querySelector('[data-reglage="apparence.densite"] select').value).toBe(
      'compact'
    );
  });

  test('changer un réglage l’envoie au serveur', async () => {
    await boot();
    document.getElementById('open-settings').click();
    await settle();
    server.calls = [];

    const select = document.querySelector('[data-reglage="apparence.densite"] select');
    select.value = 'compact';
    select.dispatchEvent(new Event('change'));
    await settle();

    const envoi = server.calls.find((c) => c.url === '/preferences' && c.method === 'PUT');
    expect(envoi.body).toEqual({ apparence: { densite: 'compact' } });
  });

  test('« Fermer » range la page', async () => {
    await boot();
    document.getElementById('open-settings').click();
    await settle();

    document.getElementById('close-settings').click();

    expect(document.getElementById('settings-modal').classList.contains('active')).toBe(false);
  });

  test('la palette sait ouvrir les réglages', async () => {
    await boot();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
    );
    document.getElementById('palette-input').value = 'réglages';
    document.getElementById('palette-input').dispatchEvent(new Event('input'));
    document.querySelector('.palette-item').click();
    await settle();

    expect(document.getElementById('settings-modal').classList.contains('active')).toBe(true);
  });

  test('hors application installée, le bandeau de mise à jour reste rangé', async () => {
    await boot();

    // dans un navigateur, il n'y a pas de version publiée : rien à annoncer
    expect(document.getElementById('maj-banner').hidden).toBe(true);
  });
});

describe('les reglages appliques', () => {
  test('la vue d’ouverture reglee decide de la premiere liste demandee', async () => {
    server.preferences.ouverture = { statut: 'active', horizon: 'week', tri: 'dueDate' };

    await boot();

    const premiere = calls().find((url) => url.startsWith('/tasks?'));
    const params = new URL(premiere, 'http://test').searchParams;
    expect(params.get('status')).toBe('active');
    expect(params.get('due')).toBe('week');
    expect(params.get('sort')).toBe('dueDate');
    // et une seule liste : passer par un clic sur les pastilles en demanderait deux
    expect(calls().filter((url) => url.startsWith('/tasks?'))).toHaveLength(1);
  });

  test('la vue reglee est celle que montrent les pastilles', async () => {
    server.preferences.ouverture = { statut: 'active', horizon: 'week', tri: 'dueDate' };

    await boot();

    expect(document.querySelector('.pill[data-filter="active"]').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(document.querySelector('.due-pill[data-due="week"]').getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(document.getElementById('sort-select').value).toBe('dueDate');
  });

  test('ouvrir sur « en retard » n’ouvre pas aussi sur les taches rayees', async () => {
    server.preferences.ouverture = { statut: 'all', horizon: 'overdue', tri: 'creation' };

    await boot();

    // le retard se lit parmi ce qui reste a faire : les deux reglages sont
    // independants, la page doit les accorder plutot que de les subir
    const premiere = calls().find((url) => url.startsWith('/tasks?'));
    expect(new URL(premiere, 'http://test').searchParams.get('status')).toBe('active');
  });

  test('l’apparence reglee est posee sur la page', async () => {
    server.preferences.apparence = {
      densite: 'compact',
      taille: 'grande',
      grain: false,
      crayon: true,
    };

    await boot();

    expect(document.documentElement.dataset.densite).toBe('compact');
    expect(document.documentElement.dataset.taille).toBe('grande');
    expect(document.documentElement.dataset.grain).toBe('off');
  });

  test('changer l’apparence dans les reglages la pose aussitot', async () => {
    await boot();
    document.getElementById('open-settings').click();
    await settle();

    const select = document.querySelector('[data-reglage="apparence.densite"] select');
    select.value = 'compact';
    select.dispatchEvent(new Event('change'));
    await settle();

    // sans attendre un rechargement de la page
    expect(document.documentElement.dataset.densite).toBe('compact');
  });

  test('l’apparence est retenue pour le lancement suivant', async () => {
    server.preferences.apparence.densite = 'compact';
    await boot();

    expect(JSON.parse(localStorage.getItem('cahier.apparence')).densite).toBe('compact');
  });
});
