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

  /* 마을 툴팁에 "무엇을 해서 받았는지" 적을 때 쓴다 */
  var MODE_LABEL = {
    place: '자리 연습', word: '낱말 연습', short: '짧은 글 연습', long: '긴 글 연습'
  };

  /* ---------- Firebase 지연 로딩 ---------- */
  var db = null, loading = null;
  var SDK = [
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js',
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
      // 기록을 고치려면 익명 로그인이 되어 있어야 한다 (문서 주인 확인용)
      return signInAnon().then(function () { return db; });
    });
    return loading;
  }

  function sess() { return APP.rec.cloud || null; }

  /* ---------- 레벨 특전 ----------
     반에 로그인한 학생은 레벨이 오르면 기존 게임이 조금씩 유리해진다. */
  var PERK_LIST = [
    { lv: 2, label: '🛡️ 방어전: 방어선이 튼튼해져요' },
    { lv: 3, label: '🕳️ 두더지: 낱말이 더 오래 보여요' },
    { lv: 4, label: '🏃 달리기: 컴퓨터가 살짝 느려져요' },
    { lv: 5, label: '🧩 낱말 맞추기: 시간 +15초' },
    { lv: 6, label: '🪄 마법사: 받는 피해가 줄어요' }
  ];
  function myLevel() {
    var c = sess();
    return c ? (c.level || 1) : 1;
  }
  /** 게임들이 시작 값을 정할 때 물어본다 */
  function perks() {
    var lv = myLevel();
    return {
      level: lv,
      defenseDmg: lv >= 2 ? 8 : 10,     // 방어선 피해 10 → 8
      moleLife: lv >= 3 ? 1.15 : 1,     // 두더지 낱말 수명 +15%
      raceSlow: lv >= 4 ? 0.94 : 1,     // 달리기 컴퓨터 속도 -6%
      eraseBonus: lv >= 5 ? 15 : 0,     // 낱말 맞추기 +15초
      spellGuard: lv >= 6 ? 0.8 : 1     // 마법사 받는 피해 -20%
    };
  }
  function perkLine() {
    var c = sess();
    if (!c) return '우리 반으로 로그인하면 레벨이 오를 때마다 게임 특전이 열려요.';
    var lv = myLevel();
    var got = PERK_LIST.filter(function (p) { return lv >= p.lv; });
    var next = PERK_LIST.filter(function (p) { return lv < p.lv; })[0];
    var s = got.length ? got.map(function (p) { return p.label; }).join('   ') : '아직 없어요.';
    if (next) s += '   (다음: Lv.' + next.lv + '에 ' + next.label + ')';
    return s;
  }
  function stuRef(c) {
    return db.collection('classes').doc(c.code).collection('students').doc(c.nick);
  }
  /** 핀이 들어 있는 하위 문서 — 규칙만 읽을 수 있고 클라이언트는 못 읽는다 */
  function pinRef(c) {
    return stuRef(c).collection('auth').doc('pin');
  }

  /* ---------- 익명 로그인 ----------
     기록을 고칠 수 있는 사람을 "핀이 맞은 그 기기" 로 좁히기 위한 것이다.
     콘솔에서 익명 로그인을 아직 켜지 않았다면 조용히 실패하고,
     그때는 예전 방식(핀 해시 맞춰 보기)으로 되돌아간다. */
  var anonUid = null, anonWait = null;

  /* Firebase 는 저장해 둔 로그인 상태를 비동기로 되살린다.
     초기화 직후 currentUser 를 그냥 읽으면 아직 null 이라, 그때마다
     새 익명 계정을 만들어 버린다. 그러면 학생이 새로고침할 때마다
     문서 주인 자격을 잃는다. 반드시 onAuthStateChanged 로 기다린다. */
  function signInAnon() {
    if (anonUid) return Promise.resolve(anonUid);
    if (anonWait) return anonWait;
    if (!window.firebase || !firebase.auth) return Promise.resolve(null);

    anonWait = new Promise(function (resolve) {
      var done = false;
      var unsub = firebase.auth().onAuthStateChanged(function (u) {
        if (done) return;
        done = true;
        unsub();
        if (u) { anonUid = u.uid; resolve(anonUid); return; }
        firebase.auth().signInAnonymously()
          .then(function (r) { anonUid = r.user.uid; resolve(anonUid); })
          .catch(function (e) {
            console.warn('익명 로그인을 쓸 수 없습니다 (예전 방식으로 진행):', e && e.code);
            resolve(null);
          });
      });
    }).then(function (uid) {
      anonWait = null;
      // 이후 로그인 상태가 바뀌면 캐시도 따라 바꾼다 (묵은 uid 로 주인을 잘못 적지 않게)
      firebase.auth().onAuthStateChanged(function (u) { anonUid = u ? u.uid : null; });
      return uid;
    });
    return anonWait;
  }

  /** 지금 이 기기의 익명 uid — 늘 실제 로그인 상태에서 읽는다 */
  function myUid() {
    var u = window.firebase && firebase.auth && firebase.auth().currentUser;
    return u ? u.uid : anonUid;
  }

  /* ---------- 게임 열림 규칙 — 교사가 대시보드에서 정한다 ----------
     반 문서의 game: { on, days:[0(일)~6(토)], from:'HH:MM', to:'HH:MM' }.
     반에 로그인하지 않은 학생에게는 적용되지 않는다. */
  var DAY_NAME = ['일', '월', '화', '수', '목', '금', '토'];
  var ruleAt = 0;          // 규칙을 마지막으로 받아 온 시각

  function fetchGameRule() {
    var c = sess();
    if (!c) return;
    needFirebase().then(function () {
      return db.collection('classes').doc(c.code).get();
    }).then(function (doc) {
      var cc = sess();
      if (!doc.exists || !cc || cc.code !== c.code) return;
      cc.gameRule = doc.data().game || null;
      ruleAt = Date.now();
      APP.save();
    }).catch(function () { });
  }

  /** 지금 한국시간 */
  function kstNow() {
    return new Date(Date.now() + (new Date().getTimezoneOffset() + 540) * 60000);
  }

  /** 게임을 열어도 되는가. { open, msg } 를 돌려준다. */
  function gameGate() {
    var c = sess();
    if (!c) return { open: true };
    // 규칙이 오래됐으면 새로 받아 둔다 (이번 판정은 갖고 있던 규칙으로)
    if (Date.now() - ruleAt > 60000) fetchGameRule();
    var g = c.gameRule;
    if (!g) return { open: true };
    if (g.on === false) return { open: false, msg: '지금은 선생님이 게임을 닫아 두었어요.' };

    var kst = kstNow();
    var when = [];
    if (g.days && g.days.length && g.days.length < 7) {
      var order = [1, 2, 3, 4, 5, 6, 0];   // 월화수목금토일 순서로 보여 준다
      when.push(order.filter(function (d) { return g.days.indexOf(d) >= 0; })
        .map(function (d) { return DAY_NAME[d]; }).join('·') + '요일');
    }
    if (g.from && g.to) when.push(g.from + '~' + g.to);
    var msg = '게임은 ' + when.join(' ') + '에 열려요. (한국시간)';

    if (g.days && g.days.length && g.days.indexOf(kst.getDay()) < 0) {
      return { open: false, msg: msg };
    }
    if (g.from && g.to) {
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      var hm = p(kst.getHours()) + ':' + p(kst.getMinutes());
      if (hm < g.from || hm >= g.to) return { open: false, msg: msg };
    }
    return { open: true };
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
  /* 핀 확인은 "읽어서 비교" 가 아니라 "써 보고 통과하는지" 로 한다.
     핀 문서는 아무도 못 읽으므로, 해시를 훔쳐 오프라인에서 1만 번 돌리는 길이 막힌다.
     통과하면 그 자리에서 이 기기가 문서의 주인(ownerUid)이 된다. */
  function verifyPin(c, hash, uid) {
    return pinRef(c).update({ pinHash: hash, ownerUid: uid || null })
      .then(function () { return true; })
      .catch(function (e) {
        if (e && e.code === 'permission-denied') throw new Error('핀 번호가 틀렸습니다.');
        /* 핀 문서가 없다 — 새로 만들어졌거나, 누가 몸통만 빈 껍데기로 선점해 둔 경우.
           이때는 지금 로그인한 사람이 핀을 정하며 주인이 된다 (처음 정한 핀이 임자). */
        if (e && e.code === 'not-found') {
          return pinRef(c).set({ pinHash: hash, ownerUid: uid || null }).then(function () { return true; });
        }
        throw e;
      });
  }

  function join(code, nick, pin, no) {
    var className = '';
    var c = { code: code, nick: nick };
    var uid = null;
    return needFirebase().then(function () {
      return signInAnon();
    }).then(function (u) {
      uid = u || myUid();          // 복원이 늦어도 실제 값을 쓴다
      return db.collection('classes').doc(code).get();
    }).then(function (doc) {
      if (!doc.exists) throw new Error('학급코드를 찾을 수 없습니다. 다시 확인해 주세요.');
      className = doc.data().name || '';
      return Promise.all([stuRef(c).get(), pinHash(code, nick, pin)]);
    }).then(function (r) {
      var doc = r[0], hash = r[1];

      /* ---------- 처음 오는 학생 ---------- */
      if (!doc.exists) {
        var mk = function () {
          var fresh = {
            no: no || null, points: 0, level: 1, days: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          return doc.ref.set(fresh)
            .then(function () { return pinRef(c).set({ pinHash: hash, ownerUid: myUid() || null }); })
            .then(function () { return fresh; });
        };
        if (!no) return mk();
        /* 같은 출석번호가 이미 다른 별명으로 등록돼 있으면 막는다.
           아이가 별명을 바꿔 적으면 계정이 둘로 갈라져 포인트·마을이
           쪼개진다 (2026-08-28 실제 사고). 번호를 다시 써야 하면
           교사가 대시보드에서 옛 별명을 지운 뒤에 가입하면 된다. */
        return db.collection('classes').doc(code).collection('students')
          .where('no', '==', no).limit(1).get()
          .then(function (qs) {
            if (!qs.empty) {
              throw new Error(no + '번은 이미 별명 「' + qs.docs[0].id
                + '」(으)로 등록돼 있어요. 그 별명으로 로그인해 주세요. 별명이나 핀을 잊었으면 선생님께 말씀드리세요.');
            }
            return mk();
          });
      }

      var d = doc.data();

      /* ---------- 예전 구조에서 넘어오는 학생 ----------
         핀 해시가 아직 본문에 들어 있다. 이번 로그인에서 하위 문서로 옮기고
         본문에서는 지운다. 학생·교사가 따로 할 일은 없다. */
      if (typeof d.pinHash === 'string') {
        if (d.pinHash !== '' && d.pinHash !== hash) throw new Error('핀 번호가 틀렸습니다.');
        return pinRef(c).set({ pinHash: hash, ownerUid: myUid() || null })
          .then(function () {
            return doc.ref.update({
              pinHash: firebase.firestore.FieldValue.delete()
            });
          })
          .then(function () { return d; })
          .catch(function (e) {
            // 옮기다 실패해도 로그인은 되게 둔다 (다음에 다시 시도된다)
            console.warn('핀 옮기기 실패, 다음에 다시 시도합니다:', e && e.code);
            return d;
          });
      }

      /* ---------- 이미 새 구조인 학생 ---------- */
      return verifyPin(c, hash, myUid()).then(function () { return d; });
    }).then(function (d) {
      /* 별명이 곧 신원이다 — 로그인하면 그 별명의 기록 서랍으로 옮겨 앉는다.
         첫 화면에서 이름을 안 묻게 되면서, 다른 학생 서랍 위에 그대로
         로그인해 기록이 섞이는 일을 여기서 막는다. */
      if (APP.rec.name !== nick) APP.switchStudent(nick);
      APP.rec.cloud = {
        code: code, nick: nick, no: no || d.no || null, className: className,
        points: d.points || 0, level: d.level || 1, pt: null,
        // 마을(시즌)은 서버에도 두어서 다른 크롬북에서 로그인해도 이어진다
        season: d.season || null, past: d.past || null
      };
      if (!APP.rec.name) APP.rec.name = nick;
      APP.save();
      renderBadge();
      scheduleSync();          // 이 컴퓨터에 쌓인 오늘 기록을 바로 올린다
      fetchGameRule();         // 게임 열림 규칙도 받아 둔다
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
    var beforeLv = 1 + Math.floor(before / PT.perLevel);

    /* 마을은 시즌 포인트로 자란다 (3개월마다 마을만 새로 시작).
       평생 누적 c.points 와 레벨·게임 특전은 리셋되지 않는다.

       반드시 c.points 를 올리기 전에 부른다. 시즌제로 처음 넘어오는
       학생은 마을이 c.points 를 시작값으로 물려받는데, 순서가 뒤바뀌면
       이번에 받은 p 가 시작값에도 들어가 두 번 더해진다. */
    var spBefore = window.VILLAGE ? VILLAGE.addPoints(p) : 0;

    c.pt.earned += p;
    c.points = before + p;
    c.level = 1 + Math.floor(c.points / PT.perLevel);
    APP.save();

    if (window.VILLAGE) {
      VILLAGE.onPoints(spBefore, spBefore + p, {
        by: kind === 'game'
          ? (entry.name || '타자 게임')
          : (entry.title || MODE_LABEL[entry.mode] || '타자 연습')
      });
    }
    // 시즌 여정 — 과제 진행도를 센다 (마을 포인트가 붙은 뒤에)
    if (window.QUEST) QUEST.onActivity(kind, entry);
    if (c.level > beforeLv) {
      var lvNow = c.level;
      setTimeout(function () {
        var perk = PERK_LIST.filter(function (x) { return x.lv === lvNow; })[0];
        APP.toast('🎉 레벨 ' + lvNow + '이 됐어요!' + (perk ? ' 새 특전 — ' + perk.label : ''));
      }, 2000);
    }
    if (p > 0) APP.toast('+' + p + ' 타자 포인트!  (모두 ' + c.points + 'P)');
    renderBadge();
    scheduleSync();
  }

  /* =========================================================
     서버로 올리기 — 오늘 요약 + 포인트. 몰아서 4초에 한 번.
     ========================================================= */
  var syncTm = null;
  var warnedOwner = false;      // 주인이 아니라는 안내는 한 번만
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
      // 마을(시즌) — 교사 대시보드에서도 보고, 다른 기기에서 이어 하려면 필요하다
      if (c.season) payload.season = c.season;
      if (c.past) payload.past = c.past;
      // 교사 대시보드에서 학생 리포트 수준으로 볼 수 있게 상세도 함께 올린다
      var byLevel = {};
      for (var lv in s.byLevel) {
        byLevel[lv] = { n: s.byLevel[lv].n | 0, cpm: s.byLevel[lv].cpm | 0, acc: s.byLevel[lv].acc | 0 };
      }
      var missTop = REPORT.missTop(s.miss, 5).map(function (t) {
        return { jamo: t.jamo, finger: t.finger, count: t.count | 0 };
      });
      payload.days[today] = {
        sec: s.sec | 0, keys: s.keys | 0, err: s.err | 0,
        acc: s.acc | 0, cpm: s.cpm | 0,
        modes: s.modes, byLevel: byLevel, miss: missTop
      };
      return stuRef(c).set(payload, { merge: true });
    }).catch(function (e) {
      console.warn('반 기록 올리기 실패(다음에 다시 시도):', e && e.message);
      /* 이 기기가 더 이상 이 학생 문서의 주인이 아니다.
         (다른 기기에서 로그인했거나 브라우저 데이터가 지워졌다)
         조용히 실패하면 아이는 기록이 쌓이는 줄 알고 계속 연습한다. */
      if (e && e.code === 'permission-denied' && !warnedOwner) {
        warnedOwner = true;
        APP.toast('🔑 기록을 올리지 못했어요. 우리 반으로 다시 로그인해 주세요.');
      }
    });
  }

  /* =========================================================
     서버와 대조 — 옛 기록 서랍이 깨어나도 스스로 낫는다.
     이름을 바꿔 적으면 이 컴퓨터의 옛 프로필이 되살아나는데, 그 안의
     포인트·마을은 과거 시점 것이다. 서버 규칙이 되감기를 거부하므로
     서버가 늘 가장 앞선 값 — 서버가 더 앞서 있으면 포인트·레벨·마을을
     서버 것으로 바꿔 끼운다. 날짜별 연습 기록은 이 컴퓨터에만 있으므로
     건드리지 않는다. (2026-08-28 되감기 사고 후)
     ========================================================= */
  function refresh() {
    var c = sess();
    if (!c) return;
    needFirebase().then(function () {
      return stuRef(c).get();
    }).then(function (doc) {
      if (!doc.exists) return;
      var d = doc.data();
      if ((d.points || 0) <= (c.points || 0)) return;
      c.points = d.points || 0;
      c.level = d.level || 1;
      if (d.season) c.season = d.season;
      if (d.past) c.past = d.past;
      APP.save();
      renderBadge();
      APP.toast('☁️ 서버에 있던 더 앞선 기록을 가져왔어요 (' + c.points + 'P)');
    }).catch(function () { });
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
    if (window.GAMES && GAMES.paintGuestBar) GAMES.paintGuestBar();
    var pl = $('perk-line');
    if (pl) pl.textContent = perkLine();
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
    // 어제 하다 만 세션이 있으면 서버와 대조한 뒤 오늘 기록을 이어 올린다
    if (sess()) { refresh(); scheduleSync(); fetchGameRule(); }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    onActivity: onActivity, renderBadge: renderBadge, sync: sync, join: join,
    refresh: refresh,
    perks: perks, gameGate: gameGate,
    /** Firestore 를 빌려 쓴다 (반 순위 등). SDK 를 아직 안 받았으면 그때 받는다. */
    db: function () { return needFirebase(); }
  };
})();
