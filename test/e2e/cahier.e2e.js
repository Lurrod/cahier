/* ---------------------------------------------------------------------------
   Le Cahier installé, de bout en bout : zone de notification, raccourci
   global, notifications qu'on clique.

   Chaque test lance dist/win-unpacked/Cahier.exe sur un profil jetable
   (CAHIER_USER_DATA) : ni la vraie base, ni le registre, ni les mises à jour
   ne sont touchés. `npm run dist` doit avoir été lancé avant.
   --------------------------------------------------------------------------- */

const { test, expect, _electron: electron } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXECUTABLE = path.join(__dirname, '..', '..', 'dist', 'win-unpacked', 'Cahier.exe');

let cahier = null;
let profil = null;

/** Lance le Cahier empaqueté sur un profil neuf et rend la page. */
const lancer = async ({ args = [] } = {}) => {
  profil = fs.mkdtempSync(path.join(os.tmpdir(), 'cahier-e2e-'));
  cahier = await electron.launch({
    executablePath: EXECUTABLE,
    args,
    env: { ...process.env, CAHIER_USER_DATA: profil },
  });
  const page = await cahier.firstWindow();
  await page.waitForSelector('#task-list', { state: 'attached' });
  return page;
};

/** L'état de la fenêtre, lu dans le processus principal. */
const fenetre = () =>
  cahier.evaluate(({ BrowserWindow }) => {
    const [f] = BrowserWindow.getAllWindows();
    return f ? { visible: f.isVisible(), existe: true } : { visible: false, existe: false };
  });

/** Une requête à l'API, depuis la page : même origine, aucun CORS à ouvrir. */
const api = (page, chemin, options) =>
  page.evaluate(
    async ({ chemin, options }) => {
      const res = await fetch(chemin, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      return res.json();
    },
    { chemin, options }
  );

test.afterEach(async () => {
  // quitter pour de bon, comme « Quitter » dans le menu de l'icône
  await cahier?.evaluate(({ app }) => app.quit()).catch(() => {});
  await cahier?.close().catch(() => {});
  cahier = null;
  // mongod peut tenir ses fichiers un instant après la sortie
  fs.rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
});

test('démarre sur un profil de test et montre le cahier', async () => {
  const page = await lancer();

  await expect(page).toHaveTitle('Cahier');
  expect(await fenetre()).toEqual({ visible: true, existe: true });
  // la base est bien celle du profil jetable, pas celle du poste
  expect(fs.existsSync(path.join(profil, 'db'))).toBe(true);
});

test('fermer la fenêtre la range, et le Cahier continue de répondre', async () => {
  const page = await lancer();

  await cahier.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());

  // rangée, pas détruite : c'est ce qui laisse les rappels sonner
  await expect.poll(fenetre).toEqual({ visible: false, existe: true });
  expect(await api(page, '/healthz')).toMatchObject({ status: 'ok', db: 'connected' });
});

test('Ctrl+Alt+N, frappé au clavier, ramène le Cahier sur la saisie', async () => {
  const page = await lancer();
  expect(
    await cahier.evaluate(({ globalShortcut }) =>
      globalShortcut.isRegistered('CommandOrControl+Alt+N')
    )
  ).toBe(true);

  await cahier.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect.poll(fenetre).toEqual({ visible: false, existe: true });

  // une vraie frappe, envoyée au système — pas un appel interne
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^%n')",
  ]);

  await expect.poll(fenetre).toEqual({ visible: true, existe: true });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('task-title');
});

test('un rappel part en notification Electron, et son clic ouvre la tâche', async () => {
  const page = await lancer();

  // on capture la notification réelle au moment où le Cahier la montre : un
  // toast Windows ne se clique pas depuis un test, son objet si
  await cahier.evaluate(({ Notification }) => {
    globalThis.notificationsVues = [];
    Notification.prototype.show = function show() {
      globalThis.notificationsVues.push(this);
    };
  });

  const echeance = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const tache = await api(page, '/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Rappel de bout en bout',
      dueDate: echeance,
      reminder: { offset: 'atDue' },
    }),
  });
  await cahier.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());

  // le balayage passe chaque minute
  await expect
    .poll(() => cahier.evaluate(() => globalThis.notificationsVues.length), { timeout: 75_000 })
    .toBe(1);
  expect(await cahier.evaluate(() => globalThis.notificationsVues[0].body)).toContain(
    'Rappel de bout en bout'
  );

  // le clic, tel que Windows le rendrait à l'objet
  await cahier.evaluate(() => globalThis.notificationsVues[0].emit('click'));

  await expect.poll(fenetre).toEqual({ visible: true, existe: true });
  await expect(page.locator('#edit-modal')).toHaveClass(/active/);
  await expect(page.locator('#edit-title')).toHaveValue('Rappel de bout en bout');
  expect(tache._id).toMatch(/^[a-f0-9]{24}$/);
});

test('lancé par l’ouverture de session, il attend caché dans la zone de notification', async () => {
  await lancer({ args: ['--cache'] });

  // la page se charge, prête à rappeler, sans rien montrer
  await new Promise((r) => setTimeout(r, 2000));
  expect(await fenetre()).toEqual({ visible: false, existe: true });
});

test('cliquer dans un champ n’allume que son propre contour', async () => {
  const page = await lancer();

  await page.locator('#task-title').click();

  // drawably allume le calque de focus de TOUS les cadres imbriqués dans un
  // cadre qui contient le focus : un clic dans le titre soulignait chaque
  // champ du composeur, et le composeur lui-même
  const allumes = await page.evaluate(() =>
    [...document.querySelectorAll('.drawably-host')]
      .filter((h) =>
        [...h.querySelectorAll(':scope > .drawably-svg .drawably-focus')].some(
          (f) => getComputedStyle(f).visibility === 'visible'
        )
      )
      .map((h) => h.querySelector('input, select, textarea')?.id || h.id || h.className)
  );
  expect(allumes).toEqual(['task-title']);
});

test('une case cochée au clavier n’allume que la sienne', async () => {
  const page = await lancer();
  await page.locator('#open-settings').click();
  await page.locator('#settings-body .reglage-controle[type="checkbox"]').first().focus();
  await page.keyboard.press('Space');

  const allumes = await page.evaluate(
    () =>
      [...document.querySelectorAll('#settings-body .drawably-host')].filter((h) =>
        [...h.querySelectorAll(':scope > .drawably-svg .drawably-focus')].some(
          (f) => getComputedStyle(f).visibility === 'visible'
        )
      ).length
  );
  expect(allumes).toBe(1);
});
