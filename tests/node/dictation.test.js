import assert from "node:assert/strict";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { normalizeAgentRequest } from "../../src/agent.js";
import {
  createDictationService,
  createSerialQueue,
  DictationError,
  loadDictationConfig,
  normalizeCrmDictationTranscript,
  normalizeAudioContentType
} from "../../src/dictation.js";

test("la configuration de dictée impose un petit budget de ressources", () => {
  const config = loadDictationConfig({
    DICTATION_WORKER_URL: "http://worker.test/",
    DICTATION_WORKER_TOKEN: "secret-local",
    DICTATION_MAX_UPLOAD_MB: "2",
    DICTATION_MAX_PENDING: "3",
    DICTATION_TIMEOUT_MS: "45000"
  });

  assert.equal(config.workerUrl, "http://worker.test");
  assert.equal(config.workerToken, "secret-local");
  assert.equal(config.maxBytes, 2 * 1024 * 1024);
  assert.equal(config.maxPending, 3);
  assert.equal(config.timeoutMs, 45000);
  assert.match(config.audioFilters, /afftdn/);
});

test("seuls les formats audio explicitement autorisés sont acceptés", () => {
  assert.deepEqual(normalizeAudioContentType("audio/webm;codecs=opus"), {
    contentType: "audio/webm",
    extension: ".webm"
  });
  assert.deepEqual(normalizeAudioContentType("audio/mp4"), {
    contentType: "audio/mp4",
    extension: ".m4a"
  });
  assert.throws(
    () => normalizeAudioContentType("application/octet-stream"),
    (error) => error instanceof DictationError && error.statusCode === 415
  );
});

test("les déformations vocales observées sont corrigées dans les commandes CRM", () => {
  assert.equal(
    normalizeCrmDictationTranscript("un fiche moins les dossiers et de benoît trembler"),
    "affiche-moi le dossier de Benoît Tremblay"
  );
  assert.equal(
    normalizeCrmDictationTranscript("ainsi c'est le client benolt trembler"),
    "affiche le client Benoît Tremblay"
  );
  assert.equal(
    normalizeCrmDictationTranscript("un fichier les dossiers en retard"),
    "affiche-moi les dossiers en retard"
  );
  assert.equal(
    normalizeCrmDictationTranscript("afficher les dossiers en l'église"),
    "afficher les dossiers en analyse"
  );
  assert.equal(
    normalizeCrmDictationTranscript("un finish les dossiers en bas"),
    "affiche-moi les dossiers en analyse"
  );
  assert.equal(
    normalizeCrmDictationTranscript("a six mois les dossiers en analyse"),
    "affiche-moi les dossiers en analyse"
  );
  assert.equal(
    normalizeCrmDictationTranscript("un six mois le prochain rendez-vous"),
    "affiche-moi le prochain rendez-vous"
  );
  assert.equal(
    normalizeCrmDictationTranscript("a six mois le dossier d'alice beaulieu"),
    "affiche-moi le dossier d'alice beaulieu"
  );
  assert.equal(
    normalizeCrmDictationTranscript("un fils paul et cinq derniers payant"),
    "affiche-moi cinq derniers clients"
  );
  assert.equal(
    normalizeCrmDictationTranscript("six mois le dossier du dernier client"),
    "affiche-moi le dossier du dernier client"
  );
  assert.equal(
    normalizeCrmDictationTranscript("bon moyen de affiche mois du dossier son analyse"),
    "affiche-moi les dossiers en analyse"
  );
});

