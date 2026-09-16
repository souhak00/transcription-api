import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MOBILE_FIELDS = ['NOM_CLIENT', 'TELEPHONE', 'COURRIEL_CLIENT', 'TYPE_TRANSACTION', 'OBJECTIF', 'EMPLOI', 'REVENU_ANNUEL', 'DETTES', 'MISE_DE_FONDS', 'PRIX_PROPRIETE', 'ECHEANCE', 'PROCHAINES_ACTIONS'];
export class MobileError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const hash = value => createHash('sha256').update(value).digest('hex');
const REPRESENTATIVE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_CODE = /^CLI-[0-9]{4}-[A-Z]{2}-[0-9]{6}$/;
export const sourceHash = (transcript, personalNotes) => hash(`${transcript.trim()}\0${personalNotes.trim()}`);
export function validMobileEmail(value) {
  return typeof value === 'string' && value === value.trim() && value.length <= 254 && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(value);
}
const fail = message => { throw new MobileError(message); };
const text = (value, max, label) => typeof value === 'string' && value.length <= max && !value.includes('\0') ? value.trim() : fail(`${label} invalide ou trop long.`);
export function normalizeMobileAssociation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Rattachement au dossier manquant.');
  const keys = Object.keys(value);
  if (value.state === 'UNASSIGNED' && keys.length === 1) return { state: 'UNASSIGNED' };
  if (value.state !== 'ASSIGNED' || keys.some(key => !['state', 'clientCode'].includes(key))) fail('Rattachement au dossier invalide.');
  const clientCode = String(value.clientCode ?? '').trim().toUpperCase();
  if (!CLIENT_CODE.test(clientCode)) fail('Code de dossier client invalide.');
  return { state: 'ASSIGNED', clientCode };
}

