# SDD ledger — plan: docs/superpowers/plans/2026-11-24-mcp-calendar-todos.md

Exécution native inline, branche `feat/calendar-todos-issue-73` (HEAD de départ 35b0a3b).
Ruling d'ouverture : l'utilisateur a décliné le script sdd-workspace → pas de workspace SDD ;
ledger tenu ici. Consigne utilisateur : AUCUN commit — les steps « commit » du plan sont sans
objet, la vérification se fait par runs de tests ; le range commits de task-done est n/a.
Pré-flight : Tâches 1-3 partagent `tests/todos.test.mjs` (blocs describe distincts, append-only)
et modifient des méthodes distinctes de `calendar-client.ts` (listTodos / createEvent /
updateEvent) et des blocs tools distincts de `index.ts` → aucun conflit d'interface.

Task 1: complete (pas de commit — consigne ; tests: npm run build && node --test tests/todos.test.mjs → 2/2 PASS ; suite complète npm test → 43/43 PASS)

Task 2: complete (pas de commit — consigne ; tests: npm run build && node --test tests/todos.test.mjs tests/attendees.test.mjs → 14/14 PASS ; RED vu : 3 échecs attendus avant implémentation)

Task 3: complete (pas de commit — consigne ; tests: npm run build && node --test tests/todos.test.mjs tests/attendees.test.mjs tests/timezone.test.mjs → 26/26 PASS ; RED vu : 5 échecs attendus avant implémentation)

Task 4: complete (pas de commit — consigne ; README à jour (nouvel outil #3, params create/update, notes alarmes) ; tests: npm test → 53/53 PASS)

## Revue finale (sous-agent frais, modèle par défaut)

Verdict : « With fixes » — 0 critique, 2 importants, 5 mineurs. Re-grade par effet puis UNE passe de correctifs :

Final: fixed « calendar_id silencieusement ignoré sur une tâche (no-op silencieux) » — honoré via le PUT complet (routage : calendarId fourni → PUT complet). Test « calendar_id on a task update moves it via the full task PUT » RED→GREEN, suite 55/55.
Final: fixed « PUT complet todo envoyait location: null / due_date: "" (risque 422 Laravel : règles 'string' sans nullable, absent = skipped) + private non préservé (mineur #4 re-grué Important par effet : renommer une tâche privée la rendrait publique) » — omission quand absent (pattern du chemin event existant), private préservé. Test « the full task PUT omits absent location/due_date and preserves private » RED→GREEN, suite 55/55.
Final: Ruling: contrat API live non vérifié par smoke test — `completed` omis sur progression-only est confirmé sûr par les sources backend (editVTodoCompleted(null) = aucun changement, CalendarController:668 → ICS.php:251-260) ; les omissions location/due_date sont sûres (champ absent = validation skippée, même pattern que le chemin event). Le smoke test live (créer → cocher → progresser → renommer) écrit dans le vrai calendrier de l'utilisateur → non exécuté sans son accord. — coût si faux : erreur d'outil sur un cas live non couvert par les stubs.

Final: minor (deferred): tests/verify.mjs — checklist des méthodes non étendue avec listTodos.
Final: minor (deferred): branches non testées (description seule, progress+title) — même code path que title seul.
Final: minor (deferred): erreur listTodos sans `await response.text()` (cohérence avec l'ancien listEvents, mais moins diagnostiquable).
Final: minor (deferred): updateEvent à 11 params positionnels (transposition notifyAttendees/done invisible au typage) — futur refactor options object.

