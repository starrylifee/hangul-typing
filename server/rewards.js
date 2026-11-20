const { randomUUID } = require('node:crypto');
const goalMet = require('../js/typing-goal');

const koreanDay = time => new Date(new Date(time).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const receiptId = (date, no) => date + '_' + no;

const changed = e => [5, 6, 9, 10].includes(e.code);

// 같은 학생의 하루 몫은 오직 한 요청만 예약한다. 실패한 건의 재시도도 버전이 맞아야 한다.
async function award({ db, classroom, nick, date, automatic, uid, post = fetch }) {
  const student = classroom.collection('students').doc(nick);
  const [room, cfgDoc, stu] = await db.getAll(classroom, classroom.collection('integrations').doc('grownd'), student);
  const c = room.data() || {}, cfg = cfgDoc.data() || {}, s = stu.data() || {};
  if (!automatic && (!uid || uid !== c.teacherUid)) return 'forbidden';
  if (!cfg.apiKey || !cfg.classId || (automatic && cfg.mode !== 'auto')) return 'disabled';
  const no = Number(s.no);
  if (!Number.isInteger(no) || no < 1 || no > 99) return 'no-number';
  if (s.grSent === date || s.grSentDays?.[date]) return 'sent';
  const receipt = classroom.collection('growndRewards').doc(receiptId(date, no));
  const previous = await receipt.get(), old = previous.data();
  if (old && !['rejected', 'retry'].includes(old.status)) return old.status;
  const revision = cfgDoc.updateTime.toMillis();
  if (automatic && old?.status === 'rejected' && old.revision === revision) return 'rejected';
  if (!goalMet(s.days?.[date], c.goal)) return 'ineligible';
  const points = c.goal.points;
  if (!Number.isSafeInteger(points) || points < 1 || points > 100) return 'invalid-points';
  const attempt = randomUUID(), title = c.goal.text || '';
  const entry = { date, no, nick, points, classId: cfg.classId, attempt, revision,
    status: 'sending', startedAt: Date.now(), http: 0 };
  try {
    if (previous.exists) await receipt.update(entry, { lastUpdateTime: previous.updateTime });
    else await receipt.create(entry);
  } catch (e) {
    if (!changed(e)) throw e;
    const latest = (await receipt.get()).data();
    if (!latest) throw e;
    return latest.status;
  }
  let status = 'unknown', http = 0;
  try {
    const url = 'https://growndcard.com/api/v1/classes/' + encodeURIComponent(cfg.classId)
      + '/students/' + no + '/points';
    const response = await post(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({ type: 'reward', points, source: 'hangul-typing',
        description: ('타자 연습 목표 달성 (' + date + ') ' + title).slice(0, 100) })
    });
    http = response.status;
    if (response.ok) status = 'sent';
    else if (http === 429) status = 'retry';
    else if ([400, 401, 403, 404, 422].includes(http)) status = 'rejected';
  } catch {
    // 응답 유실이면 실제 입금됐을 수 있다. 확인 전 재전송하지 않는다.
  }
  await recordOutcome(db, receipt, attempt, { status, http });
  return status;
}

// 지급 표시와 원장을 함께 저장한다. 학생이 동시에 연습 기록을 올린 경우 저장만 다시 한다.
async function recordOutcome(db, receipt, attempt, update, review = false) {
  for (let i = 0; i < 5; i++) {
    const snapshot = await receipt.get(), item = snapshot.data();
    if (!item || item.attempt !== attempt) return false;
    const canReview = item.status === 'unknown' || (item.status === 'sending' && Date.now() - item.startedAt >= 300000);
    if (review ? !canReview : item.status !== 'sending') return false;
    const batch = db.batch();
    batch.update(receipt, update, { lastUpdateTime: snapshot.updateTime });
    if (update.status === 'sent') {
      const student = receipt.parent.parent.collection('students').doc(item.nick);
      const stu = await student.get();
      if (Number(stu.data()?.no) === item.no) {
        batch.update(student, { ['grSentDays.' + item.date]: true }, { lastUpdateTime: stu.updateTime });
      }
    }
    try { await batch.commit(); return true; }
    catch (e) { if (!changed(e) || i === 4) throw e; }
  }
}

module.exports = { award, koreanDay, recordOutcome };
