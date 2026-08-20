/* =========================================================
   teacher.js — 교사 대시보드
   Google 로그인 → 반 만들기(학급코드) → 학생 현황 · 오늘의 목표 · 그라운드 연동
   ========================================================= */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  firebase.initializeApp(FB_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();

  var me = null;             // 로그인한 교사
  var classes = [];          // 내 반 목록 [{code, name, goal}]
  var curClass = null;       // 지금 보는 반
  var students = [];         // 지금 보는 반의 학생들

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  function todayKey() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function show(login) {
    $('t-login').classList.toggle('on', login);
    $('t-main').classList.toggle('on', !login);
  }

  /* =========================================================
     로그인
     ========================================================= */
  function init() {
    $('btn-google').onclick = function () {
      var provider = new firebase.auth.GoogleAuthProvider();
      auth.signInWithPopup(provider).catch(function (e) {
        // 팝업이 막힌 환경(일부 크롬북)은 리다이렉트로
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user')) {
          auth.signInWithRedirect(provider);
        } else {
          $('login-msg').textContent = '로그인하지 못했습니다: ' + (e && e.message || e);
        }
      });
    };
    $('btn-logout').onclick = function () { auth.signOut(); };

    auth.onAuthStateChanged(function (user) {
      me = user;
      if (!user) { show(true); return; }
      $('me-email').textContent = user.email || '';
      show(false);
      loadClasses();
    });

    /* 탭 */
    document.querySelectorAll('.t-tab').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.t-tab').forEach(function (x) { x.classList.remove('on'); });
        document.querySelectorAll('.t-pane').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        $('pane-' + b.dataset.tab).classList.add('on');
      };
    });

    /* 반 */
    $('btn-new-class').onclick = function () {
      $('newclass-name').value = '';
      $('newclass-modal').hidden = false;
      setTimeout(function () { $('newclass-name').focus(); }, 30);
    };
    $('newclass-cancel').onclick = function () { $('newclass-modal').hidden = true; };
    $('newclass-ok').onclick = createClass;
    $('newclass-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); createClass(); }
    });
    $('class-select').onchange = function () {
      selectClass(this.value);
    };
    $('btn-copy-code').onclick = function () {
      if (!curClass) return;
      navigator.clipboard.writeText(curClass.code).then(function () {
        toast('학급코드를 복사했습니다');
      });
    };

    /* 학생 */
    $('btn-refresh').onclick = loadStudents;

    /* 목표 */
    $('btn-save-goal').onclick = saveGoal;

    /* 그라운드 */
    $('btn-save-grownd').onclick = saveGrowndCfg;
    $('btn-send-grownd').onclick = sendGrowndPoints;
  }

  /* =========================================================
     반
     ========================================================= */
  function loadClasses() {
    db.collection('classes').where('teacherUid', '==', me.uid).get()
      .then(function (snap) {
        classes = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          classes.push({ code: doc.id, name: d.name || doc.id, goal: d.goal || null });
        });
        classes.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
        renderClassSelect();
        if (classes.length) selectClass(classes[0].code);
        else {
          curClass = null;
          $('class-code').textContent = '------';
          $('newclass-modal').hidden = false;
          setTimeout(function () { $('newclass-name').focus(); }, 30);
        }
      })
      .catch(function (e) { toast('반 목록을 읽지 못했습니다: ' + e.message); });
  }

  function renderClassSelect() {
    var sel = $('class-select');
    sel.innerHTML = '';
    classes.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.code;
      o.textContent = c.name + ' (' + c.code + ')';
      sel.appendChild(o);
    });
  }

  function newCode() {
    // 0으로 시작하지 않는 6자리 숫자
    return String(100000 + Math.floor(Math.random() * 900000));
  }

  function createClass() {
    var name = $('newclass-name').value.trim();
    if (!name) { toast('반 이름을 적어 주세요'); return; }
    var code = newCode();
    var ref = db.collection('classes').doc(code);
    ref.get().then(function (doc) {
      if (doc.exists) return createClass();       // 코드가 겹치면 다시 뽑는다
      return ref.set({
        name: name,
        teacherUid: me.uid,
        teacherEmail: me.email || '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        goal: null
      }).then(function () {
        $('newclass-modal').hidden = true;
        toast('반을 만들었습니다. 학급코드 ' + code);
        loadClasses();
      });
    }).catch(function (e) { toast('반을 만들지 못했습니다: ' + e.message); });
  }

  function selectClass(code) {
    curClass = null;
    classes.forEach(function (c) { if (c.code === code) curClass = c; });
    if (!curClass) return;
    $('class-select').value = code;
    $('class-code').textContent = code;
    fillGoalForm(curClass.goal);
    loadGrowndCfg();
    loadStudents();
  }

  /* =========================================================
     학생 현황
     ========================================================= */
  function loadStudents() {
    if (!curClass) return;
    db.collection('classes').doc(curClass.code).collection('students').get()
      .then(function (snap) {
        students = [];
        snap.forEach(function (doc) {
          var d = doc.data();
          d.nick = doc.id;
          students.push(d);
        });
        students.sort(function (a, b) {
          return (a.no || 999) - (b.no || 999) || (a.nick < b.nick ? -1 : 1);
        });
        renderStudents();
      })
      .catch(function (e) { toast('학생 목록을 읽지 못했습니다: ' + e.message); });
  }

  function metGoal(stu) {
    var g = curClass && curClass.goal;
    if (!g || g.date !== todayKey()) return null;      // 오늘 목표가 없다
    var d = (stu.days || {})[todayKey()];
    if (!d) return false;
    if ((d.sec || 0) / 60 < (g.min || 0)) return false;
    if ((d.acc || 0) < (g.acc || 0)) return false;
    if ((d.cpm || 0) < (g.cpm || 0)) return false;
    return true;
  }

  /** 목표를 못 이룬 이유를 사람 말로 — 마우스를 올리면 보인다 */
  function goalMissReason(stu) {
    var g = curClass && curClass.goal;
    if (!g || g.date !== todayKey()) return '';
    var d = (stu.days || {})[todayKey()];
    if (!d) return '오늘 연습 기록이 아직 없습니다';
    var r = [];
    var min = Math.round((d.sec || 0) / 60);
    if (min < (g.min || 0)) r.push('연습 시간 ' + min + '분 (목표 ' + g.min + '분)');
    if ((d.acc || 0) < (g.acc || 0)) r.push('정확도 ' + (d.acc || 0) + '% (목표 ' + g.acc + '%)');
    if ((d.cpm || 0) < (g.cpm || 0)) r.push('최고 타수 ' + (d.cpm || 0) + '타 (목표 ' + g.cpm + '타)');
    return r.join(' · ');
  }

  function renderStudents() {
    var tbody = $('stu-rows');
    tbody.innerHTML = '';
    $('stu-empty').style.display = students.length ? 'none' : 'block';
    $('stu-count').textContent = students.length
      ? '학생 ' + students.length + '명 · ' + todayKey()
      : '';

    students.forEach(function (s) {
      var d = (s.days || {})[todayKey()] || {};
      var ok = metGoal(s);
      var tr = document.createElement('tr');

      function td(html, cls) {
        var t = document.createElement('td');
        if (cls) t.className = cls;
        t.innerHTML = html;
        return t;
      }
      tr.appendChild(td('<b>' + esc(s.nick) + '</b>'));
      tr.appendChild(td(s.no ? String(s.no) : '-', 'num'));
      tr.appendChild(td(d.sec ? Math.round(d.sec / 60) + '분 · ' + (d.keys || 0).toLocaleString() + '타' : '-', 'num'));
      tr.appendChild(td(d.cpm ? d.cpm + '타' : '-', 'num'));
      tr.appendChild(td(d.acc ? d.acc + '%' : '-', 'num'));
      tr.appendChild(td(String(s.points || 0), 'num'));
      tr.appendChild(td('Lv.' + (s.level || 1), 'num'));
      var sent = s.grSent === todayKey();
      tr.appendChild(td(ok === null ? '<span class="goal-no">목표 없음</span>'
        : ok ? '<span class="goal-ok">✓</span>' + (sent ? ' <span class="gr-sent">보냄</span>' : '')
          : '<span class="goal-no why" title="' + esc(goalMissReason(s)) + '">아직</span>'));

      var act = document.createElement('td');
      act.className = 'rowbtns';
      var pinBtn = document.createElement('button');
      pinBtn.className = 'btn ghost sm';
      pinBtn.textContent = '핀 초기화';
      pinBtn.onclick = function () { resetPin(s.nick); };
      var delBtn = document.createElement('button');
      delBtn.className = 'btn ghost sm';
      delBtn.textContent = '삭제';
      delBtn.onclick = function () { removeStudent(s.nick); };
      act.appendChild(pinBtn);
      act.appendChild(delBtn);
      tr.appendChild(act);

      tbody.appendChild(tr);
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function resetPin(nick) {
    if (!confirm(nick + ' 학생의 핀 번호를 초기화할까요?\n다음 로그인 때 새 핀을 정하게 됩니다.')) return;
    db.collection('classes').doc(curClass.code).collection('students').doc(nick)
      .update({ pinHash: '' })
      .then(function () { toast('핀을 초기화했습니다'); loadStudents(); })
      .catch(function (e) { toast('실패: ' + e.message); });
  }

  function removeStudent(nick) {
    if (!confirm(nick + ' 학생을 반에서 삭제할까요?\n서버의 기록이 지워집니다. (학생 컴퓨터의 기록은 남습니다)')) return;
    db.collection('classes').doc(curClass.code).collection('students').doc(nick)
      .delete()
      .then(function () { toast('삭제했습니다'); loadStudents(); })
      .catch(function (e) { toast('실패: ' + e.message); });
  }

  /* =========================================================
     오늘의 목표
     ========================================================= */
  function fillGoalForm(g) {
    $('goal-text').value = (g && g.text) || '';
    $('goal-min').value = (g && g.min != null) ? g.min : 10;
    $('goal-acc').value = (g && g.acc != null) ? g.acc : 90;
    $('goal-cpm').value = (g && g.cpm != null) ? g.cpm : 0;
    $('goal-points').value = (g && g.points != null) ? g.points : 10;
    $('goal-saved').textContent = (g && g.date)
      ? (g.date === todayKey() ? '오늘 목표가 걸려 있습니다.' : g.date + ' 목표가 저장돼 있습니다 (오늘 아님).')
      : '';
  }

  function saveGoal() {
    if (!curClass) return;
    var goal = {
      text: $('goal-text').value.trim(),
      min: Math.max(0, $('goal-min').value | 0),
      acc: Math.max(0, Math.min(100, $('goal-acc').value | 0)),
      cpm: Math.max(0, $('goal-cpm').value | 0),
      points: Math.max(1, $('goal-points').value | 0),
      date: todayKey()
    };
    db.collection('classes').doc(curClass.code).update({ goal: goal })
      .then(function () {
        curClass.goal = goal;
        $('goal-saved').textContent = '오늘 목표로 저장했습니다.';
        toast('오늘의 목표를 저장했습니다');
        renderStudents();
      })
      .catch(function (e) { toast('저장 실패: ' + e.message); });
  }

  /* =========================================================
     그라운드 연동
     API 키는 이 컴퓨터(localStorage)에만 저장한다.
     ========================================================= */
  function grKey() { return 'grownd_' + (curClass ? curClass.code : ''); }

  function loadGrowndCfg() {
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(grKey()) || '{}'); } catch (e) { }
    $('gr-key').value = cfg.apiKey || '';
    $('gr-class').value = cfg.classId || '';
    $('gr-saved').textContent = cfg.apiKey ? '저장돼 있습니다.' : '';
    $('gr-result').textContent = '';
  }

  function saveGrowndCfg() {
    if (!curClass) return;
    var cfg = { apiKey: $('gr-key').value.trim(), classId: $('gr-class').value.trim() };
    try { localStorage.setItem(grKey(), JSON.stringify(cfg)); } catch (e) { }
    $('gr-saved').textContent = '저장했습니다. (이 컴퓨터에만)';
    toast('그라운드 설정을 저장했습니다');
  }

  function sendGrowndPoints() {
    if (!curClass) return;
    var g = curClass.goal;
    if (!g || g.date !== todayKey()) { toast('먼저 오늘의 목표를 저장해 주세요'); return; }
    var cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(grKey()) || '{}'); } catch (e) { }
    if (!cfg.apiKey || !cfg.classId) { toast('그라운드 API 키와 학급 ID를 먼저 저장해 주세요'); return; }

    // 오늘 이미 받은 학생은 뺀다 — 나중에 달성한 학생 몫을 보낼 때 중복 지급을 막는다
    var already = students.filter(function (s) { return metGoal(s) === true && s.grSent === todayKey(); });
    var targets = students.filter(function (s) { return metGoal(s) === true && s.no && s.grSent !== todayKey(); });
    var skipped = students.filter(function (s) { return metGoal(s) === true && !s.no; });
    if (!targets.length) {
      $('gr-result').textContent = already.length
        ? '새로 보낼 학생이 없습니다. (' + already.length + '명은 오늘 이미 받았습니다)'
        : '보낼 학생이 없습니다. (목표 달성 + 출석번호 있는 학생만 보냅니다)';
      return;
    }
    if (!confirm(targets.length + '명에게 그라운드 ' + g.points + '점씩 보낼까요?\n'
      + targets.map(function (s) { return s.nick + '(' + s.no + '번)'; }).join(', '))) return;

    var btn = $('btn-send-grownd');
    btn.disabled = true;
    $('gr-result').textContent = '보내는 중…';

    var okCnt = 0, failList = [];
    var chain = Promise.resolve();
    targets.forEach(function (s) {
      chain = chain.then(function () {
        return fetch('/api/grownd', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: cfg.apiKey, classId: cfg.classId,
            studentCode: s.no, points: g.points,
            description: '타자 연습 목표 달성' + (g.text ? ' — ' + g.text : '')
          })
        }).then(function (r) {
          if (r.ok) {
            okCnt++;
            // 오늘 받았다고 서버에 표시해 두면 다시 눌러도 두 번 안 간다
            s.grSent = todayKey();
            return db.collection('classes').doc(curClass.code)
              .collection('students').doc(s.nick)
              .update({ grSent: todayKey() })
              .catch(function () { });
          }
          failList.push(s.nick + '(' + r.status + ')');
        }).catch(function () { failList.push(s.nick); });
      });
    });
    chain.then(function () {
      btn.disabled = false;
      renderStudents();
      var msg = okCnt + '명에게 보냈습니다.';
      if (already.length) msg += ' (오늘 이미 받은 ' + already.length + '명 제외)';
      if (failList.length) msg += ' 실패: ' + failList.join(', ');
      if (skipped.length) msg += ' (출석번호 없어 건너뜀: '
        + skipped.map(function (s) { return s.nick; }).join(', ') + ')';
      $('gr-result').textContent = msg;
      toast('그라운드 전송 완료');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
