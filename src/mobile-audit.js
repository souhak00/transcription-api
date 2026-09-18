import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ACTIONS = new Set(['JOB_SUBMITTED', 'JOB_ACCESSED', 'JOB_STATUS']);
const RESULT = /^[A-Z_]{2,32}$/;
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT = /^CLI-[0-9]{4}-[A-Z]{2}-[0-9]{6}$/;

/** Journal local borné aux métadonnées : jamais de transcription, notes, jeton ou courriel. */
export function createMobileAuditLogger({ directory = 'outputs/mobile-audit', now = () => new Date() } = {}) {
  const root = path.resolve(directory);
  return async event => {
    if (!ACTIONS.has(event?.action) || !RESULT.test(event?.result ?? '') ||
      !HASH.test(event?.actorHash ?? '') || !UUID.test(event?.representativeId ?? '') ||
      !HASH.test(event?.jobId ?? '')) throw new TypeError('Événement d’audit mobile invalide.');
    const clientCode = event.clientCode == null ? null : String(event.clientCode);
    if (clientCode !== null && !CLIENT.test(clientCode)) throw new TypeError('Code client d’audit invalide.');
    const timestamp = now().toISOString();
    const record = { timestamp, action: event.action, result: event.result,
      actorHash: event.actorHash, representativeId: event.representativeId,
      jobId: event.jobId, clientCode };
    await mkdir(root, { recursive: true, mode: 0o700 });
    await appendFile(path.join(root, `${timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
  };
}
