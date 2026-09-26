/* Tests de bout en bout : l'application EMPAQUETÉE, pilotée par Playwright.
   Trois défauts de ce projet n'ont existé que dans l'application installée ;
   ces tests visent précisément elle. `npm run dist` doit précéder. */

module.exports = {
  testDir: 'test/e2e',
  testMatch: '**/*.e2e.js',
  // une application Electron et son mongod par test : pas de parallélisme
  workers: 1,
  timeout: 150_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
};
