# Journal des versions

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Le projet suit le [versionnage sémantique](https://semver.org/lang/fr/).

Une version se publie en étiquetant un commit : `npm version <niveau>` puis
`git push --follow-tags`. L'étiquette construit l'installeur et le dépose en
release brouillon ; publier ce brouillon dans GitHub est ce qui la rend visible
des postes déjà installés.

## [3.15.0] — 2026-09-27

> Les versions 3.4.0 à 3.14.0 n'ont pas été publiées séparément : chacune
> note un changement, et toutes parviennent ensemble aux postes installés
> avec la 3.15.0.

### Ajouté

- **Noter une idée de partout : `Ctrl+Alt+N`.** Depuis n'importe quelle
  application, le Cahier revient, le curseur dans la saisie. Il se désactive
  dans Réglages → En arrière-plan.

## [3.14.0] — 2026-09-27

### Ajouté

- **Les notifications se cliquent.** Un rappel ouvre sa tâche dans « Modifier »,
  même si elle n'est pas sur la page affichée ; le point du matin ouvre la vue
  « aujourd'hui ». Jusqu'ici, cliquer une notification ne menait nulle part.

## [3.13.0] — 2026-09-26

### Ajouté

- **Le point du matin.** Réglages → En arrière-plan : à l'heure choisie (7 h à
  10 h), une notification dit ce qui tombe aujourd'hui, ce qui est en retard et
  ce qui est dans ma journée. Une fois par jour, même si le Cahier est relancé ;
  jamais passé midi ; et rien les matins où rien n'attend. Désactivé tant
  qu'on ne l'a pas demandé.

## [3.12.0] — 2026-09-26

### Ajouté

- **Tous les raccourcis sur une fiche.** `?` (ou `Ctrl+K` → « Raccourcis
  clavier ») montre chaque touche et ce qu'elle fait, rangées par usage.

## [3.11.0] — 2026-09-26

### Modifié

- **Fermer la fenêtre ne ferme plus le Cahier : il se range dans la zone de
  notification, et les rappels continuent de sonner.** Jusqu'ici, un rappel ne
  partait que fenêtre ouverte — ranger l'application, c'était taire ses
  rappels, justement quand on comptait sur eux. Un clic sur l'icône rouvre le
  Cahier ; « Quitter » dans son menu le ferme pour de bon. Pour retrouver
  l'ancien comportement : Réglages → En arrière-plan.

### Ajouté

- **Ouvrir le Cahier avec Windows.** Réglages → En arrière-plan : il démarre
  discrètement dans la zone de notification à l'ouverture de session, prêt à
  rappeler. Désactivé tant qu'on ne l'a pas demandé.

## [3.10.1] — 2026-09-26

### Corrigé

- **Annuler un « Rayer » en lot ne laisse plus une série en double.** Rayer
  une tâche récurrente fait naître l'occurrence suivante ; « Annuler » ne
  décochait que l'originale, et la série se retrouvait deux fois dans la liste.
  L'occurrence née du « Rayer » part désormais avec lui.
- **« Tous les N jours ouvrés » ne part plus faux dans l'agenda.** L'export le
  traduisait en « chaque jour ouvré, une semaine sur N ». Sans équivalent dans
  le format des agendas, la tâche part désormais sans répétition : un
  événement juste plutôt qu'une série fausse.

## [3.10.0] — 2026-09-26

### Ajouté

- **Dupliquer une tâche, étapes comprises.** `d` au clavier, ou « Dupliquer »
  dans « Modifier » : la valise, la clôture du mois, la liste de courses se
  refont en un geste. La copie reprend tout ce qui décrit la tâche — notes,
  catégorie, priorité, étiquettes, échéance, répétition, rappel — et ses
  étapes repartent décochées. « Annuler » la met à la corbeille.

## [3.9.0] — 2026-09-26

### Ajouté

- **Les tâches datées dans votre agenda.** Réglages → Données → « Vers un agenda
  (.ics) », ou `Ctrl+K` → « Exporter vers un agenda » : un fichier à importer
  dans Outlook, Google Agenda ou Thunderbird, avec les répétitions et les
  rappels. Le réimporter plus tard met les événements à jour au lieu de les
  dédoubler.

## [3.8.0] — 2026-09-26

### Ajouté

