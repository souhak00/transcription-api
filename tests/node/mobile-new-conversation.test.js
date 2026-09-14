import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = '../../android/app/src/main/java/com/toniaconseil/voicenotes/';
const source = file => readFile(new URL(root + file, import.meta.url), 'utf8');

test('le doublon propose une nouvelle conversation ou une ouverture explicite', async () => {
  const ui = await source('ui/ToniaVoiceNotesApp.kt');
  assert.match(ui, /Créer un nouvel essai/);
  assert.match(ui, /Ouvrir l’existante/);
  assert.match(ui, /onConfirm\(title, consent, ConversationImportChoice.NEW_CONVERSATION\)/);
  assert.match(ui, /onConfirm\(title, false, ConversationImportChoice.OPEN_EXISTING\)/);
  assert.doesNotMatch(ui, /consent \|\| existingDraft != null/);
  assert.match(ui, /Le même audio contient les mêmes paroles/);
  assert.match(ui, /if \(editor.hasChanges\(\)\) saveError/);
});

test('la creation utilise un identifiant dimport et ne copie pas le contexte ancien', async () => {
  const [factory, repository, vm] = await Promise.all([
    source('importing/ConversationImport.kt'), source('data/DraftRepository.kt'), source('MainViewModel.kt')
  ]);
  assert.match(factory, /id = pending.id/);
  assert.match(factory, /drafts.firstOrNull \{ it.id == pending.id \}/);
  assert.match(factory, /return ConversationDraft\(/);
  assert.doesNotMatch(factory, /reusable\?\.(?:transcript|personalNotes|clientReview|summary|deliveryJobId)/);
  assert.match(repository, /if \(_drafts.value.any \{ it.id == created.id \}\) return created/);
  assert.match(vm, /repository.importConversation\(pending, title, consentConfirmed, choice\)/);
  assert.match(vm, /choice == ConversationImportChoice.NEW_CONVERSATION && pending.sourceKind == "AUDIO"/);
  assert.match(vm, /transcribeOne\(draft.id, onlyQueued = true\)/);
});
