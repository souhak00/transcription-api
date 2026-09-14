import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCalendarLinks, calendarDateForInstant, calendarDayStart, clientReferenceParts, clientUrl,
  normalizeCalendarDate, readWorkspaceRoute, workspaceUrl
} from "../../shared/navigation.js";
import {
  clientPreferencesKey, normalizeClientPreferences, readClientPreferences, saveClientPreferences
} from "../../web/src/clientPreferences.js";

const CODE = "CLI-2026-AB-000001";
const EVENT = "EVT-123456789ABC";

test("les URL métier sont réutilisables sans jeton ni UUID", () => {
  const route = readWorkspaceRoute(clientUrl(CODE.toLowerCase()));
  assert.equal(route.view, "client");
  assert.equal(route.client, CODE);
  assert.equal(clientUrl(CODE), "?view=client&client=CLI-2026-AB-000001");
  assert.equal(readWorkspaceRoute(workspaceUrl(route)).client, CODE);
});

test("les destinations sont limitées aux vues et identifiants du CRM", () => {
  assert.equal(clientUrl("javascript:alert(1)"), "");
  assert.equal(clientUrl("https://outside.test/"), "");
  assert.equal(clientUrl("CLI-2026-AB-000001/../../administration"), "");
  assert.equal(readWorkspaceRoute("?view=https://outside.test").view, "assistant");
  assert.equal(readWorkspaceRoute("?view=client&client=<script>").client, "");
  assert.equal(readWorkspaceRoute("?view=calendar&event=bad&date=2026-02-30").event, "");
  assert.equal(normalizeCalendarDate("2026-02-30"), "");
  assert.equal(normalizeCalendarDate("2028-02-29"), "2028-02-29");
});

test("les codes clients deviennent des liens sans interpréter le HTML du modèle", () => {
  const text = `<script>bad()</script> | ${CODE} | cli-2026-cd-000002 |`;
  const parts = clientReferenceParts(text);
  assert.equal(parts.map((part) => part.text).join(""), text);
  assert.equal(parts.filter((part) => part.href).length, 2);
  assert.equal(parts[0].href, "");
});

test("le lien de rendez-vous utilise la date Toronto, pas la date UTC", () => {
  assert.equal(calendarDateForInstant("2026-09-07T01:00:00Z"), "2026-09-06");
  const [link] = buildCalendarLinks([{ code_evenement: EVENT, debut: "2026-09-07T01:00:00Z", titre: "Rencontre" }]);
  assert.deepEqual(readWorkspaceRoute(link.href), { view: "calendar", client: "", event: EVENT, date: "2026-09-06" });
  assert.equal(link.label, "Voir le rendez-vous : Rencontre");
});

test("les raccourcis agenda correspondent exactement aux résultats présentés", () => {
  const event = { code_evenement: EVENT, debut: "2026-09-07T14:00:00Z" };
  const later = { ...event, code_evenement: "EVT-222222222222" };
  assert.equal(buildCalendarLinks([event, later], { limit: 1 }).length, 1);
  assert.equal(buildCalendarLinks([event, event]).length, 1);
  assert.equal(buildCalendarLinks([{ ...event, code_evenement: "inventé" }]).length, 0);
  assert.equal(buildCalendarLinks([{ ...event, debut: "invalide" }]).length, 0);
  assert.equal(buildCalendarLinks([]).length, 0);
});

test("les bornes de semaine restent à minuit Toronto aux changements d’heure", () => {
  assert.equal(calendarDayStart("2027-02-15"), "2027-02-15T05:00:00.000Z");
  assert.equal(calendarDayStart("2027-07-12"), "2027-07-12T04:00:00.000Z");
  assert.equal(calendarDayStart("2027-03-14"), "2027-03-14T05:00:00.000Z");
  assert.equal(calendarDayStart("2027-11-07"), "2027-11-07T04:00:00.000Z");
  const hours = (start, end) => (Date.parse(calendarDayStart(end)) - Date.parse(calendarDayStart(start))) / 3_600_000;
  assert.equal(hours("2027-03-08", "2027-03-15"), 167);
  assert.equal(hours("2027-11-01", "2027-11-08"), 169);
  assert.equal(calendarDayStart("invalid"), "");
});

test("la personnalisation ne peut pas masquer le statut ni le parcours", () => {
  assert.deepEqual(Object.keys(normalizeClientPreferences({ journey: false, status: false })), [
    "profile", "project", "participants", "consents", "documents", "tasks"
  ]);
  assert.equal(normalizeClientPreferences({ project: false }).project, false);
  assert.equal(normalizeClientPreferences(null).project, true);
});

test("les préférences sont séparées par compte et tolèrent un stockage indisponible", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveClientPreferences(storage, "rep-a", { project: false });
  assert.equal(readClientPreferences(storage, "rep-a").project, false);
  assert.equal(readClientPreferences(storage, "rep-b").project, true);
  values.set(clientPreferencesKey("rep-a"), "not JSON");
  assert.equal(readClientPreferences(storage, "rep-a").project, true);
  assert.equal(readClientPreferences(null, "rep-a").project, true);
  assert.doesNotThrow(() => saveClientPreferences(null, "rep-a", {}));
  const before = values.size;
  saveClientPreferences(storage, "", {});
  assert.equal(values.size, before);
});
