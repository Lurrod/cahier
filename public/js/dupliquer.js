/* ---------------------------------------------------------------------------
   Cahier — dupliquer une tâche : la même, étapes comprises, remise à neuf.

   Sert aux tâches qu'on refait dans la même forme — la valise, la clôture du
   mois, la liste de courses de la semaine. La copie reprend ce qui décrit la
   tâche, jamais ce qui dit où elle en est : ni rayée, ni dans ma journée, et
   ses étapes repartent décochées.
   --------------------------------------------------------------------------- */

/**
 * Ce qu'on envoie pour créer la copie.
 *
 * Le rappel ne voyage que par son réglage : son heure et son envoi dépendent
 * de l'échéance et de ce qui est déjà parti, le serveur les recalcule.
 *
 * @param {object} task
 * @returns {object}
 */
export const copieDe = (task) => ({
  title: task.title,
  description: task.description || '',
  category: task.category || '',
  priority: task.priority || '',
  tags: task.tags || [],
  dueDate: task.dueDate ?? null,
  recurrence: task.recurrence?.freq
    ? {
        freq: task.recurrence.freq,
        interval: task.recurrence.interval || 1,
        until: task.recurrence.until ?? null,
      }
    : undefined,
  reminder: task.reminder?.offset ? { offset: task.reminder.offset } : undefined,
});

const copieDEtape = (etape, parentId) => ({
  title: etape.title,
  parentId,
  ...(etape.description ? { description: etape.description } : {}),
});

/**
 * Crée la copie, puis ses étapes dans leur ordre, et propose d'annuler.
 *
 * @param {object} task
 * @param {{
 *   api: {createTask: Function, listChildren: Function, deleteTask: Function},
 *   refresh: (options?: object) => Promise<void>,
 *   toast: Function,
 * }} deps
 */
export const dupliquer = async (task, { api, refresh, toast }) => {
  try {
    const copie = await api.createTask(copieDe(task));

    if (task.childCount > 0) {
      const { tasks: etapes = [] } = await api.listChildren(task._id);
      // l'une après l'autre : l'ordre de création est l'ordre d'affichage
      for (const etape of etapes) {
        await api.createTask(copieDEtape(etape, copie._id));
      }
    }

    await refresh({ silent: true });
    toast('Tâche dupliquée.', 'success', {
      label: 'Annuler',
      onClick: async () => {
        try {
          // la corbeille emporte la famille entière : les étapes suivent
          await api.deleteTask(copie._id);
          await refresh({ silent: true });
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    });
  } catch (error) {
    toast(error.message, 'error');
    await refresh({ silent: true });
  }
};
