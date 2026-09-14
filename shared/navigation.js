const CLIENT_CODE = /^CLI-\d{4}-[A-Z]{2}-\d{6}$/;
const EVENT_CODE = /^EVT-[A-Z0-9]{12}$/;
const VIEWS = new Set(["overview", "assistant", "clients", "dossiers", "client", "calendar", "administration"]);

export function normalizeClientCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return CLIENT_CODE.test(code) ? code : "";
}

export function normalizeEventCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return EVENT_CODE.test(code) ? code : "";
}

export function normalizeCalendarDate(value) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : "";
}

export function calendarDateForInstant(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

/** Toronto midnight, independent of the browser's zone and DST on this date. */
export function calendarDayStart(value) {
  const date = normalizeCalendarDate(value);
  if (!date) return "";
  const midnight = Date.parse(`${date}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto", timeZoneName: "shortOffset"
  });
  let instant = midnight;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zone = formatter.formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName").value;
    const offset = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(zone);
    if (!offset) return "";
    const minutes = (Number(offset[2] || 0) * 60 + Number(offset[3] || 0)) * (offset[1] === "-" ? -1 : 1);
    const next = midnight - minutes * 60_000;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant).toISOString();
}

export function readWorkspaceRoute(search = "") {
  const params = new URLSearchParams(search);
  const view = VIEWS.has(params.get("view")) ? params.get("view") : "assistant";
  return {
    view,
    client: view === "client" ? normalizeClientCode(params.get("client")) : "",
    event: view === "calendar" ? normalizeEventCode(params.get("event")) : "",
    date: view === "calendar" ? normalizeCalendarDate(params.get("date")) : ""
  };
}

export function workspaceUrl(route) {
  const params = new URLSearchParams({ view: VIEWS.has(route?.view) ? route.view : "assistant" });
  if (route?.view === "client" && normalizeClientCode(route.client)) params.set("client", normalizeClientCode(route.client));
  if (route?.view === "calendar") {
    if (normalizeEventCode(route.event)) params.set("event", normalizeEventCode(route.event));
    if (normalizeCalendarDate(route.date)) params.set("date", normalizeCalendarDate(route.date));
  }
  return `?${params}`;
}

export function clientUrl(code) {
  return normalizeClientCode(code) ? workspaceUrl({ view: "client", client: code }) : "";
}

/** Links are built from business identifiers, never from a model-supplied URL. */
export function buildCalendarLinks(events = [], { limit = null } = {}) {
  const visible = Number(limit) > 0 ? events.slice(0, Number(limit)) : events;
  const seen = new Set();
  return visible.flatMap((event) => {
    const code = normalizeEventCode(event?.code_evenement);
    const date = calendarDateForInstant(event?.debut);
    if (!code || !date || seen.has(code)) return [];
    seen.add(code);
    return [{
      kind: "calendar", code, date,
      label: `Voir le rendez-vous : ${String(event.titre || "Événement").slice(0, 160)}`,
      href: workspaceUrl({ view: "calendar", event: code, date })
    }];
  });
}

export function clientReferenceParts(content) {
  return String(content).split(/(\bCLI-\d{4}-[A-Z]{2}-\d{6}\b)/gi).map((text) => ({
    text, href: clientUrl(text)
  }));
}