- **Le bilan de la semaine.** Sous la jauge d'avancement, sept barres disent ce
  qui a été rayé chaque jour, et le sous-titre salue le travail du jour (« 2
  rayées aujourd'hui »). Le Cahier retient désormais la date à laquelle une
  tâche est rayée ; celles rayées avant cette version n'en ont pas, et ne sont
  pas comptées plutôt que d'être toutes datées d'aujourd'hui.

## [3.7.0] — 2026-09-26

### Ajouté

- **Choisir combien de tâches tient une page.** Réglages → La liste : 5, 10, 20
  ou 50. Cinq restent le défaut ; au-delà, on tourne moins les pages.

## [3.6.0] — 2026-09-26

### Ajouté

- **Agir sur plusieurs tâches d'un coup.** `Ctrl`+clic sur des lignes, ou `s`
  au clavier sur la ligne courante, et une barre paraît sous la liste : rayer,
  mettre dans ma journée, reporter à demain, ranger dans une catégorie, changer
  la priorité ou mettre à la corbeille. Chaque geste se défait par « Annuler ».
  La sélection tient d'une page à l'autre ; `Échap` la vide, et `Ctrl+K` →
  « Choisir toutes les tâches de la page » prend toute la page.

## [3.5.1] — 2026-09-26

### Corrigé

- **Cocher des tâches en lot par l'API ne coupe plus les séries.** Une tâche
  récurrente cochée via `POST /tasks/bulk` ne faisait pas naître la suivante :
  la série s'arrêtait sans rien dire. Le lot suit désormais la même règle qu'une
  tâche cochée à l'unité.

## [3.5.0] — 2026-09-26

### Ajouté

- **Un carnet de nuit.** Réglages → Apparence → Thème : « Papier », « Carnet de
  nuit » (papier bleu-noir, encre pâle) ou « Comme Windows », qui bascule en
  même temps que le système, Cahier ouvert. Le surligneur passe à l'ocre et les
  couleurs de catégorie s'éclaircissent, pour que rien ne se perde dans le
  fond. Le thème est reposé dès l'ouverture : pas d'éclair crème avant la nuit.

## [3.4.0] — 2026-09-26

### Ajouté

- **Une sauvegarde chaque jour, sans y penser.** Au lancement, puis toutes les
  heures tant qu'il reste ouvert, le Cahier dépose une copie complète si la
  dernière date d'un jour ou plus, et garde les quatorze dernières. Jusqu'ici,
  tout reposait sur un clic « Sauvegarder » qu'on oublie. Les Réglages, section
  « Données », disent où elles se trouvent. Une base qui repart vide n'est pas
  copiée : elle chasserait une à une les copies qui contiennent encore tout.

### Corrigé

- **Remplacer la base depuis l'application installée ne bute plus sur son
  dossier de sauvegarde.** La copie de sécurité prise juste avant d'effacer
  était écrite à côté du programme, dans une archive en lecture seule : le
  remplacement échouait. Elle va désormais dans `%APPDATA%\Cahier\sauvegardes`,
  qui survit aux mises à jour.

## [3.3.0] — 2026-09-23

### Ajouté

- **Ma journée.** Le ☀ d'une ligne, ou `m` au clavier, pose la tâche dans la
  journée ; la pastille « Ma journée » ne montre qu'elles, avec le compte de ce
  qui reste. On y choisit ce qu'on fera aujourd'hui, sans toucher aux
  échéances. La liste se vide d'elle-même le lendemain : rien à nettoyer, et
  ce qui n'a pas été fait reste dans le cahier, simplement plus dans la
  journée. Le Cahier peut s'ouvrir directement dessus, dans les Réglages.
- **Deux nouvelles récurrences : les jours ouvrés et l'année.** « Chaque jour
  ouvré » saute le week-end — un point du vendredi revient le lundi. « Chaque
  année » sert aux anniversaires, aux échéances d'assurance, à la déclaration
  d'impôts ; posée un 29 février, elle revient le 28 les années ordinaires.
- **La récurrence s'écrit dans la saisie rapide.** `Poubelles tous les mardis`,
  `Loyer chaque mois`, `Standup chaque jour ouvré 9h30`, `Filtre toutes les 2
semaines` : l'aperçu montre la répétition comprise, et l'échéance est posée
  d'office sur la prochaine occurrence, puisqu'une série a besoin d'une date
  pour avancer. Un choix fait dans le menu l'emporte toujours sur le texte.
- **La fenêtre « Modifier » règle aussi la récurrence et le rappel.** Jusqu'ici
  ils ne se choisissaient qu'à la création : arrêter une série demandait de
  supprimer la tâche, et un rappel oublié ne pouvait plus être ajouté. Une
  série « toutes les 2 semaines » garde son rythme quand on ne corrige que le
  titre.
- **Reporter une tâche d'un geste.** Une tâche en retard porte « → demain » ;
  au clavier, `r` repousse la tâche sélectionnée au lendemain et `R` au lundi
  qui vient, en gardant son heure. Trier ses retards ne demande plus d'ouvrir
  « Modifier » et de retaper une date.
- **Reporter tous les retards d'un coup.** `Ctrl+K` → « Reporter les retards à
  demain » : chaque tâche en retard glisse au lendemain en gardant son heure,
  et « Annuler » les remet toutes où elles étaient.
- **La recherche trouve les étapes.** Chercher « acompte » remonte le dossier
  « Devis cuisine » qui contient « Verser l'acompte », avec une note en marge
  qui dit quelle étape a répondu. Jusqu'ici, une étape était introuvable tant
  qu'on ne se souvenait pas de son dossier.

### Corrigé

- **Un rappel déjà parti ne repart plus quand on modifie la tâche.** Enregistrer
  depuis « Modifier », même pour corriger une faute dans le titre, remettait le
  rappel à zéro : la notification Windows réapparaissait dans la minute.
  Déplacer l'échéance ou changer le réglage du rappel le réarme toujours.

## [3.2.0] — 2026-09-18

### Modifié

- **Sauvegarder et Restaurer… passent dans les Réglages**, sous une section
  « Données », juste au-dessus du bloc qui nomme le dossier où vivent les
  données. La barre latérale ne garde que la Corbeille, qui se consulte
  souvent ; ces deux gestes-là sont rares et n'avaient pas à occuper une place
  permanente. Restaurer fusionne toujours sans rien remplacer.

## [3.1.1] — 2026-09-17

### Corrigé

- **La page se charge à nouveau en entier.** Le minuteur du bandeau de mise à
  jour appelait `setInterval` d'une façon que le navigateur refuse ; l'exception
  interrompait `app.js` en cours d'évaluation, et tout ce qui venait après —
  dont le chargement des tâches — ne se faisait plus. Le défaut est arrivé avec
  la 3.1.0 et n'a jamais été vu : le cache de l'ancienne version masquait la
  page neuve.
- **Le bandeau de mise à jour ne squatte plus le haut de l'écran.** Sa mise en
  forme l'emportait sur l'ordre de le cacher : il restait affiché en
  permanence, vide, avec ses deux boutons actifs. Cliquer « Redémarrer
  maintenant » arrêtait alors la base pour installer une version qui n'existait
  pas. Désormais tout élément marqué caché l'est réellement.
- **Une mise à jour qui ne peut pas s'installer le dit.** Le refus arrivait par
  le même canal qu'une coupure de réseau, que le Cahier passe volontairement
  sous silence : le bandeau annonçait « Fermeture du Cahier… » et y restait.
  Il explique maintenant quoi faire — fermer et rouvrir, la version se posant
  à la fermeture.
- **Une mise à jour se voit enfin.** Le Cahier posait bien la nouvelle version,
  puis rouvrait l'interface de l'ancienne : la coquille était servie depuis un
  cache local qui n'expirait jamais. On pouvait donc installer la 3.1.0, lire
  « Le Cahier est à jour », et n'avoir ni la page Réglages ni le bandeau de
  mise à jour. La page demande désormais toujours au serveur avant de puiser
  dans le cache, qui ne sert plus que lorsque le serveur est éteint.
- **L'ouverture hors ligne retrouve la page entière.** Quatre modules arrivés
  avec la 3.1.0 — réglages, apparence, préférences, mise à jour — et les traits
  au crayon n'étaient pas conservés pour l'usage sans serveur.

### Modifié

- **Le projet s'appelle Cahier partout.** L'application portait déjà ce nom ;
  le dépôt, le paquet et le README disaient encore « to-do manager ». L'adresse
  du dépôt devient `github.com/Lurrod/cahier` — GitHub redirige l'ancienne, donc
  un clone existant et les mises à jour des postes installés continuent de
  fonctionner sans rien changer.

## [3.1.0] — 2026-09-17

### Ajouté

- **Une page Réglages**, ouverte par le bouton de l'en-tête ou par la palette
  (`Ctrl`+`K`). Elle dit aussi où en est la mise à jour, permet d'en chercher
  une sans attendre le prochain lancement, et nomme la version installée ainsi
  que le dossier où vivent les données.
- **L'apparence se règle** : densité des lignes, taille du texte, grain du
  papier, et traits au crayon — ces derniers peuvent être rangés, ce qui allège
  nettement l'affichage sur une longue liste. Le choix est repris tel quel au
  lancement suivant, sans que la page s'ouvre d'abord dans l'autre mise en page.
- **La vue d'ouverture se règle** : le Cahier peut s'ouvrir directement sur les
  tâches à faire de la semaine, triées par échéance, plutôt que sur tout.
- **Une préférence pour la mise à jour** : décocher « prévenir quand une version
  est prête » fait disparaître le bandeau — la version se posera alors sans un
  mot à la fermeture.

### Modifié

- **La mise à jour se propose dans le Cahier, plus dans une boîte Windows.**
  Un bandeau de papier s'affiche en haut de la page, avec les mots de
  l'application : « La version 3.1.0 est prête. » Rien ne s'affiche tant que la
  version n'est pas téléchargée, et « Plus tard » ne la fait pas revenir toutes
  les minutes — elle se posera à la fermeture, comme avant.
- Un redémarrage qui échoue s'explique désormais dans ce même bandeau, au lieu
  d'une seconde boîte de dialogue.

## [3.0.1] — 2026-09-17

### Modifié

- Le sous-titre « to-do manager » disparaît de l'en-tête, du titre de la fenêtre
  et du manifeste : l'application s'appelle Cahier, et le répéter autrement ne
  disait rien de plus.
- **L'icône Windows porte enfin sept tailles** (16 à 256 px) au lieu d'une
  seule. Windows ne réduit pas gracieusement : le trait fin du carnet devenait
  illisible à 16 px dans l'Explorateur. L'installeur et le désinstalleur la
  portent aussi, ce qui n'était pas le cas.

### Documenté

- Les deux avertissements Windows — celui du navigateur au téléchargement et
  celui de SmartScreen au lancement — sont distingués dans le README, avec la
  marche à suivre pour chacun. Aucun réglage ne les supprime : ils portent sur
  l'absence de signature, pas sur le contenu du fichier.
- `SECURITY.md` chiffre ce que signer demanderait, et note que `release.yml`
  signerait sans modification dès que les secrets seraient posés.

## [3.0.0] — 2026-09-17

### Ajouté

- **Mise à jour automatique** depuis les releases GitHub. Le téléchargement se
  fait en fond, sans rien interrompre ; le redémarrage n'est proposé qu'une
  fois la version sur le disque, et se reporte à la fermeture si on décline.
  Une panne de réseau reste silencieuse : le Cahier s'utilise hors ligne.
- **Intégration continue** (`.github/workflows/ci.yml`) : formatage, audit des
  dépendances de production et 400 tests avec seuils de couverture, sur
  Windows, à chaque poussée et chaque PR.
- **Chaîne de publication** (`.github/workflows/release.yml`) : une étiquette
  `vX.Y.Z` construit l'installeur et le dépose en release **brouillon**. Plus
  aucune release ne sort d'un poste de développement. L'étiquette est confrontée à
  `package.json` avant de construire quoi que ce soit. Publier le brouillon reste
  un geste manuel : c'est lui qui déclenche la mise à jour des postes installés.
- `LICENSE` (ISC), `SECURITY.md` et ce journal.
- `SECURITY.md` nomme ce que l'application ne protège pas — absence
  d'authentification, données en clair au repos — et les trois risques acceptés
  à date.
- Dependabot : une PR groupée par semaine, montées majeures d'Electron
  volontairement ignorées.
- Prettier, avec `npm run format` et un contrôle bloquant en CI.
- Seuils de couverture bloquants : 85 % des lignes côté API, 88 % côté
  interface. Ils sont posés sous le niveau atteint — ils empêchent de
  redescendre plutôt que de récompenser.
- `scripts/fetch-mongod.js` : le binaire Mongo embarqué est téléchargé à une
  version écrite noir sur blanc, au lieu d'être pris dans le cache de la
  machine qui construit.

### Modifié

- `package-lock.json` est désormais versionné. Deux constructions à deux dates
  donnaient jusqu'ici deux applications différentes.
- Express 4.21 → 4.22 et Mongoose 8.9 → 8.24 : trois vulnérabilités modérées
  levées dans ce qui est installé chez les utilisateurs.
- L'arrêt des services (le verrou Mongo) est relâché par une fonction unique,
  qu'on ferme la fenêtre ou qu'on pose une mise à jour.
- Les notes de planification (`docs/`) sortent du dépôt. Ce qui devait survivre
  est dans `SECURITY.md`, `CHANGELOG.md` et `README.md`.

### Corrigé

- **Les icônes de l'application étaient des canevas blancs.** Le générateur
  d'origine chargeait `favicon.svg` par `<img src=…>` et n'obtenait rien : ce
  qui a été livré avec la 2.0.0 comme icône du raccourci, de la barre des
  tâches, de l'installeur et de la PWA était une image cassée. Mesuré à 0,86 %
  d'encre contre 82,5 % après réparation. `npm run icons` les refabrique à
  partir du SVG, désormais inséré dans la page et non référencé — et refuse
  d'écrire un rendu vide.

### Sécurité

- **Express 4 → 5.** La faille `qs` que le projet portait en risque accepté
  disparaît : les dépendances de production ne présentent plus aucune
  vulnérabilité connue. L'analyseur de requête d'Express 5 est par ailleurs plus
  strict — une porte de moins pour glisser un objet dans un paramètre d'URL.

  Montée vérifiée autrement que par la couleur de la CI : trente requêtes
  identiques rejouées sous 4.22.1 puis 5.2.1 — injections d'opérateurs Mongo,
  paramètres en tableau, routes à point, 404, validation de corps — réponses
  identiques, aux horodatages près.

- `.env` n'est plus suivi par git. Il l'était malgré le `.gitignore`, ajouté
  avant celui-ci : le jour où quelqu'un y aurait mis une URI Atlas avec un mot
  de passe, ce mot de passe partait dans un commit.

## [2.0.0] — 2026-09-16

Le Cahier devient une application installable, et gagne de quoi tenir un vrai
usage quotidien.

### Ajouté

- **Application Windows** : Electron, MongoDB embarqué, installeur NSIS de
  88 Mo, raccourci bureau et menu Démarrer. Aucune installation préalable, rien
  à télécharger au premier lancement.
- **Installable comme PWA** depuis le navigateur.
- **Vues temporelles** (aujourd'hui, semaine, en retard) et compteur de tâches
  en retard.
- **Saisie rapide en langage naturel** avec aperçu de ce qui a été compris.
- **Corbeille** : suppression réversible, restauration, purge confirmée.
- **Raccourcis clavier et palette de commandes**, navigable au clavier.
- **Sous-tâches** sur un niveau, avec compte des étapes et cochage en cascade.
- **Récurrence** : cocher une tâche récurrente crée l'occurrence suivante.
- **Étiquettes**, posables à la saisie et filtrables.
- **Ordre manuel** par glisser-déposer, sur indexation fractionnaire.
- **Rappels** avec notification système Windows.
- **Sauvegarde et restauration** : export JSON complet, import en fusion ou en
  remplacement confirmé, exports lisibles en Markdown et CSV, sauvegarde
  horodatée en ligne de commande et depuis l'interface.
- **Actions groupées** sur une sélection de tâches.
- `GET /healthz`, et démarrage tolérant à un port déjà occupé.
- Refonte graphique : le papier, l'encre et le trait dessiné.

### Corrigé

- Un import aux identifiants dupliqués est refusé **avant** d'effacer la base.
- Un import en remplacement qui échoue en cours d'écriture remet la base en
  place.
- L'application empaquetée écrit ses données dans `%APPDATA%\Cahier`, quel que
  soit le mode de lancement — trois chemins différents cohabitaient.
- Le verrou WiredTiger est relâché avant la sortie d'Electron.

### Sécurité

- Une cellule d'export CSV commençant par `=`, `+`, `-` ou `@` est neutralisée :
  un tableur l'exécuterait comme une formule.
- Les erreurs de lecture du corps de requête répondent en JSON assaini.

## Avant 2.0.0

Aucun journal n'était tenu. L'historique se lit dans les commits, depuis le
premier le 5 février 2025.
