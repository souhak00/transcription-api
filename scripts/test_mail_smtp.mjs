// A exécuter uniquement depuis n8n sur le réseau tonia-mail-test.
// Vérifie MAIL/RCPT sans DATA : aucune expédition, même en cas de mauvais réglage.
import assert from 'node:assert/strict';
import net from 'node:net';

async function conversation(commands) {
  const socket = net.createConnection({ host: 'smtp-test', port: 587 });
  socket.setEncoding('utf8');
  socket.setTimeout(5000, () => socket.destroy(new Error('SMTP timeout')));
  let buffer = '';
  const queue = [];
  let waiter;
  let failure;
  socket.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trimEnd();
      buffer = buffer.slice(end + 1);
      if (!/^\d{3} /.test(line)) continue;
      if (waiter) { const { resolve } = waiter; waiter = undefined; resolve(line); }
      else queue.push(line);
    }
  });
  socket.on('error', error => { failure = error; waiter?.reject(error); waiter = undefined; });
  socket.on('close', () => { if (waiter) { waiter.reject(new Error('SMTP closed')); waiter = undefined; } });
  const response = () => failure ? Promise.reject(failure) : queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve, reject) => { waiter = { resolve, reject }; });
  const replies = [];
  try {
    assert.match(await response(), /^220 /);
    socket.write('EHLO n8n.example.invalid\r\n');
    assert.match(await response(), /^250 /);
    for (const command of commands) {
      assert.ok(!/[\r\n]/.test(command) && /^(MAIL FROM:|RCPT TO:)/.test(command));
      socket.write(`${command}\r\n`);
      replies.push(await response());
    }
    return replies;
  } finally { socket.destroy(); }
}

if (process.argv.includes('--unauthorized')) {
  const replies = await conversation(['MAIL FROM:<tonia@example.invalid>', 'RCPT TO:<recette@example.invalid>']);
  assert.ok(replies.some(line => /^5\d\d /.test(line)), 'Une adresse IP non autorisée ne doit pas relayer');
  console.log('OK : IP non autorisée refusée. Aucun DATA envoyé.');
} else {
  const valid = await conversation(['MAIL FROM:<tonia@example.invalid>', 'RCPT TO:<recette@example.invalid>']);
  assert.ok(valid.every(line => /^250 /.test(line)), valid.join('\n'));
  const external = await conversation(['MAIL FROM:<tonia@example.invalid>', 'RCPT TO:<recette@example.net>']);
  assert.match(external.at(-1), /^5\d\d /);
  const wrongSender = await conversation(['MAIL FROM:<autre@example.invalid>', 'RCPT TO:<recette@example.invalid>']);
  assert.ok(wrongSender.some(line => /^5\d\d /.test(line)));
  const multiple = await conversation(['MAIL FROM:<tonia@example.invalid>', 'RCPT TO:<a@example.invalid>', 'RCPT TO:<b@example.invalid>']);
  assert.match(multiple.at(-1), /^[45]\d\d /);
  const oversize = await conversation(['MAIL FROM:<tonia@example.invalid> SIZE=4194305']);
  assert.match(oversize[0], /^552 /);
  console.log('OK : SMTP local valide; adresse externe, mauvais expéditeur, destinataires multiples et message trop volumineux refusés. Aucun DATA envoyé.');
}