function normalizeMobileIdentity(value) {
  const subject = String(value?.subject ?? '').trim();
  const representativeId = String(value?.representantId ?? '').trim();
  const email = String(value?.email ?? '').trim().toLowerCase();
  if (value?.role !== 'representant' || !subject || subject.length > 256 || !REPRESENTATIVE_ID.test(representativeId)) {
    throw new MobileError('Compte représentant requis.', 403);
  }
  if (value?.emailVerified !== true || !validMobileEmail(email)) throw new MobileError('Le compte ne possède pas de courriel professionnel vérifié.', 403);
  return { subject, representativeId, email };
}
export function normalizeMobileJob(body) {
  if (!body || !['ANALYSIS', 'EMAIL', 'SUMMARY_EMAIL'].includes(body.kind)) fail('Type de travail invalide.');
  const transcript = text(body.transcript, 500000, 'Transcription');
  const personalNotes = text(body.personalNotes ?? '', 50000, 'Notes');
  if (!transcript) fail('Importez une transcription non vide.');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.noteId ?? '') || !Number.isSafeInteger(body.revision) || body.revision < 1) fail('Version de note invalide.');
  const job = { kind: body.kind, noteId: body.noteId, revision: body.revision, transcript, personalNotes,
    title: text(body.title ?? '', 200, 'Titre'),
    association: normalizeMobileAssociation(body.association),
    ...(body.kind === 'SUMMARY_EMAIL' ? {} : { clientReference: text(body.clientReference ?? '', 160, 'Référence') }),
    sourceHash: sourceHash(transcript, personalNotes) };
  if (body.kind === 'SUMMARY_EMAIL') {
    const delivery = body.delivery;
    if (body.status !== 'FINALIZED' || body.sendConfirmed !== true || !delivery ||
      delivery.sourceHash !== job.sourceHash || delivery.recipientConfirmed !== true ||
      !validMobileEmail(delivery.recipientEmail)) fail('Finalisez la note et confirmez le courriel pour ce contenu.');
    job.delivery = { sourceHash: job.sourceHash, recipientEmail: delivery.recipientEmail, recipientConfirmed: true };
    // Never propagate legacy client rows, reference, summaries or a model-selected recipient.
    delete job.clientReference;
  }
  if (body.kind === 'EMAIL') {
    const review = body.review;
    if (body.status !== 'FINALIZED' || body.sendConfirmed !== true || !review || review.sourceHash !== job.sourceHash ||
      review.recipientConfirmed !== true || !validMobileEmail(review.recipientEmail)) fail('Finalisez la note et confirmez le bon destinataire.');
    if (!Array.isArray(review.rows) || review.rows.length !== MOBILE_FIELDS.length ||
      review.rows.some(row => !row || typeof row !== 'object') ||
      new Set(review.rows.map(row => row.field)).size !== MOBILE_FIELDS.length) fail('Tableau incomplet.');
    const rows = review.rows.map(row => {
      if (!MOBILE_FIELDS.includes(row.field)) fail('Champ client inconnu.');
      const value = text(row.value, 2000, 'Renseignement');
      if (!(row.decision === 'CONFIRMED' && value || row.decision === 'NOT_PROVIDED' && !value)) fail('Validez chaque renseignement, y compris les données non fournies.');
      return { field: row.field, value, decision: row.decision,
        source: text(row.source ?? 'MANUAL', 40, 'Source'), evidence: text(row.evidence ?? '', 4000, 'Extrait') };
    });
    job.review = { sourceHash: job.sourceHash, recipientEmail: review.recipientEmail, recipientConfirmed: true, rows };
    job.summary = text(body.summary ?? '', 50000, 'Résumé');
  }
  return job;
}
export function segmentMobileSources(job, size = 8000) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 8000) throw new MobileError('Taille de segment invalide.');
  return [['TRANSCRIPT', job.transcript], ['PERSONAL_NOTES', job.personalNotes]].flatMap(([source, content]) => {
    const segments = [];
    for (let offset = 0; offset < content.length; offset += size) segments.push({ source, text: content.slice(offset, offset + size) });
    return segments;
  });
}
export function collectMobileFacts(previous, response, segment) {
  const facts = [...previous];
  for (const fact of Array.isArray(response?.facts) ? response.facts.slice(0, 48) : []) {
    if (!fact || !MOBILE_FIELDS.includes(fact.field) || typeof fact.value !== 'string' || !fact.value.trim() || fact.value.length > 2000 ||
        typeof fact.evidence !== 'string' || fact.evidence.trim().length < 5 || fact.evidence.length > 600 || !segment.text.includes(fact.evidence)) continue;
    const candidate = { field: fact.field, value: fact.value.trim(), source: segment.source, evidence: fact.evidence };
    if (!facts.some(row => row.field === candidate.field && row.value === candidate.value && row.source === candidate.source)) facts.push(candidate);
  }
  if (facts.length > 1000) throw new MobileError('Trop de propositions contradictoires : divisez la transcription.', 422);
  return facts;
}
export function mobileReviewResult(facts, input) {
  const rows = MOBILE_FIELDS.map(field => {
    const variants = facts.filter(row => row.field === field);
    const values = [...new Set(variants.map(row => row.value))];
    return { field, value: values.length === 1 ? values[0] : '', source: values.length > 1 ? 'CONFLICT' : variants[0]?.source ?? 'NONE',
      evidence: variants.slice(0, 4).map(row => `[${row.source}] ${row.value} — ${row.evidence}`).join('\n').slice(0, 4000), decision: 'TO_REVIEW' };
  });
  return { sourceHash: input.sourceHash, rows, summary: rows.filter(row => row.value).map(row => `${row.field} : ${row.value}`).join('\n'),
    warning: 'Propositions à vérifier, même lorsque l’extrait existe. Les contradictions et données absentes ne sont pas résolues automatiquement.' };
}
export function mobileEmail(input, generatedSummary = '') {
  if (input.kind === 'SUMMARY_EMAIL') {
    if (typeof generatedSummary !== 'string' || !generatedSummary.trim() || generatedSummary.length > 4000) fail('Synthèse privée manquante ou invalide.');
    return { recipient: input.delivery.recipientEmail, subject: `Tonia — synthèse à relire ${input.noteId.slice(0, 8)}`,
      text: [`${input.title}`, `Version : ${input.noteId} / ${input.revision}`,
        '\nSYNTHÈSE GÉNÉRÉE PAR IA — À RELIRE',
        'Ce texte n’a pas été validé par le représentant. Vérifiez les noms, les montants et les passages incertains dans les sources.', generatedSummary,
        '\nTRANSCRIPTION COMPLÈTE', input.transcript,
        '\nNOTES PERSONNELLES DU REPRÉSENTANT', input.personalNotes || 'Aucune note.',
        '\nLes notes personnelles sont des observations du représentant, pas des paroles attribuées au client. Aucun dossier CRM n’a été créé.'].join('\n') };
  }
  return { recipient: input.review.recipientEmail, subject: `Tonia — fiche validée ${input.noteId.slice(0, 8)}`,
    text: [`NOTE VALIDÉE — ${input.title}`, `Référence : ${input.clientReference}`, `Version : ${input.noteId} / ${input.revision}`,
      '\nSYNTHÈSE RELUE', input.summary || 'Aucune synthèse renseignée.', '\nRENSEIGNEMENTS VALIDÉS',
      ...input.review.rows.map(row => `${row.field} : ${row.value || 'Non renseigné, confirmé lors de la validation'}`),
      '\nTRANSCRIPTION', input.transcript, '\nNOTES PERSONNELLES DU REPRÉSENTANT', input.personalNotes || 'Aucune note.',
      '\nLes notes personnelles sont des observations du représentant, pas des paroles attribuées au client.'].join('\n') };
}
export function createMobileService({ directory = 'outputs/mobile-jobs', env = process.env, fetchImpl = fetch,
  authorizeClient, audit = async () => {}, now = () => Date.now() } = {}) {
  const root = path.resolve(directory);
  const token = env.N8N_MOBILE_TOKEN ?? '';
  const deliveryMode = env.MOBILE_DELIVERY_MODE || 'LIVE';
  if (!['LIVE', 'MAILPIT'].includes(deliveryMode)) throw new MobileError('Mode de livraison mobile invalide.');
  const preview = deliveryMode === 'MAILPIT';
  const analysisUrl = env.N8N_MOBILE_ANALYSIS_WEBHOOK_URL ?? '';
  const mailUrl = (preview ? env.N8N_MOBILE_TEST_EMAIL_WEBHOOK_URL : env.N8N_MOBILE_EMAIL_WEBHOOK_URL) ?? '';
  const summaryUrl = env.N8N_MOBILE_SUMMARY_WEBHOOK_URL ?? '';
  const liveEmailReleased = env.MOBILE_EMAIL_RELEASE === 'approved';
  const configured = { analysis: !preview && Boolean(analysisUrl && token), email: !preview && liveEmailReleased && Boolean(mailUrl && token), summaryEmail: !preview && liveEmailReleased && Boolean(summaryUrl && mailUrl && token), clientAssociation: true,
    ...(preview ? { deliveryMode: 'MAILPIT', summaryPreview: Boolean(summaryUrl && mailUrl && token) } : {}) };
  const canProcess = input => (input.deliveryMode ?? 'LIVE') === deliveryMode && (input.kind === 'SUMMARY_EMAIL' ? (preview ? configured.summaryPreview : configured.summaryEmail) : input.kind === 'EMAIL' ? configured.email : configured.analysis);
  let running = false;
  let wakeRequested = false;
  let submitting = Promise.resolve();
  const limits = new Map();
  const file = id => path.join(root, `${id}.json`);
  const write = async job => { const temporary = `${file(job.id)}.tmp`; await writeFile(temporary, JSON.stringify(job), { mode: 0o600 }); await rename(temporary, file(job.id)); };
  const read = async id => { try { return JSON.parse(await readFile(file(id), 'utf8')); } catch (error) { if (error.code === 'ENOENT') throw new MobileError('Travail introuvable.', 404); throw error; } };
  const view = job => ({ id: job.id, kind: job.input.kind, noteId: job.input.noteId, sourceHash: job.input.sourceHash,
    association: job.input.association,
    status: job.status, ...(job.input.deliveryMode ? { deliveryMode: job.input.deliveryMode } : {}), completedSegments: job.cursor ?? 0, totalSegments: job.total ?? 0, result: job.result ?? null, error: job.error ?? null });
  async function upstream(url, body) {
    const response = await fetchImpl(url, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-tonia-mobile-token': token }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new MobileError('Le service privé n’a pas terminé le traitement.', 502);
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 256000) { await reader.cancel(); throw new MobileError('Réponse du service trop volumineuse.', 502); } chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  async function bindAssociation(identity, input) {
    if (input.kind === 'EMAIL' || input.kind === 'SUMMARY_EMAIL') {
      const recipient = input.kind === 'SUMMARY_EMAIL' ? input.delivery.recipientEmail : input.review.recipientEmail;
      if (recipient.toLowerCase() !== identity.email) throw new MobileError('Utilisez le courriel professionnel du compte connecté.', 403);
      if (input.kind === 'SUMMARY_EMAIL') input.delivery.recipientEmail = identity.email;
      else input.review.recipientEmail = identity.email;
    }
    if (input.association.state === 'UNASSIGNED') return input;
    if (typeof authorizeClient !== 'function') throw new MobileError('Le contrôle des dossiers mobiles n’est pas configuré.', 503);
    let client;
    try { client = await authorizeClient(identity.representativeId, input.association.clientCode); }
    catch (error) { throw new MobileError(error?.message ?? 'Dossier non autorisé.', error?.statusCode ?? 403); }
    if (!client || client.clientCode !== input.association.clientCode) throw new MobileError('Dossier non autorisé.', 403);
    input.association = { state: 'ASSIGNED', clientCode: client.clientCode,
      clientName: text(client.clientName, 160, 'Nom du client'), status: text(client.status ?? '', 80, 'Statut du dossier') };
    return input;
  }
  async function revalidateAssociation(job) {
    if (job.input.association.state !== 'ASSIGNED') return;
    if (typeof authorizeClient !== 'function') throw new Error('Contrôle de dossier indisponible.');
    const current = await authorizeClient(job.representativeId, job.input.association.clientCode);
    if (!current || current.clientCode !== job.input.association.clientCode) throw new Error('Accès au dossier retiré.');
  }
  const securityContext = job => ({ representativeId: job.representativeId,
    association: job.input.association.state === 'ASSIGNED'
      ? { state: 'ASSIGNED', clientCode: job.input.association.clientCode }
      : { state: 'UNASSIGNED' } });
  const auditJob = async (action, job, result) => {
    try { await audit({ action, result, actorHash: job.owner, representativeId: job.representativeId,
      jobId: job.id, clientCode: job.input.association.state === 'ASSIGNED' ? job.input.association.clientCode : null }); }
    catch { /* Le contenu n'est jamais journalisé; l'échec d'audit sera supervisé séparément. */ }
  };
  async function process(job) {
    try { await revalidateAssociation(job); }
    catch { job.status = 'FAILED'; job.error = 'Le rattachement au dossier n’est plus autorisé. Aucun traitement ni envoi effectué.'; await write(job); return; }
    if (job.input.kind === 'SUMMARY_EMAIL') {
      const segments = segmentMobileSources(job.input); job.total = segments.length;
      job.status = 'RUNNING'; await write(job);
      try {
        while ((job.cursor ?? 0) < segments.length) {
          const segment = segments[job.cursor ?? 0];
          // One private model request at a time, bounded context; both original sources remain intact.
          const result = await upstream(summaryUrl, { jobId: job.id, ...securityContext(job), ...segment, previousSummary: job.generatedSummary ?? '' });
          if (typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 4000 || result.summary.includes('\0')) throw new Error('Synthèse invalide.');
          job.generatedSummary = result.summary.trim();
          job.cursor = (job.cursor ?? 0) + 1; await write(job);
        }
        // Fail before the non-retriable sending phase if the persisted summary is not usable.
        mobileEmail(job.input, job.generatedSummary);
      } catch {
        job.status = 'FAILED'; job.error = 'Synthèse privée interrompue. Aucun courriel envoyé; les textes sont conservés.';
        await write(job); return;
      }
    }
    if (job.input.kind === 'EMAIL' || job.input.kind === 'SUMMARY_EMAIL') {
      try { await revalidateAssociation(job); }
      catch { job.status = 'FAILED'; job.error = 'L’accès au dossier a changé. Aucun courriel envoyé.'; await write(job); return; }
      job.status = 'SENDING'; await write(job);
      try {
        const envelope = mobileEmail(job.input, job.generatedSummary);
        if (preview) {
          envelope.recipient = 'recette@example.invalid';
          envelope.subject = `Tonia — TEST LOCAL — synthèse mobile ${job.input.noteId.slice(0, 8)}`;
          envelope.text = `TEST MAILPIT — aucun courriel au destinataire saisi.\n\n${envelope.text}`;
        }
        const result = await upstream(mailUrl, { jobId: job.id, ...securityContext(job), ...envelope });
        if (result.accepted !== true || typeof result.messageId !== 'string' || !result.messageId) throw new Error('Confirmation manquante.');
        if (preview ? result.deliveryMode !== 'MAILPIT' : result.deliveryMode === 'MAILPIT') throw new Error('Mode de livraison incohérent.');
        job.status = preview ? 'TEST_ACCEPTED' : 'ACCEPTED'; job.result = { messageId: result.messageId };
      } catch { job.status = 'UNKNOWN'; job.error = 'Résultat d’envoi incertain. Vérifiez la messagerie avant toute nouvelle tentative; aucun renvoi automatique.'; }
      await write(job); return;
    }
    const segments = segmentMobileSources(job.input); job.total = segments.length;
    job.status = 'RUNNING'; await write(job);
    try {
      while ((job.cursor ?? 0) < segments.length) {
        const segment = segments[job.cursor ?? 0];
        const response = await upstream(analysisUrl, { jobId: job.id, ...securityContext(job), ...segment, fields: MOBILE_FIELDS });
        if (!Array.isArray(response.facts)) throw new Error('Résultat incomplet.');
        job.facts = collectMobileFacts(job.facts ?? [], response, segment);
        job.cursor = (job.cursor ?? 0) + 1; await write(job);
      }
      job.result = mobileReviewResult(job.facts ?? [], job.input); job.status = 'READY';
    } catch { job.status = 'FAILED'; job.error = 'Analyse privée interrompue. Aucun renseignement n’est validé automatiquement.'; }
    await write(job);
  }
  async function drain() {
    if (running) { wakeRequested = true; return; }
    running = true;
    try {
      for (;;) {
        wakeRequested = false;
        let candidate = null;
        for (const name of (await readdir(root)).filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
          const job = await read(name.slice(0, -5));
          if (job.status === 'QUEUED' && canProcess(job.input)) { candidate = job; break; }
        }
        if (!candidate) break;
        await process(candidate);
        await auditJob('JOB_STATUS', candidate, candidate.status);
      }
    } finally { running = false; if (wakeRequested) wake(); }
  }
  const wake = () => { drain().catch(() => { /* No private payloads in logs. Persisted jobs remain recoverable. */ }); };
  const ready = (async () => {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const name of (await readdir(root)).filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
      const job = await read(name.slice(0, -5));
      if (!REPRESENTATIVE_ID.test(job.representativeId ?? '') || !['ASSIGNED', 'UNASSIGNED'].includes(job.input?.association?.state)) {
        if (['QUEUED', 'RUNNING'].includes(job.status)) { job.status = 'FAILED'; job.error = 'Ancien travail sans rattachement Zero Trust : créez un nouvel envoi.'; await write(job); }
        else if (job.status === 'SENDING') { job.status = 'UNKNOWN'; job.error = 'Ancien envoi interrompu : vérifier la messagerie. Aucun renvoi automatique.'; await write(job); }
      }
      else if (job.status === 'SENDING') { job.status = 'UNKNOWN'; job.error = 'Envoi interrompu : vérifier le service de messagerie. Aucun renvoi automatique.'; await write(job); }
      else if (job.status === 'RUNNING') { job.status = 'QUEUED'; await write(job); }
    }
  })();
  ready.then(wake).catch(() => {});
  return {
    configured,
    async submit(identityValue, body, ip = '') {
      const identity = normalizeMobileIdentity(identityValue);
      await ready;
      const input = await bindAssociation(identity, normalizeMobileJob(body));
      if (preview) {
        if (body.testDeliveryConfirmed !== true || input.kind !== 'SUMMARY_EMAIL') throw new MobileError('Confirmez explicitement le test Mailpit : aucun courriel réel ne sera envoyé.', 409);
        input.deliveryMode = 'MAILPIT';
      } else if (body.testDeliveryConfirmed === true) throw new MobileError('Le serveur n’est plus en mode test. Reconnectez-vous avant de confirmer un envoi réel.', 409);
      if (!canProcess(input)) throw new MobileError(input.kind === 'SUMMARY_EMAIL' ? 'Le workflow privé de synthèse et la boîte d’expédition ne sont pas configurés. Rien n’a été envoyé.' : input.kind === 'EMAIL' ? 'Aucune boîte d’expédition configurée. Rien n’a été envoyé.' : 'Le service privé d’analyse mobile n’est pas configuré.', 503);
      const minute = Math.floor(now() / 60000);
      if (limits.size >= 4096) for (const [key, limit] of limits) if (limit.minute < minute) limits.delete(key);
      for (const key of [`u:${identity.subject}`, `ip:${ip}`]) {
        const current = limits.get(key);
        if (!current && limits.size >= 4096) throw new MobileError('Service occupé. Réessayez dans une minute.', 429);
        if (current?.minute === minute && current.count >= (key.startsWith('u:') ? 6 : 30)) throw new MobileError('Trop de demandes. Réessayez dans une minute.', 429);
        limits.set(key, { minute, count: current?.minute === minute ? current.count + 1 : 1 });
      }
      const ownerHash = hash(identity.subject); const id = hash(`${ownerHash}:${identity.representativeId}:${JSON.stringify(input)}`);
      const operation = submitting.then(async () => {
        try { const prior = await read(id); if (prior.owner !== ownerHash || prior.representativeId !== identity.representativeId) throw new MobileError('Accès refusé.', 403); return view(prior); }
        catch (error) { if (error.statusCode !== 404) throw error; }
        const files = (await readdir(root)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
        if (files.length >= 1000) throw new MobileError('Stockage des travaux plein. Contacter l’administrateur.', 503);
        let pending = 0;
        for (const name of files) {
          const other = await read(name.slice(0, -5));
          if (other.owner === ownerHash && ['QUEUED', 'RUNNING', 'SENDING'].includes(other.status)) pending++;
        }
        if (pending >= 3) throw new MobileError('Trois travaux sont déjà en attente pour ce compte.', 429);
        const job = { id, owner: ownerHash, representativeId: identity.representativeId, createdAt: now(), input, status: 'QUEUED', cursor: 0, facts: [] };
        await write(job); await auditJob('JOB_SUBMITTED', job, 'ACCEPTED'); wake(); return view(job);
      });
      submitting = operation.catch(() => {}); return operation;
    },
    async get(identityValue, id) { const identity = normalizeMobileIdentity(identityValue); await ready; if (!/^[a-f0-9]{64}$/.test(id)) throw new MobileError('Travail introuvable.', 404); const job = await read(id); if (job.owner !== hash(identity.subject) || job.representativeId !== identity.representativeId) throw new MobileError('Travail introuvable.', 404); await auditJob('JOB_ACCESSED', job, 'ALLOWED'); return view(job); },
    async idle() { await ready; await submitting; while (running) await new Promise(resolve => setTimeout(resolve, 10)); }
  };
}
