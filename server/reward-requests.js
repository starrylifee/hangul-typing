const { award, koreanDay, recordOutcome } = require('./rewards');
const goalMet = require('../js/typing-goal');

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// 예약을 읽은 뒤 학생이 새 기록을 올렸으면 새 예약은 그대로 둔다.
async function processQueue(db, job, uid) {
  if (!job.exists) return 'empty';
  const item = job.data(), student = job.ref.parent.parent, classroom = student.parent.parent;
  if (uid && uid !== item.uid) throw new RequestError(403, '본인 기록만 처리할 수 있습니다.');
  let status = 'expired';
  if (item.queuedAt && job.id === koreanDay(item.queuedAt.toMillis())) {
    status = await award({ db, classroom, nick: student.id, date: job.id, automatic: true });
  }
  if (status !== 'retry') {
    try { await job.ref.delete({ lastUpdateTime: job.updateTime }); }
    catch (e) { if (![5,9].includes(e.code)) throw e; }
  }
  return status;
}

// 수업 중에는 학생 요청이 즉시 처리된다. 닫힌 창·요청 제한 뒤 남은 건만 하루 한 번 보충한다.
async function drainQueue(db) {
  const until = Date.now() + 40000;
  let handled = 0, cursor;
  while (Date.now() < until) {
    let query = db.collectionGroup('rewardQueue').limit(4);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    await Promise.all(page.docs.map(job => processQueue(db, job)));
    handled += page.size;
    cursor = page.docs[page.size - 1];
  }
  return { handled };
}

async function handleRequest(db, data, uid) {
  const { code, nick, date, receipt, attempt, decision, action } = data;
  if (!uid) throw new RequestError(401, '로그인이 필요합니다.');
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new RequestError(400, '학급코드를 확인해 주세요.');
  const classroom = db.collection('classes').doc(code);
  if (action === 'catchup') {
    const c = (await classroom.get()).data();
    if (c?.teacherUid !== uid) throw new RequestError(403, '담당 교사만 지급할 수 있습니다.');
    const cfg = (await classroom.collection('integrations').doc('grownd').get()).data();
    if (cfg?.mode !== 'auto' || !c.goal) return { status: 'disabled' };
    const today = koreanDay(Date.now());
    const list = (await classroom.collection('students').get()).docs.filter(doc => {
      const s = doc.data();
      return !s.grSentDays?.[today] && s.grSent !== today && goalMet(s.days?.[today], c.goal);
    });
    // 개별 요청으로 나누어 교실 전체가 한 서버 함수의 실행 제한시간에 걸리지 않게 한다.
    return { students: list.map(doc => doc.id), date: today };
  }
  if (action === 'automatic') {
    if (typeof nick !== 'string' || !nick || nick.includes('/') || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new RequestError(400, '기록 정보를 확인해 주세요.');
    const job = await classroom.collection('students').doc(nick).collection('rewardQueue').doc(date).get();
    return { status: await processQueue(db, job, uid) };
  }
  if (action === 'catchup-one') {
    if ((await classroom.get()).data()?.teacherUid !== uid) throw new RequestError(403, '담당 교사만 지급할 수 있습니다.');
    if (typeof nick !== 'string' || !nick || nick.includes('/') || date !== koreanDay(Date.now()))
      throw new RequestError(400, '오늘 기록을 확인해 주세요.');
    return { status: await award({ db, classroom, nick, date, automatic: true }) };
  }
  if (action !== 'manual' && action !== 'review') throw new RequestError(400, '지급 요청을 확인해 주세요.');
  if (action === 'review') {
    if (!/^\d{4}-\d{2}-\d{2}_\d{1,2}$/.test(receipt) || !['paid', 'unpaid'].includes(decision)) {
      throw new RequestError(400, '확인할 지급 건을 골라 주세요.');
    }
    const ref = classroom.collection('growndRewards').doc(receipt);
    if ((await classroom.get()).data()?.teacherUid !== uid) throw new RequestError(403, '담당 교사만 확인할 수 있습니다.');
    const status = decision === 'paid' ? 'sent' : 'rejected';
    if (!await recordOutcome(db, ref, attempt, { status, reviewedBy: uid }, true)) {
      throw new RequestError(409, '처리 상태가 바뀌었습니다. 다시 확인해 주세요.');
    }
    return { status };
  }
  if (typeof nick !== 'string' || !nick || nick.includes('/') || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date > koreanDay(Date.now())) throw new RequestError(400, '학생과 기록 날짜를 확인해 주세요.');
  const status = await award({ db, classroom, nick, date, uid, automatic: false });
  if (status === 'forbidden') throw new RequestError(403, '담당 교사만 지급할 수 있습니다.');
  return { status };
}
module.exports = { handleRequest, drainQueue, RequestError };
