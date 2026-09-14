import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = '../../android/app/src/main/java/com/toniaconseil/voicenotes/';
const source = path => readFile(new URL(root + path, import.meta.url), 'utf8');

test('le moteur local n’importe aucun transport ni modèle et borne ses propositions', async () => {
  const engine = await source('extraction/LocalClientExtractor.kt');
  assert.doesNotMatch(engine, /import .*?(?:android\.|java\.net|okhttp|ktor|vosk|remote\.)/i);
  assert.doesNotMatch(engine, /https?:\/\/|Socket\(|URL\(|HttpURLConnection|MobilePrivateApi/);
  assert.match(engine, /bucket\.size >= 4/);
  assert.match(engine, /MAX_TRANSCRIPT_CHARACTERS/);
  assert.match(engine, /checkCancelled\(\)/);
  assert.match(engine, /decision = FieldDecision\.TO_REVIEW/);
  assert.match(engine, /recipientConfirmed = false/);
});

test('le parcours simplifié retire le préremplissage et le tableau client', async () => {
  const ui = await source('ui/ToniaVoiceNotesApp.kt');
  const viewModel = await source('MainViewModel.kt');
  assert.doesNotMatch(ui, /Préremplir sur ce téléphone|ClientReviewPanel|Synthèse à relire et corriger|Client ou code client|Référence client/);
  assert.match(ui, /RecipientPanel\(recipientReview/);
  assert.match(ui, /canSendSources/);
  assert.match(ui, /summaryEmailConfigured/);
  assert.doesNotMatch(ui, /viewModel\.prepareClientReview\(|refreshPrivateJob\(draft.id, "ANALYSIS"\)/);
  assert.doesNotMatch(viewModel, /LocalClientExtractor|prepareClientReviewOnDevice/);
  assert.match(viewModel, /privateApi.submit\(draft, "SUMMARY_EMAIL"\)/);
});
