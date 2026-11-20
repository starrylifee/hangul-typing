// Start a local Firestore emulator, then set FIRESTORE_EMULATOR_HOST before running node --test.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) {
  throw new Error('This test requires a local Firestore emulator.');
}
process.env.GCLOUD_PROJECT = 'demo-typing-rewards';
const { handleRequest, drainQueue } = require('../server/reward-requests');
const { koreanDay } = require('../server/rewards');
const { Firestore, Timestamp } = require('@google-cloud/firestore');
const db = new Firestore({ projectId: process.env.GCLOUD_PROJECT });
const date = koreanDay(Date.now());
const day = { sec: 60, acc: 90, cpm: 80, keys: 80 };
const goal = { min: 1, acc: 90, cpm: 80, points: 12 };
const realFetch = global.fetch;
let reply, calls;
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://growndcard.com/')) return realFetch(url, options);
  calls.push({ url, body: JSON.parse(options.body) });
  return reply();
};
after(async () => { global.fetch = realFetch; await db.terminate(); });

async function setup(code) {
  calls = [];
  reply = () => new Response('{}');
  const room = db.doc('classes/' + code);
  await db.recursiveDelete(room);
  await room.set({ teacherUid: 'teacher', goal });
  const cfg = room.collection('integrations').doc('grownd');
  await cfg.set({ classId: 'example', apiKey: 'test-only', mode: 'auto' });
  const stu = room.collection('students').doc('test-student');
  await stu.set({ no: 1, days: { [date]: day } });
  const job = stu.collection('rewardQueue').doc(date);
  const queue = () => job.set({ uid: 'student', queuedAt: Timestamp.now() });
  await queue();
  const receipt = room.collection('growndRewards').doc(date + '_1');
  const run = () => handleRequest(db, { action: 'automatic', code, nick: stu.id, date }, 'student');
  const manual = (extra = {}, uid = 'teacher') => handleRequest(db, {
    action: extra.decision ? 'review' : 'manual', code, date, nick: stu.id, ...extra
  }, uid);
  return { code, room, cfg, stu, receipt, run, manual, queue };

}

test('1. Student record alone starts payment at the exact threshold, respecting goals, mode and owner', async () => {
  // Firestore 7 REST copies enumerable header keys into the outgoing request.
  const worker = new (require('google-auth-library').OAuth2Client)();
  worker.setCredentials({ access_token: 'test-only' });
  assert.equal({ ...await worker.getRequestHeaders() }.Authorization, 'Bearer test-only');
  const { room, cfg, stu, run, manual, receipt, queue } = await setup('110001');
  await room.update({ 'goal.min': 2 });
  await run();
  await room.update({ goal });
  await cfg.update({ mode: 'manual' });
  await queue();
  await run();
  await assert.rejects(manual({}, 'another-teacher'), /담당 교사/);
  assert.equal(calls.length, 0);
  await cfg.update({ mode: 'auto' });
  await queue();
  await run();
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /classes\/example\/students\/1\/points$/);
  assert.equal(calls[0].body.points, 12);
  assert.equal((await receipt.get()).data().status, 'sent');
  assert.equal((await stu.get()).data().grSentDays[date], true);
});

test('2. Concurrent automatic, manual and settings events, redelivery and old payment markers', async () => {
  const { code, stu, run, manual, queue } = await setup('110002');
  const enabled = await handleRequest(db, { code, action: 'catchup' }, 'teacher');
  assert.deepEqual(enabled.students, [stu.id]);
  await Promise.all([run(), manual(), handleRequest(db, { code, nick: stu.id, date, action: 'catchup-one' }, 'teacher')]);
  await queue();
  await run();
  assert.equal(calls.length, 1);
  for (const legacy of [{ grSent: date }, { grSentDays: { [date]: true } }]) {
    await stu.set({ no: 2, days: { [date]: day }, ...legacy });
    assert.equal((await manual()).status, 'sent');
  }
  assert.equal(calls.length, 1);
});

test('3. Rate limiting retries, lost responses stay on hold until the teacher reconciles', async () => {
  const { run, manual, receipt, stu } = await setup('110003');
  reply = () => new Response('', { status: 429 });
  assert.equal((await run()).status, 'retry');
  assert.equal((await receipt.get()).data().status, 'retry');
  reply = () => { throw new Error('lost acknowledgement'); };
  await drainQueue(db);
  const r = (await receipt.get()).data();
  assert.equal(r.status, 'unknown');
  await run();
  assert.equal((await manual()).status, 'unknown');
  assert.equal(calls.length, 2);
  const check = { receipt: receipt.id, attempt: r.attempt, decision: 'unpaid' };
  await assert.rejects(manual(check, 'wrong-teacher'), /담당 교사/);
  await manual(check);
  reply = () => new Response('{}');
  assert.equal((await manual()).status, 'sent');
  await assert.rejects(manual(check), /상태가 바뀌/);
  assert.equal(calls.length, 3);
  assert.equal((await stu.get()).data().grSentDays[date], true);
});
