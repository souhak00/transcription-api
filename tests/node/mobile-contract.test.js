import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaUrl = new URL(
  "../../contracts/mobile/conversation-note-v1.schema.json",
  import.meta.url
);
const manifestUrl = new URL(
  "../../android/app/src/main/AndroidManifest.xml",
  import.meta.url
);
const captureServiceUrl = new URL(
  "../../android/app/src/main/java/com/toniaconseil/voicenotes/capture/AudioCaptureService.kt",
  import.meta.url
);
const appUiUrl = new URL(
  "../../android/app/src/main/java/com/toniaconseil/voicenotes/ui/ToniaVoiceNotesApp.kt",
  import.meta.url
);
const onDeviceTranscriberUrl = new URL(
  "../../android/app/src/main/java/com/toniaconseil/voicenotes/transcription/OnDeviceVoskTranscriber.kt",
  import.meta.url
);
const viewModelUrl = new URL(
  "../../android/app/src/main/java/com/toniaconseil/voicenotes/MainViewModel.kt",
  import.meta.url
);

test("le workflow mobile partage les trois états contrôlés", async () => {
  const schema = JSON.parse(await readFile(schemaUrl, "utf8"));

  assert.equal(schema.properties.contractVersion.const, "mobile-conversation-note/1.0");
  assert.deepEqual(schema.properties.status.enum, ["DRAFT", "REVIEWED", "FINALIZED"]);
  assert.equal(schema.properties.audio.properties.durationMs.maximum, 3_600_000);
  assert.equal(schema.properties.audio.properties.sizeBytes.maximum, 25 * 1024 * 1024);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.content.additionalProperties, false);
  assert.equal(schema.properties.content.properties.personalNotes, undefined,
    "les notes locales ne doivent pas modifier silencieusement le contrat réseau v1");
  assert.equal(schema.properties.content.properties.followUpEmail.maxLength, 50000);
});

test("le micro des notes reste léger, visible et distinct de l’import", async () => {
  const [manifest, captureService, appUi, noteControls] = await Promise.all([
    readFile(manifestUrl, "utf8"),
    readFile(captureServiceUrl, "utf8"),
    readFile(appUiUrl, "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/ui/NoteDictationControls.kt", import.meta.url), "utf8")
  ]);

  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:foregroundServiceType="microphone"/);
  assert.match(captureService, /setAudioChannels\(1\)/);
  assert.match(captureService, /setAudioSamplingRate\(16_000\)/);
  assert.match(captureService, /setAudioEncodingBitRate\(64_000\)/);
  assert.match(captureService, /activeRecorder\.maxAmplitude/);
  assert.match(captureService, /registerAudioRecordingCallback/);
  assert.match(captureService, /isClientSilenced/);
  assert.match(captureService, /SIGNAL_CHECK_INTERVAL_MS = 2_000L/);
  assert.match(captureService, /AudioManager\.MODE_IN_CALL/);
  assert.match(captureService, /AudioManager\.MODE_IN_COMMUNICATION/);
  assert.match(captureService, /callSignalDetectedDuringCapture/);
  assert.match(appUi, /Importez un enregistrement autorisé/);
  assert.match(noteControls, /RequestMultiplePermissions/);
  assert.match(noteControls, /Manifest\.permission\.POST_NOTIFICATIONS/);
  assert.doesNotMatch(appUi, /RequestMultiplePermissions|permissionLauncher|AudioCaptureService\.start\(/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(captureService, /HttpURLConnection|https?:\/\/|Socket\(/);
  assert.doesNotMatch(manifest, /android:networkSecurityConfig/);
});

test("l’entrée conversation est limitée à importer ou partager un fichier audio ou texte", async () => {
  const [ui, viewModel, manifest, activity, service] = await Promise.all([
    readFile(appUiUrl, "utf8"), readFile(viewModelUrl, "utf8"), readFile(manifestUrl, "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/MainActivity.kt", import.meta.url), "utf8"),
    readFile(captureServiceUrl, "utf8")
  ]);
  assert.match(ui, /Importer un fichier audio/);
  assert.match(ui, /Comment partager depuis Samsung/);
  assert.match(ui, /ActivityResultContracts\.OpenDocument\(\)/);
  assert.match(ui, /1\. Transcription/);
  assert.match(ui, /2\. Notes personnelles/);
  assert.match(ui, /3\. Courriel et envoi/);
  assert.doesNotMatch(ui, /4\. Envoi|3\. Validation/);
  assert.match(manifest, /text\/plain/);
  assert.doesNotMatch(ui, /onRecord|createRecordingPath|registerRecording|RecordingStatusBanner/);
  assert.doesNotMatch(viewModel, /fun createRecordingPath|fun registerRecording/);
  assert.match(manifest, /android\.intent\.action\.SEND/);
  assert.match(activity, /Intent\.ACTION_SEND/);
  assert.match(activity, /viewModel\.prepareAudioImport\(uri\)/);
  assert.match(service, /require\(allowsPersonalNoteCapture\(destination\)\)/);
  assert.match(service, /if \(!allowsPersonalNoteCapture\(destination\)\)/);
  assert.match(service, /stopRecording\(interruptedByCall = true\)/);
  assert.doesNotMatch(service, /setAudioEncodingBitRate\(32_000\)|private const val MAX_DURATION_MS/);
});