test("un nom dicté est rapproché uniquement d’un client suffisamment similaire", () => {
  const clientNames = ["Benoît Tremblay", "Olivier Bergeron", "Alice Beaulieu"];
  assert.equal(
    normalizeCrmDictationTranscript("affiche mode dossier d'olivier berges", { clientNames }),
    "affiche-moi dossier de Olivier Bergeron"
  );
  assert.equal(
    normalizeCrmDictationTranscript("affiche mode dossier d olivier berges", { clientNames }),
    "affiche-moi dossier de Olivier Bergeron"
  );
  assert.equal(
    normalizeCrmDictationTranscript("affiche-moi le dossier de Benoît Trembler", { clientNames }),
    "affiche-moi le dossier de Benoît Tremblay"
  );
  assert.equal(
    normalizeCrmDictationTranscript("sa finition ou un le dossier de benoît trente", { clientNames }),
    "affiche-moi le dossier de Benoît Tremblay"
  );
  assert.equal(
    normalizeCrmDictationTranscript("il inflige moi les documents manquants dans le dossier de carré auriez", {
      clientNames: [...clientNames, "Karine Pelletier"]
    }),
    "affiche-moi les documents manquants dans le dossier de Karine Pelletier"
  );
  assert.equal(
    normalizeCrmDictationTranscript("affiche-moi le dossier de Paul Martin", { clientNames }),
    "affiche-moi le dossier de Paul Martin"
  );

  const correctedRequest = normalizeAgentRequest({
    message: normalizeCrmDictationTranscript(
      "affiche mode dossier d'olivier berges",
      { clientNames }
    )
  });
  assert.equal(correctedRequest.intent, "dossier_client");
  assert.equal(correctedRequest.clientReference, "Olivier Bergeron");
});

test("la normalisation ne modifie pas une phrase ordinaire hors contexte CRM", () => {
  assert.equal(
    normalizeCrmDictationTranscript("Le restaurant se trouve en bas de l'église"),
    "Le restaurant se trouve en bas de l'église"
  );
});

test("la file limite la concurrence et refuse la surcharge", async () => {
  const enqueue = createSerialQueue(2);
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const order = [];

  const first = enqueue(async () => {
    order.push("premier-début");
    await gate;
    order.push("premier-fin");
  });
  const second = enqueue(async () => order.push("deuxième"));

  await assert.rejects(
    () => enqueue(async () => undefined),
    (error) => error instanceof DictationError && error.statusCode === 429
  );
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["premier-début", "premier-fin", "deuxième"]);
});

test("le service convertit, appelle le worker privé et supprime les temporaires", async () => {
  let temporaryDirectory;
  let receivedRequest;
  const service = createDictationService({
    config: {
      workerUrl: "http://worker.test",
      workerToken: "secret-local",
      maxBytes: 1024,
      maxPending: 1,
      timeoutMs: 5000,
      audioFilters: "highpass=f=90",
      maxTranscriptCharacters: 1000
    },
    extractAudioImplementation: async (inputPath, outputDirectory, options) => {
      temporaryDirectory = path.dirname(inputPath);
      assert.equal(options.sampleRate, 16000);
      assert.equal(options.filters, "highpass=f=90");
      await mkdir(outputDirectory, { recursive: true });
      const wavPath = path.join(outputDirectory, "instruction.wav");
      await writeFile(wavPath, Buffer.from("wav-test"));
      return wavPath;
    },
    fetchImplementation: async (url, request) => {
      receivedRequest = { url, request };
      return {
        ok: true,
        status: 200,
        json: async () => ({ transcript: "affiche le dossier de Karine" })
      };
    }
  });

  const transcript = await service(Buffer.from("audio-test"), "audio/webm;codecs=opus");
  assert.equal(transcript, "affiche le dossier de Karine");
  assert.equal(receivedRequest.url, "http://worker.test/transcribe");
  assert.equal(receivedRequest.request.headers["x-worker-token"], "secret-local");
  assert.equal(receivedRequest.request.headers["content-type"], "audio/wav");
  await assert.rejects(() => access(temporaryDirectory));
});

test("un enregistrement vide ou trop volumineux est refusé avant conversion", async () => {
  const service = createDictationService({
    config: {
      workerUrl: "http://worker.test",
      workerToken: "",
      maxBytes: 4,
      maxPending: 1,
      timeoutMs: 5000,
      maxTranscriptCharacters: 1000
    },
    extractAudioImplementation: async () => {
      throw new Error("ne doit pas être appelé");
    }
  });

  await assert.rejects(
    () => service(Buffer.alloc(0), "audio/webm"),
    (error) => error instanceof DictationError && error.statusCode === 400
  );
  await assert.rejects(
    () => service(Buffer.alloc(5), "audio/webm"),
    (error) => error instanceof DictationError && error.statusCode === 413
  );
});
