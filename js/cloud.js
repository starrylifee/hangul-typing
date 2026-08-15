/* =========================================================
   cloud.js — "우리 반으로 시작": 학급코드 + 별명 + 핀 로그인,
   연습·게임 기록과 타자 포인트를 Firestore 에 누적한다.
   Firebase SDK 는 반 기능을 쓸 때만 내려받는다.
   실명은 어디에도 저장하지 않는다 (별명 + 핀 + 출석번호만).
   ========================================================= */
var CLOUD = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 포인트 기본 세팅 ----------
     연습 1회 10P (+정확도 95% 이상 5P), 게임 1회 5P,
     그날 첫 활동 +10P, 하루 최대 100P, 150P 마다 1레벨 */
  var PT = { practice: 10, game: 5, accBonus: 5, firstBonus: 10, dailyMax: 100, perLevel: 150 };

  /* ---------- Firebase 지연 로딩 ---------- */
  var db = null, loading = null;
  var SDK = [
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js'
  ];
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('인터넷 연결을 확인해 주세요')); };
      document.head.appendChild(s);
    });
  }
  function needFirebase() {
    if (db) return Promise.resolve(db);
    if (loading) return loading;
    loading = SDK.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve()).then(function () {
      firebase.initializeApp(FB_CONFIG);
      db = firebase.firestore();
      return db;
    });
    return loading;
  }

  function sess() { return APP.rec.cloud || null; }
  function stuRef(c) {
    return db.collection('classes').doc(c.code).collection('students').doc(c.nick);
  }

  /* ---------- 핀은 그대로 저장하지 않고 지문(해시)만 저장 ---------- */
  function pinHash(code, nick, pin) {
    var raw = new TextEncoder().encode(code + '|' + nick + '|' + pin);
    return crypto.subtle.digest('SHA-256', raw).then(function (h) {
      var out = '';
      new Uint8Array(h).forEach(function (b) { out += (b < 16 ? '0' : '') + b.toString(16); });
      return out;
    });
  }

  /* =========================================================
     가입 / 로그인
     ========================================================= */
  function join(code, nick, pin, no) {
    var className = '';
    return needFirebase().then(function () {
      return db.collection('classes').doc(code).get();
    }).then(function (doc) {
      if (!doc.exists) throw new Error('학급코드를 찾을 수 없습니다. 다시 확인해 주세요.');
      className = doc.data().name || '';
      return Promise.all([stuRef({ code: code, nick: nick }).get(), pinHash(code, nick, pin)]);
    }).then(function (r) {
      var doc = r[0], hash = r[1];
      if (doc.exists) {
        var d = doc.data();
        if (d.pinHash === '') {
          // 선생님이 핀을 초기화해 줬다 → 지금 넣은 핀이 새 핀이 된다
          return doc.ref.update({ pinHash: hash }).then(function () { return d; });
        }
        if (d.pinHash !== hash) throw new Error('핀 번호가 틀렸습니다.');
        return d;
      }
      var fresh = {
        pinHash: hash, no: no || null, points: 0, level: 1, days: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      return doc.ref.set(fresh).then(function () { return fresh; });
    }).then(function (d) {
      APP.rec.cloud = {
        code: code, nick: nick, no: no || d.no || null, className: className,
        points: d.points || 0, level: d.level || 1, pt: null
      };
      if (!APP.rec.name) APP.rec.name = nick;
      APP.save();
      renderBadge();
      scheduleSync();          // 이 컴퓨터에 쌓인 오늘 기록을 바로 올린다
      return APP.rec.cloud;
    });
  }

  function leave() {
    if (!confirm('우리 반 연결을 끊을까요?\n서버에 쌓인 기록은 남고, 다시 로그인하면 이어집니다.')) return;
    delete APP.rec.cloud;
    APP.save();
    renderBadge();
    APP.toast('반 연결을 끊었습니다');
  }

  /* =========================================================
     활동 → 포인트 적립 (app.js 가 기록할 때마다 불러 준다)
     ========================================================= */
  function onActivity(kind, entry) {
    var c = sess();
    if (!c) return;
    var today = APP.todayKey();
    if (!c.pt || c.pt.date !== today) c.pt = { date: today, earned: 0, first: true };

    var p = kind === 'practice' ? PT.practice : PT.game;
    if (kind === 'practice' && (entry.acc || 0) >= 95) p += PT.accBonus;
    if (c.pt.first) { p += PT.firstBonus; c.pt.first = false; }
    p = Math.max(0, Math.min(p, PT.dailyMax - c.pt.earned));   // 하루 상한

    var before = c.points || 0;
    c.pt.earned += p;
    c.points = before + p;
    c.level = 1 + Math.floor(c.points / PT.perLevel);
    APP.save();
    if (window.VILLAGE) VILLAGE.onPoints(before, c.points);
    if (p > 0) APP.toast('+' + p + ' 타자 포인트!  (모두 ' + c.points + 'P)');
    renderBadge();
    scheduleSync();
  }

  /* =========================================================
     서버로 올리기 — 오늘 요약 + 포인트. 몰아서 4초에 한 번.
     ========================================================= */
  var syncTm = null;
  function scheduleSync() {
    clearTimeout(syncTm);
    syncTm = setTimeout(sync, 4000);
  }
  function sync() {
    var c = sess();
    if (!c) return;
    var today = APP.todayKey();
    var s = REPORT.summarize(today);
    needFirebase().then(function () {
      var payload = {
        no: c.no || null,
        points: c.points || 0,
        level: c.level || 1,
        days: {}
      };
      payload.days[today] = {
        sec: s.sec | 0, keys: s.keys | 0, err: s.err | 0,
        acc: s.acc | 0, cpm: s.cpm | 0
      };
      return stuRef(c).set(payload, { merge: true });
    }).catch(function (e) {
      console.warn('반 기록 올리기 실패(다음에 다시 시도):', e && e.message);
    });
  }

  /* =========================================================
     홈 화면 표시
     ========================================================= */
  function renderBadge() {
    var btn = $('btn-login'), badge = $('cloud-badge');
    if (!btn || !badge) return;
    var c = sess();
    if (c) {
      btn.textContent = '🏫 ' + (c.className || '우리 반') + ' · ' + c.nick;
      badge.textContent = '🏫 ' + c.nick + ' · ' + (c.points || 0) + 'P · Lv.' + (c.level || 1);
    } else {
      btn.textContent = '🔑 로그인';
      badge.textContent = '';
    }
    if (window.VILLAGE) VILLAGE.updateButton();
  }

  /* =========================================================
     연결
     ========================================================= */
  function openModal() {
    $('cloud-code').value = '';
    $('cloud-nick').value = APP.rec.name || '';
    $('cloud-pin').value = '';
    $('cloud-no').value = '';
    $('cloud-msg').textContent = '';
    $('cloud-modal').hidden = false;
    setTimeout(function () { $('cloud-code').focus(); }, 30);
  }

  function submit() {
    var code = $('cloud-code').value.trim();
    var nick = $('cloud-nick').value.trim();
    var pin = $('cloud-pin').value.trim();
    var no = parseInt($('cloud-no').value, 10) || null;
    var msg = $('cloud-msg');
    if (!/^\d{6}$/.test(code)) { msg.textContent = '학급코드는 숫자 6자리입니다.'; return; }
    if (!nick) { msg.textContent = '별명을 적어 주세요. (진짜 이름 말고!)'; return; }
    if (!/^\d{4}$/.test(pin)) { msg.textContent = '핀 번호는 숫자 4자리입니다.'; return; }

    var btn = $('cloud-ok');
    btn.disabled = true;
    msg.textContent = '연결하는 중…';
    join(code, nick, pin, no)
      .then(function (c) {
        $('cloud-modal').hidden = true;
        APP.toast(c.className + ' 반에 ' + c.nick + '(으)로 연결됐습니다!');
      })
      .catch(function (e) { msg.textContent = e.message || '연결하지 못했습니다.'; })
      .then(function () { btn.disabled = false; });
  }

  function init() {
    if (!$('btn-login')) return;
    // 로그인 버튼: 연결 전에는 교사/학생 고르기, 연결 뒤에는 끊기
    $('btn-login').onclick = function () {
      if (sess()) { leave(); return; }
      $('login-modal').hidden = false;
    };
    $('login-cancel').onclick = function () { $('login-modal').hidden = true; };
    $('login-student').onclick = function () {
      $('login-modal').hidden = true;
      openModal();
    };
    $('login-teacher').onclick = function () { location.href = 'teacher.html'; };
    $('cloud-ok').onclick = submit;
    $('cloud-cancel').onclick = function () { $('cloud-modal').hidden = true; };
    ['cloud-code', 'cloud-nick', 'cloud-pin', 'cloud-no'].forEach(function (id) {
      $(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
    });
    renderBadge();
    // 어제 하다 만 세션이 있으면 오늘 기록을 이어 올린다
    if (sess()) scheduleSync();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { onActivity: onActivity, renderBadge: renderBadge, sync: sync, join: join };
})();
