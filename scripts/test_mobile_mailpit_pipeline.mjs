import { readFile } from "node:fs/promises";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).map(line => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(match => [match[1], match[2]]));
const token = env.N8N_MOBILE_TOKEN?.trim();
if (!token || token.length < 43) throw new Error("Secret mobile local absent ou trop court.");
if (env.MOBILE_DELIVERY_MODE !== "MAILPIT") throw new Error("Le serveur local n'est pas en mode MAILPIT.");

const headers = { "content-type": "application/json", "x-tonia-mobile-token": token };
const post = async (url, body, timeout = 120000) => {
  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} a répondu ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
};

const jobId = "a".repeat(64);
const representativeId = "12345678-1234-4234-8234-123456789012";
const association = { state: "UNASSIGNED" };
const subject = "Tonia — TEST LOCAL — synthèse mobile c0ffee01";
const before = await fetch("http://127.0.0.1:8025/api/v1/messages").then(response => response.json());

const summaryResult = await post("http://127.0.0.1:5678/webhook/mobile/synthese-segment", {
  jobId,
  representativeId,
  association,
  source: "TRANSCRIPT",
  text: "Conversation fictive de recette. Camille Exemple souhaite être rappelée demain pour discuter d'un projet hypothécaire. Aucun montant n'est confirmé.",
  previousSummary: "",
});
if (typeof summaryResult.summary !== "string" || !summaryResult.summary.trim()) throw new Error("Synthèse locale absente.");

const receipt = await post("http://127.0.0.1:5678/webhook/mobile/test/envoyer-note", {
  jobId,
  representativeId,
  association,
  recipient: "recette@example.invalid",
  subject,
  text: `TEST LOCAL — aucun envoi externe.\n\n${summaryResult.summary}`,
});
if (receipt.accepted !== true || receipt.deliveryMode !== "MAILPIT" || !receipt.messageId) throw new Error("Accusé Mailpit invalide.");

let captured = false;
let total = before.total;
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const messages = await fetch("http://127.0.0.1:8025/api/v1/messages").then(response => response.json());
  total = messages.total;
  captured = messages.messages.some(message => message.Subject === subject);
  if (captured) break;
}
if (!captured) throw new Error("Le message a été accepté, mais Mailpit ne l'a pas capturé dans le délai prévu.");

console.log(JSON.stringify({
  summaryGenerated: true,
  summaryLength: summaryResult.summary.length,
  smtpAccepted: true,
  mailpitCaptured: true,
  messagesBefore: before.total,
  messagesAfter: total,
  externalDelivery: false,
}, null, 2));
