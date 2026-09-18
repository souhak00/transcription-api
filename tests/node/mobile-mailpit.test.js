import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createMobileService, sourceHash } from '../../src/mobile.js';
const env = { MOBILE_DELIVERY_MODE:'MAILPIT', N8N_MOBILE_TOKEN:'synthetic', N8N_MOBILE_SUMMARY_WEBHOOK_URL:'http://private.invalid/summary', N8N_MOBILE_TEST_EMAIL_WEBHOOK_URL:'http://private.invalid/capture' };
const user = { subject:'user',representantId:'12345678-1234-4234-8234-123456789012',email:'person@example.net',emailVerified:true,role:'representant' };
const body = () => ({kind:'SUMMARY_EMAIL',noteId:'12345678-1234-1234-1234-123456789012',revision:1,title:'Test',transcript:'Texte fictif.',personalNotes:'',association:{state:'UNASSIGNED'},status:'FINALIZED',sendConfirmed:true,testDeliveryConfirmed:true,delivery:{sourceHash:sourceHash('Texte fictif.',''),recipientEmail:'person@example.net',recipientConfirmed:true}});
const response = value => new Response(JSON.stringify(value));
async function directory(t) { const dir=await mkdtemp(path.join(tmpdir(),'tonia-mailpit-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir; }
test('Mailpit : confirmation explicite requise, anciennes applications désactivées',async t=>{
  const service=createMobileService({directory:await directory(t),env});
  assert.equal(service.configured.summaryEmail,false);
  assert.equal(service.configured.summaryPreview,true);
  assert.equal(service.configured.email,false);
  await assert.rejects(service.submit(user,{...body(),testDeliveryConfirmed:undefined}),{statusCode:409});
  await service.idle();
});
test('Mailpit : destinataire forcé, accusé distinct, aucun doublon ni adresse réelle au webhook',async t=>{
  const mails=[];
  const service=createMobileService({directory:await directory(t),env,fetchImpl:async(url,opts)=>{
    if(url.endsWith('/summary')) return response({summary:'Résumé de recette.'});
    mails.push(JSON.parse(opts.body));return response({accepted:true,deliveryMode:'MAILPIT',messageId:'synthetic'});
  }});
  const job=await service.submit(user,body());await service.idle();
  const result=await service.get(user,job.id);
  assert.equal(result.status,'TEST_ACCEPTED');assert.equal(result.deliveryMode,'MAILPIT');
  assert.equal(mails[0].recipient,'recette@example.invalid');
  assert.ok(!JSON.stringify(mails).includes('person@example.net'));
  await service.submit(user,body());await service.idle();assert.equal(mails.length,1);
});
test('mode LIVE : une confirmation de test périmée ne peut pas devenir un envoi réel',async t=>{
  const service=createMobileService({directory:await directory(t),env:{...env,MOBILE_DELIVERY_MODE:'LIVE',N8N_MOBILE_EMAIL_WEBHOOK_URL:'http://private.invalid/live'},fetchImpl:()=>assert.fail('aucun appel')});
  await assert.rejects(service.submit(user,body()),{statusCode:409});await service.idle();
});
test('un travail de test persisté ne peut pas être rejoué en LIVE',async t=>{
  const dir=await directory(t);
  const first=createMobileService({directory:dir,env,fetchImpl:async url=>response(url.endsWith('/summary')?{summary:'Test'}:{accepted:true,deliveryMode:'MAILPIT',messageId:'test'})});
  const job=await first.submit(user,body());await first.idle();
  const file=path.join(dir,`${job.id}.json`);const persisted=JSON.parse(await readFile(file,'utf8'));
  persisted.status='QUEUED';await writeFile(file,JSON.stringify(persisted));
  const live=createMobileService({directory:dir,env:{...env,MOBILE_DELIVERY_MODE:'LIVE',N8N_MOBILE_EMAIL_WEBHOOK_URL:'http://private.invalid/live'},fetchImpl:()=>assert.fail('ne pas rejouer')});
  await live.idle();assert.equal((await live.get(user,job.id)).status,'QUEUED');
});
test('le mauvais type d’accusé est incertain, jamais un succès Mailpit',async t=>{
  const service=createMobileService({directory:await directory(t),env,fetchImpl:async url=>response(url.endsWith('/summary')?{summary:'Test'}:{accepted:true,messageId:'test'})});
  const job=await service.submit(user,body());await service.idle();assert.equal((await service.get(user,job.id)).status,'UNKNOWN');
});
test('Android affiche et confirme le mode test; webhook de capture privé et destinataire fixe',async()=>{
  const base=new URL('../../',import.meta.url);
  const api=await readFile(new URL('android/app/src/main/java/com/toniaconseil/voicenotes/remote/MobilePrivateApi.kt',base),'utf8');
  const ui=await readFile(new URL('android/app/src/main/java/com/toniaconseil/voicenotes/ui/ToniaVoiceNotesApp.kt',base),'utf8');
  assert.match(api,/payload.put\("testDeliveryConfirmed", true\)/);assert.match(ui,/TEST MAILPIT — aucun envoi réel/);
  const wf=JSON.parse(await readFile(new URL('n8n-workflows/mobile_capture_mailpit_v1.json',base),'utf8'));
  assert.equal(wf.active,false);assert.equal(wf.nodes[0].parameters.authentication,'headerAuth');
  const guard=wf.nodes.find(n=>n.name==='Verifier envoi').parameters.jsCode;
  assert.match(guard,/b.recipient !== 'recette@example.invalid'/);
  assert.match(guard,/representativeId/);assert.match(guard,/associationOk/);
  assert.match(wf.nodes.find(n=>n.name==='Verifier acceptation').parameters.jsCode,/deliveryMode:'MAILPIT'/);
});