test("la transcription mobile fonctionne hors ligne et reprend sans perdre l'audio", async () => {
  const [transcriber, viewModel] = await Promise.all([
    readFile(onDeviceTranscriberUrl, "utf8"),
    readFile(viewModelUrl, "utf8")
  ]);

  assert.match(transcriber, /MODEL_ASSET_PATH = "model-fr"/);
  assert.match(transcriber, /MediaExtractor/);
  assert.match(transcriber, /Recognizer/);
  assert.match(viewModel, /transcriptionMutex\.withLock/);
  assert.match(viewModel, /requeueInterruptedTranscriptions/);
  assert.match(viewModel, /onDeviceTranscriber\.transcribe/);
});

test("les notes restent accessibles et une version finalisée se complète sans écrasement", async () => {
  const [ui, repository, model, controls] = await Promise.all([
    readFile(appUiUrl, "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/data/DraftRepository.kt", import.meta.url), "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/model/ConversationDraft.kt", import.meta.url), "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/ui/NoteDictationControls.kt", import.meta.url), "utf8")
  ]);
  assert.match(ui, /Ajouter mes notes/);
  assert.match(ui, /Enregistrer mes notes/);
  assert.match(ui, /amendmentConfirmation/);
  assert.match(controls, /Dicter une nouvelle note/);
  assert.match(repository, /it.previousVersionId == id && it.status != DraftStatus.FINALIZED/);
  assert.match(repository, /optString\("previousVersionId", ""\)/);
  assert.match(model, /previousVersionId = id/);
  assert.match(model, /FINALIZED -> false/);
});

test("la dictée des notes utilise le service visible et le même moteur hors ligne", async () => {
  const [service, viewModel, transcriber, controls, manifest] = await Promise.all([
    readFile(captureServiceUrl, "utf8"), readFile(viewModelUrl, "utf8"),
    readFile(onDeviceTranscriberUrl, "utf8"),
    readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/ui/NoteDictationControls.kt", import.meta.url), "utf8"),
    readFile(manifestUrl, "utf8")
  ]);
  assert.match(service, /DICTATION_MAX_DURATION_MS = 120_000/);
  assert.match(service, /setAudioEncodingBitRate\(64_000\)/);
  assert.match(service, /EXTRA_DRAFT_ID/);
  assert.match(viewModel, /transcriptionMutex\.withLock\s*\{[\s\S]*?transcribeDictation/);
  assert.match(viewModel, /editor\.appendDictation\(destination.field, pending.preview\)/);
  assert.match(transcriber, /recognizer\.setWords\(wordConfidence\)/);
  assert.match(controls, /Ajouter à la suite des notes/);
  assert.match(controls, /Relisez la dictée/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(transcriber, /HttpURLConnection|https?:\/\/|Socket\(/);
  assert.doesNotMatch(controls, /SpeechRecognizer|ACTION_RECOGNIZE_SPEECH/);
});

test("le connecteur privé est distinct du moteur local et exige HTTPS avec PKCE", async () => {
  const remote = await readFile(new URL("../../android/app/src/main/java/com/toniaconseil/voicenotes/remote/MobilePrivateApi.kt", import.meta.url), "utf8");
  assert.match(remote, /code_challenge_method/);
  assert.match(remote, /S256/);
  assert.match(remote, /code_verifier/);
  assert.match(remote, /instanceFollowRedirects = false/);
  assert.match(remote, /protocol == "https"/);
  assert.doesNotMatch(remote, /putString\("(?:access|refresh|token|password)/);
});
