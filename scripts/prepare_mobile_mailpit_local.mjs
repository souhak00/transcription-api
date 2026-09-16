import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const runtimeDirectory = path.join(root, "tmp", "mobile-mailpit-provisioning");
const credentialId = "ToniaMobileHeaderAuthV1";
const credentialName = "Tonia mobile API privée";

const originalEnv = await readFile(envPath, "utf8").catch(error => {
  if (error.code === "ENOENT") return "";
  throw error;
});

const values = new Map();
for (const line of originalEnv.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) values.set(match[1], match[2]);
}

let token = values.get("N8N_MOBILE_TOKEN")?.trim() ?? "";
if (token.length < 43) token = randomBytes(32).toString("base64url");

const desired = new Map([
  ["MOBILE_DELIVERY_MODE", "MAILPIT"],
  ["N8N_MOBILE_SUMMARY_WEBHOOK_URL", "http://host.docker.internal:5678/webhook/mobile/synthese-segment"],
  ["N8N_MOBILE_TEST_EMAIL_WEBHOOK_URL", "http://host.docker.internal:5678/webhook/mobile/test/envoyer-note"],
  ["N8N_MOBILE_EMAIL_WEBHOOK_URL", ""],
  ["N8N_MOBILE_TOKEN", token],
]);

const seen = new Set();
const outputLines = originalEnv.split(/\r?\n/).filter((line, index, lines) => !(index === lines.length - 1 && line === "")).map(line => {
  const match = line.match(/^([A-Z0-9_]+)=/);
  if (!match || !desired.has(match[1])) return line;
  seen.add(match[1]);
  return `${match[1]}=${desired.get(match[1])}`;
});
for (const [name, value] of desired) if (!seen.has(name)) outputLines.push(`${name}=${value}`);
await writeFile(envPath, `${outputLines.join("\n")}\n`, { mode: 0o600 });

await rm(runtimeDirectory, { recursive: true, force: true });
await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });

const workflowFiles = ["mobile_synthese_segment_v1.json", "mobile_capture_mailpit_v1.json"];
for (const fileName of workflowFiles) {
  const source = path.join(root, "n8n-workflows", fileName);
  const workflow = JSON.parse(await readFile(source, "utf8"));
  const webhook = workflow.nodes.find(node => node.type === "n8n-nodes-base.webhook");
  if (!webhook?.credentials?.httpHeaderAuth) throw new Error(`Credential Header Auth absente de ${fileName}`);
  webhook.credentials.httpHeaderAuth = { id: credentialId, name: credentialName };
  const ollama = workflow.nodes.find(node => node.name === "Ollama");
  if (ollama) ollama.parameters.url = "http://host.docker.internal:11434/api/chat";
  workflow.active = false;
  await writeFile(path.join(runtimeDirectory, fileName), `${JSON.stringify(workflow, null, 2)}\n`, { mode: 0o600 });
}

const credential = [{
  id: credentialId,
  name: credentialName,
  type: "httpHeaderAuth",
  data: { name: "x-tonia-mobile-token", value: token },
}];
await writeFile(path.join(runtimeDirectory, "credential.json"), `${JSON.stringify(credential, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  envConfigured: true,
  deliveryMode: "MAILPIT",
  credentialId,
  tokenLength: token.length,
  runtimeDirectory,
  workflows: workflowFiles,
}, null, 2));
