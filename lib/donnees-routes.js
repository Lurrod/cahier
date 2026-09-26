/* ---------------------------------------------------------------------------
   Cahier — les données qui sortent et qui rentrent : la sauvegarde complète,
   sa remise en base, et les rendus lisibles (Markdown, CSV, agenda).

   Sorti de server.js, qui dépassait la taille que se donne le projet. Les
   modèles et le traitement d'erreur sont reçus en argument : ce module ne
   connaît ni la connexion Mongo, ni l'emplacement du dépôt.
   --------------------------------------------------------------------------- */

const express = require('express');
const fs = require('fs');
const path = require('path');

const { exportShape, validateImport } = require('./portable');
const { toMarkdown, toCsv } = require('./formats');
const { toIcs } = require('./agenda');
const { asString } = require('./entrees');

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Task
 * @param {import('mongoose').Model} deps.Category
 * @param {() => string} deps.dossierSauvegardes où déposer la copie prise avant un remplacement
 * @param {(res: object, error: unknown) => void} deps.echouer la réponse d'erreur commune
 * @returns {{routeur: import('express').Router, collectExport: () => Promise<object>}}
 */
const creerRoutesDonnees = ({ Task, Category, dossierSauvegardes, echouer }) => {
  const routeur = express.Router();

  /** Horodatage de nom de fichier : 2026-09-16T08-42-11, trié correctement à plat. */
  const fileStamp = (date = new Date()) => date.toISOString().replace(/:/g, '-').slice(0, 19);

  /**
   * Sauvegarde complète : tâches (corbeille comprise) et catégories, avec leurs
   * identifiants et leurs dates. C'est la seule forme qui se réimporte à
   * l'identique.
   */
  const collectExport = async () => {
    const [tasks, categories] = await Promise.all([
      Task.find().sort({ createdAt: 1, _id: 1 }).lean(),
      Category.find().sort({ name: 1 }).lean(),
    ]);
    return exportShape({ tasks, categories });
  };

  routeur.get('/export', async (req, res) => {
    try {
      const payload = await collectExport();
      res.setHeader('Content-Disposition', `attachment; filename="cahier-${fileStamp()}.json"`);
      res.status(200).json(payload);
    } catch (error) {
      echouer(res, error);
    }
  });

  /** Dépose un instantané sur disque et renvoie son chemin. */
  const writeBackup = (prefix, payload) => {
    const dir = dossierSauvegardes();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${prefix}-${fileStamp()}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    return file;
  };

  /**
   * Remise en base d'une sauvegarde.
   *
   * `merge` ajoute sans toucher à l'existant ; `replace` reconstruit la base.
   * Mongo tourne ici sans jeu de réplicas, donc sans transaction : l'atomicité
   * est obtenue autrement — tout est validé avant la moindre écriture, et un
   * `replace` dépose l'état courant dans BACKUP_DIR juste avant d'effacer.
   */
  routeur.post('/import', async (req, res) => {
    try {
      // le mode se donne en query ou dans le corps : un fichier d'export ne
      // contient pas de « mode », et il ne faut pas obliger à le rouvrir pour
      // l'y glisser avant de le remettre
      const mode = asString(req.query?.mode, 16) || asString(req.body?.mode, 16) || 'merge';
      if (mode !== 'merge' && mode !== 'replace') {
        return res.status(400).json({ error: 'Mode inconnu : « merge » ou « replace » attendu.' });
      }
      // un effacement complet ne doit pas tenir dans une requête qu'on lance par mégarde
      if (mode === 'replace' && req.get('X-Confirm') !== 'replace') {
        return res
          .status(428)
          .json({ error: 'Remplacement refusé : en-tête X-Confirm: replace requis.' });
      }

      const { tasks, categories, errors } = validateImport(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ error: errors.slice(0, 5).join(' · ') });
      }

      // seconde barrière : le schéma Mongoose relit chaque document, toujours
      // sans écrire — un import est tout ou rien
      const taskDocs = tasks.map((raw) => new Task(raw));
      const categoryDocs = categories.map((raw) => new Category(raw));
      for (const [index, doc] of taskDocs.entries()) {
        const invalid = doc.validateSync();
        if (invalid)
          return res.status(400).json({ error: `Tâche ${index + 1} : ${invalid.message}` });
      }
      for (const [index, doc] of categoryDocs.entries()) {
        const invalid = doc.validateSync();
        if (invalid) {
          return res.status(400).json({ error: `Catégorie ${index + 1} : ${invalid.message}` });
        }
      }

      let backup = null;
      if (mode === 'replace') {
        const instantane = await collectExport();
        backup = writeBackup('avant-remplacement', instantane);
        try {
          await Promise.all([Task.deleteMany({}), Category.deleteMany({})]);
          await Task.insertMany(taskDocs);
          await Category.insertMany(categoryDocs);
        } catch (ecriture) {
          // l'insertion a heurté un obstacle que la validation n'a pas vu (une
          // collision d'identifiant échappée aux deux barrières précédentes, par
          // exemple) : la base est à moitié écrite, on la remet dans l'état
          // qu'a saisi l'instantané, juste avant l'effacement
          try {
            await Promise.all([Task.deleteMany({}), Category.deleteMany({})]);
            await Task.insertMany(instantane.tasks.map((raw) => new Task(raw)));
            await Category.insertMany(instantane.categories.map((raw) => new Category(raw)));
          } catch (remiseEnPlace) {
            console.error(ecriture);
            console.error(remiseEnPlace);
            return res.status(500).json({
              error:
                `Échec de l'import ET de la remise en place automatique de la base. ` +
                `Restaurez manuellement depuis la sauvegarde : ${backup}`,
            });
          }
          console.error(ecriture);
          return res.status(500).json({
            error:
              `Échec de l'import en cours d'écriture : la base a été remise dans son état ` +
              `d'origine. Sauvegarde disponible en cas de doute : ${backup}`,
          });
        }
      } else {
        // merge : on n'écrase jamais, on complète. Un identifiant ou un nom déjà
        // pris est laissé tel qu'il est en base.
        // un doublon n'est pas une erreur ici : c'est une entrée déjà en base,
        // qu'on laisse telle quelle. Une écriture en lot signale ses doublons
        // dans `writeErrors` plutôt que dans un `code` de premier niveau.
        const ignorerDoublons = (e) => {
          const doublon =
            e.code === 11000 || (e.writeErrors || []).every((w) => w.err?.code === 11000);
          if (!doublon) throw e;
        };
        await Task.insertMany(taskDocs, { ordered: false }).catch(ignorerDoublons);
        await Category.insertMany(categoryDocs, { ordered: false }).catch(ignorerDoublons);
      }

      res.status(200).json({
        message: mode === 'replace' ? 'Base remplacée' : 'Sauvegarde fusionnée',
        tasks: taskDocs.length,
        categories: categoryDocs.length,
        backup,
      });
    } catch (error) {
      echouer(res, error);
    }
  });

  routeur.get('/export.md', async (req, res) => {
    try {
      const tasks = await Task.find().sort({ category: 1, createdAt: 1 }).lean();
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cahier-${fileStamp()}.md"`);
      res.status(200).send(toMarkdown(tasks));
    } catch (error) {
      echouer(res, error);
    }
  });

  routeur.get('/export.ics', async (req, res) => {
    try {
      const tasks = await Task.find({ deletedAt: null, completed: false, dueDate: { $ne: null } })
        .sort({ dueDate: 1, _id: 1 })
        .lean();
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cahier-${fileStamp()}.ics"`);
      res.status(200).send(toIcs(tasks));
    } catch (error) {
      echouer(res, error);
    }
  });

  routeur.get('/export.csv', async (req, res) => {
    try {
      const tasks = await Task.find().sort({ createdAt: 1, _id: 1 }).lean();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cahier-${fileStamp()}.csv"`);
      res.status(200).send(toCsv(tasks));
    } catch (error) {
      echouer(res, error);
    }
  });

  return { routeur, collectExport };
};

module.exports = { creerRoutesDonnees };
