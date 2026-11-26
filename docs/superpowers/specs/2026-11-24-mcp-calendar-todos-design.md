# Design : support des tâches (todos) dans le MCP calendar — issue #73

## Intent & pourquoi

Le MCP `mcp-server-calendar` ne gère que les événements. Les tâches créées dans l'app
Infomaniak Calendar (to-dos avec état done) sont invisibles : impossibles à lister, créer
ou cocher. L'issue #73 demande ce support pour des usages du type « ajoute une tâche
d'envoyer le document d'assurance » / « la tâche paiement condo est-elle cochée ? ».

Contrainte : KISS — le strict nécessaire pour couvrir l'issue, en s'appuyant sur les
endpoints existants de l'API (vérifiés dans les sources workspace-ng, backend `ws-app`
et front `calendar.api.service.ts`).

## Faits API (source workspace-ng)

- Les tâches sont des événements avec `type: "todo"` (valeur API ; la route de listing
  s'appelle `pim/task`). Pas de conversion event↔todo (`cannot change object type`).
- Listing : `GET /1/calendar/pim/task?calendar_id=X` — sans plage de dates (todos sans
  start/end). Forme : `{id, calendar_id, type, title, description, due_date, location,
  private, done, progress, priority, has_attachments, created_at, updated_at}`.
- Création : `POST /1/calendar/pim/event` avec `type: "todo"`. Validation backend :
  `start/end/timezone_*/fullday` requis seulement si `type=event` ; `progress` (int) et
  `priority` (int 0–10) requis si `type=todo` ; `due_date` optionnel (`YYYY-MM-DD` ou
  `YYYY-MM-DD HH:mm:ss`). Attendees/rrule ignorés pour les todos.
- Update : `PUT /1/calendar/pim/event/{id}` avec `done` (bool) → `STATUS: COMPLETED` /
  `NEEDS-ACTION`. `progress` + `priority` requis à nouveau si type=todo. Piège : le PUT
  complet réinitialise les alarmes du todo (absentes de la forme JSON, non préservables).
- Endpoint dédié checkbox : `PUT /1/calendar/pim/event/{id}/todo-progression` avec
  `{progression, completed}` — ne touche que PERCENT-COMPLETE et STATUS, zéro effet de
  bord. C'est ce que le front utilise (`calendar.api.service.ts:371-374`).
- `GET`/`DELETE /event/{id}` fonctionnent déjà pour les todos via les outils MCP existants.

## Approches considérées

1. **Filtre `type` sur `calendar_list_events`** — rejeté : l'API n'a pas ce filtre sur
   l'endpoint de plage, et les todos n'ont pas de dates (from/to sans objet).
2. **PUT complet comme unique chemin d'update des todos** — rejeté comme chemin
   principal : efface les alarmes silencieusement ; l'endpoint `todo-progression` est
   fait pour la checkbox.
3. **Retenu** : outil de listing dédié + `type` sur create + `done`/`progress` sur
   update, avec routage interne progression vs PUT complet (ci-dessous).

## Design

### `src/calendar-client.ts`

- `listTodos(calendarId?)` : fallback calendrier par défaut (même pattern que
  `listEvents`), `GET /1/calendar/pim/task?calendar_id=…`.
- `createEvent(...)` : params optionnels `type` (`"event"` défaut | `"todo"`),
  `dueDate`, `priority`, `progress`. Si `todo` → corps todo : `{type: "todo",
  calendar_id, title, description, due_date?, progress: ?? 0, priority: ?? 0,
  alarms: [], attachments: []}` (sans start/end/timezone/freebusy/fullday/attendees).
  Sinon comportement actuel inchangé.
- `updateEvent(...)` : params optionnels `done` (bool), `progress` (int). Après le
  `getEvent` existant, si `event.type === "todo"` :
  - si seuls `done`/`progress` sont fournis → `PUT …/todo-progression`
    `{progression: progress ?? event.progress ?? 0, completed: done}` ;
  - si title/description aussi → PUT complet todo (progress/priority repris de
    l'existant, défauts 0 ; `done` omis si non fourni → STATUS inchangé).
  Sinon comportement actuel inchangé (`done` ignoré pour les events).

### `src/index.ts`

- Nouvel outil `calendar_list_todos` (`calendar_id` optionnel).
- `calendar_create_event` : `start`/`end` deviennent optionnels ; ajout `type`,
  `due_date`, `priority`, `progress` (optionnels). Si type ≠ todo et start/end absents
  → erreur claire côté client.
- `calendar_update_event` : ajout `done`, `progress` (optionnels).

### README + tests

- README : nouvel outil, nouveaux params, note « todo = tâche » (vocabulaire API).
- Tests (node:test + stub fetch, style `tests/attendees.test.mjs`) : corps de création
  todo (sans start/end, défauts 0), routage update (progression vs PUT complet),
  fallback calendrier par défaut de `listTodos`.

## Vocabulaire

`todo` partout (valeur API), l'outil s'appelle `calendar_list_todos`. Alternative
`calendar_list_tasks` écartée pour cohérence avec la valeur du champ `type`.

## Hors périmètre (non-goals)

- Édition de `due_date`/`priority`/`alarms` des todos existants (extension facile).
- Conversion event↔todo (interdite par l'API).
- `progress`/`priority` exposés en édition fine (défauts 0 suffisent pour l'issue).
