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
  var selDate = null;        // 학생 현황에서 보는 날짜 (기본 오늘)

  /* 서버에 남아 있는 말도 안 되는 타수는 화면에서 빼고 본다.
     한 글자짜리 지문("1")을 붙여넣으면 60000타가 기록되던 버그가 있었고,
     그 기록이 학생 기기에서 올라가 있다. 하나만 섞여도 반 그래프가
     통째로 납작해진다. 백업 파일은 원본 그대로 받는다. (2026-09-01) */
  var MAX_CPM = 1000;
  function scrubStudent(d) {
    var days = d.days || {};
    for (var k in days) {
      var day = days[k] || {};
      if ((day.cpm | 0) > MAX_CPM) day.cpm = 0;
      var bl = day.byLevel || {};
      for (var lv in bl) if ((bl[lv].cpm | 0) > MAX_CPM) bl[lv].cpm = 0;
    }
    return d;
  }

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
      if (!user) { stopClassWatch(); curClass = null; show(true); return; }
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

    /* 학생 — 날짜를 고르면 그 날 기록으로 표·목표 판정이 바뀐다 */
    selDate = todayKey();
    $('stu-date').value = todayKey();
    $('stu-date').max = todayKey();
    $('stu-date').onchange = function () {
      selDate = this.value || todayKey();
      renderStudents();
    };
    $('btn-today').onclick = function () {
      selDate = todayKey();
      $('stu-date').value = selDate;
      renderStudents();
    };
    $('btn-refresh').onclick = loadStudents;

    /* 반 백업 */
    $('btn-backup').onclick = backupClass;
    $('backup-now').onclick = backupClass;
    $('backup-later').onclick = function () { $('backup-modal').hidden = true; };
    $('td-close').onclick = function () { $('stu-modal').hidden = true; };
    $('stu-modal').onclick = function (e) {
      if (e.target === this) this.hidden = true;
    };

    /* 목표 */
    $('btn-save-goal').onclick = saveGoal;

    /* 게임 설정 */
    $('btn-save-game').onclick = saveGameCfg;
    document.querySelectorAll('#game-days .chip').forEach(function (b) {
      b.onclick = function () { b.classList.toggle('sel'); };
    });

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
          classes.push({ code: doc.id, name: d.name || doc.id, goal: d.goal || null, game: d.game || null });
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
    stopClassWatch();
    students = [];
    curClass = null;
    classes.forEach(function (c) { if (c.code === code) curClass = c; });
    if (!curClass) return;
    $('class-select').value = code;
    $('class-code').textContent = code;
    fillGoalForm(curClass.goal);
    fillGameForm(curClass.game);
    loadGrowndCfg();
    loadStudents();
    checkBackupDue();
  }

  /* =========================================================
     반 백업 — 일주일에 한 번 모달로 챙긴다
     Firestore 무료 플랜은 자동 백업이 없다. 학생 문서가 지워지면
     되살릴 길이 없어서(2026-08-28 실제 사고), 반 전체를 JSON 으로
     교사 컴퓨터에 내려받아 둔다. 핀은 아무도 못 읽는 문서라 백업에
     안 들어간다 — 복구할 일이 생기면 핀은 초기화하면 된다.
     ========================================================= */
  var BK_KEY = 'hangul_typing_backup_';   // + 학급코드 = 마지막 백업 시각

  function backupClass() {
    if (!curClass) return;
    db.collection('classes').doc(curClass.code).collection('students').get()
      .then(function (snap) {
        var stus = {};
        snap.forEach(function (doc) { stus[doc.id] = doc.data(); });
        var out = {
          savedAt: new Date().toISOString(),
          classCode: curClass.code, className: curClass.name || '',
          goal: curClass.goal || null, game: curClass.game || null,
          students: stus
        };
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
        a.download = '타자연습_백업_' + curClass.code + '_' + todayKey() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        try { localStorage.setItem(BK_KEY + curClass.code, String(Date.now())); } catch (e) { }
        $('backup-modal').hidden = true;
        toast('반 전체 기록을 내려받았습니다 (' + Object.keys(stus).length + '명)');
      })
      .catch(function (e) { toast('백업하지 못했습니다: ' + e.message); });
  }

  /** 반을 열 때 — 백업한 지 이레가 넘었으면 모달을 띄운다 */
  function checkBackupDue() {
    if (!curClass) return;
    var last = 0;
    try { last = parseInt(localStorage.getItem(BK_KEY + curClass.code), 10) || 0; } catch (e) { }
    var days = (Date.now() - last) / 86400000;
    if (last && days < 7) return;
    $('backup-note').textContent =
      (last ? Math.floor(days) + '일 동안 백업이 없었어요.' : '이 컴퓨터에서 아직 한 번도 백업하지 않았어요.')
      + ' 학생 기록은 서버에만 있어서, 실수로 지우면 되살릴 수 없어요.'
      + ' 지금 백업하면 반 전체 기록이 JSON 파일 하나로 컴퓨터에 저장됩니다.';
    $('backup-modal').hidden = false;
  }

  /* =========================================================
     학생 현황
     ========================================================= */
  function loadStudents() { watchStudents(); }

  function metGoalOn(stu, date) {
    return typingGoalMet((stu.days || {})[date], curClass && curClass.goal);
  }

  function metGoal(stu) { return metGoalOn(stu, selDate); }

  /** 목표를 못 이룬 이유를 사람 말로 — 마우스를 올리면 보인다 */
  function goalMissReason(stu) {
    var g = curClass && curClass.goal;
    if (!g) return '';
    var d = (stu.days || {})[selDate];
    if (!d) {
      return selDate === todayKey()
        ? '오늘 연습 기록이 아직 없습니다'
        : '이 날 연습 기록이 없습니다';
    }
    var r = [];
    var min = Math.round((d.sec || 0) / 60);
    if (min < (g.min || 0)) r.push('연습 시간 ' + min + '분 (목표 ' + g.min + '분)');
    if ((d.acc || 0) < (g.acc || 0)) r.push('정확도 ' + (d.acc || 0) + '% (목표 ' + g.acc + '%)');
    if ((d.cpm || 0) < (g.cpm || 0)) r.push('최고 타수 ' + (d.cpm || 0) + '타 (목표 ' + g.cpm + '타)');
    return r.join(' · ');
  }

  /** 그 날짜 몫의 그라운드 점수를 이미 보냈는가.
      날짜별 기록(grSentDays)이 기본이고, 옛 필드(grSent — 마지막으로 보낸
      날짜 하나만 기억)도 같이 봐서 예전에 보낸 표시가 사라지지 않게 한다. */
  function sentOn(s, date) {
    return !!((s.grSentDays && s.grSentDays[date]) || s.grSent === date);
  }

  function renderStudents() {
    var tbody = $('stu-rows');
    tbody.innerHTML = '';
    $('stu-empty').style.display = students.length ? 'none' : 'block';
    $('stu-count').textContent = students.length
      ? '학생 ' + students.length + '명 · ' + selDate
        + (selDate === todayKey() ? ' (오늘)' : ' 기록')
      : '';

    students.forEach(function (s) {
      var d = (s.days || {})[selDate] || {};
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
      tr.appendChild(td(villageCell(s), 'num'));
      var sent = sentOn(s, selDate);
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

      // 줄을 누르면 그 학생의 쌓인 기록을 자세히 보여 준다
      tr.classList.add('clickable');
      tr.onclick = function (e) {
        if (e.target.tagName === 'BUTTON') return;
        openDetail(s);
      };

      tbody.appendChild(tr);
    });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* =========================================================
     내 마을 — 학생이 이번 시즌에 얼마나 모았는지
     마을은 3개월마다 새로 시작한다. 시즌 포인트만 리셋되고
     평생 누적 포인트·레벨은 그대로 남는다.
     ========================================================= */
  /** 그 학생의 이번 시즌 포인트.
      아직 새 버전으로 접속하지 않은 학생은 서버에 season 이 없다.
      그때는 평생 누적을 쓴다 — 접속하는 순간 그 값을 시즌 시작값으로
      물려받게 돼 있어서(village.js), 교사가 미리 봐도 같은 값이 나온다. */
  function seasonPoints(s) {
    return (s.season && s.season.sp) || s.points || 0;
  }

  function villageCell(s) {
    if (!window.VILLAGE) return '-';
    var sp = seasonPoints(s);
    if (!sp) return '<span class="dim">-</span>';
    var v = VILLAGE.summary(sp);
    return '<span title="' + esc(v.chapter + '장 ' + v.chapterName + ' · 시즌 ' + sp + 'P') + '">'
      + v.chapter + '장 ' + v.got + '/' + v.total + '</span>';
  }

  /** 학생 상세 안의 마을 칸 */
  function villageDetail(s) {
    if (!window.VILLAGE) return '';
    var se = s.season || null;
    var sp = seasonPoints(s);
    var v = VILLAGE.summary(sp);

    var h = '<h4 class="td-h">내 마을 · ' + esc((se && se.label) || VILLAGE.seasonOf().label)
      + ' <span class="dim">(3개월마다 마을만 새로 시작합니다. 누적 포인트·레벨은 남습니다)</span></h4>';
    h += '<div class="td-cards">' +
      tdCard('시즌 포인트', sp + 'P', '평생 ' + (s.points || 0) + 'P') +
      tdCard('모은 것', v.got + ' / ' + v.total + '개', v.chapter + '장 ' + v.chapterName) +
      tdCard('다음 목표', v.done ? '모두 완성' : v.nextName, v.done ? '🏆' : v.nextIn + 'P 남음') +
      tdCard('시즌 끝까지', VILLAGE.daysLeft() + '일', '') +
      '</div>';

    h += '<div class="vg-rep-chs">';
    VILLAGE.CHAPTERS.forEach(function (ch) {
      var got = ch.items.filter(function (m) { return sp >= m.p; }).length;
      var open = sp >= ch.from;
      h += '<div class="vg-rep-ch' + (got === ch.items.length ? ' done' : open ? '' : ' lock') + '">' +
        '<span class="i">' + (open ? ch.icon : '🔒') + '</span>' +
        '<span class="n">' + ch.no + '장 ' + esc(ch.name) + '</span>' +
        '<span class="bar"><i style="width:' + Math.round(got / ch.items.length * 100) + '%"></i></span>' +
        '<span class="c">' + got + '/' + ch.items.length + '</span>' +
        (got === ch.items.length ? '<span class="m">🏅</span>' : '') +
        '</div>';
    });
    h += '</div>';

    // 지난 시즌
    var pk = s.past ? Object.keys(s.past).sort().reverse() : [];
    if (pk.length) {
      h += '<p class="t-note">지난 시즌 — ' + pk.map(function (k) {
        var o = s.past[k], pv = VILLAGE.summary(o.sp || 0);
        return esc(o.label || k) + ' ' + (o.sp || 0) + 'P (' + pv.got + '/' + pv.total + '개)';
      }).join('   ·   ') + '</p>';
    }
    return h;
  }

  /* 핀은 아무도 못 읽는 하위 문서(auth/pin)에 있다.
     초기화는 해시를 빈 값으로 두는 것 — 그러면 다음에 넣은 핀이 새 핀이 된다.
     아직 예전 구조에 머무는 학생은 본문에도 핀이 남아 있어 둘 다 비운다. */
  function resetPin(nick) {
    if (!confirm(nick + ' 학생의 핀 번호를 초기화할까요?\n다음 로그인 때 새 핀을 정하게 됩니다.')) return;
    var ref = db.collection('classes').doc(curClass.code).collection('students').doc(nick);
    ref.collection('auth').doc('pin').set({ pinHash: '', ownerUid: null }, { merge: true })
      .then(function () {
        return ref.update({ pinHash: '' }).catch(function () { /* 새 구조면 본문에 없다 */ });
      })
      .then(function () { toast('핀을 초기화했습니다'); loadStudents(); })
      .catch(function (e) { toast('실패: ' + e.message); });
  }

  function removeStudent(nick) {
    if (!confirm(nick + ' 학생을 반에서 삭제할까요?\n서버의 기록이 지워집니다. (학생 컴퓨터의 기록은 남습니다)')) return;
    // 핀 하위 문서는 따로 지워야 한다 — Firestore 는 하위 문서를 함께 지우지 않는다
    db.collection('classes').doc(curClass.code).collection('students').doc(nick)
      .collection('auth').doc('pin').delete().catch(function () { });
    db.collection('classes').doc(curClass.code).collection('students').doc(nick)
      .delete()
      .then(function () { toast('삭제했습니다'); loadStudents(); })
      .catch(function (e) { toast('실패: ' + e.message); });
  }

  /* =========================================================
     학생 상세 — 서버에 쌓인 날짜별 기록을 리포트처럼 보여 준다
     ========================================================= */
  var MODE_LABEL = {
    place: '자리 연습', word: '낱말 연습', short: '짧은 글',
    long: '긴 글', game: '타자 게임'
  };

  function fmtMin(sec) {
    if (sec < 60) return sec + '초';
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + '분' + (s ? ' ' + s + '초' : '');
  }

  function tdCard(k, v, sub) {
    return '<div class="td-card"><div class="k">' + k + '</div>' +
      '<div class="v">' + v + '</div><div class="s">' + (sub || '') + '</div></div>';
  }

  function openDetail(s) {
    var days = s.days || {};
    var dates = Object.keys(days).sort();
    $('td-title').textContent = s.nick + (s.no ? ' · ' + s.no + '번' : '')
      + ' · ' + (s.points || 0) + 'P · Lv.' + (s.level || 1);

    var h = villageDetail(s);
    if (!dates.length) {
      h += '<p class="t-empty" style="display:block">아직 서버에 쌓인 연습 기록이 없습니다.</p>';
    } else {
      var totSec = 0, totKeys = 0, best = 0;
      dates.forEach(function (k) {
        var d = days[k];
        totSec += d.sec || 0; totKeys += d.keys || 0;
        if ((d.cpm || 0) > best) best = d.cpm;
      });

      h += '<div class="td-cards">' +
        tdCard('연습한 날', dates.length + '일', dates[0].slice(5).replace('-', '/') + ' 부터') +
        tdCard('총 연습 시간', fmtMin(totSec), '') +
        tdCard('모두 친 글자', totKeys.toLocaleString() + '타', '') +
        tdCard('가장 빠른 타수', best + '타', '분당') +
        '</div>';

      /* 날짜별 최고 타수 그래프 (최근 21일) */
      var show = dates.slice(-21);
      var maxC = 1;
      show.forEach(function (k) { if ((days[k].cpm || 0) > maxC) maxC = days[k].cpm; });
      h += '<h4 class="td-h">날짜별 가장 빠른 타수</h4>';
      h += '<div class="bars' + (show.length > 12 ? ' many' : '') + '">';
      show.forEach(function (k) {
        var c = days[k].cpm || 0;
        var pct = Math.round(c / maxC * 100);
        h += '<div class="bar' + (k === todayKey() ? ' now' : '') + '">' +
          '<div class="bv">' + c + '</div>' +
          '<div class="bcol"><i style="height:' + Math.max(pct, 4) + '%"></i></div>' +
          '<div class="bd">' + k.slice(5).replace('-', '/') + '</div></div>';
      });
      h += '</div>';

      /* 최근 날짜별 표 */
      h += '<h4 class="td-h">최근 기록</h4>';
      h += '<table class="t-table"><thead><tr><th>날짜</th><th>연습</th>' +
        '<th>최고 타수</th><th>정확도</th><th>오타</th></tr></thead><tbody>';
      dates.slice(-10).reverse().forEach(function (k) {
        var d = days[k];
        h += '<tr><td>' + k + '</td>' +
          '<td>' + Math.round((d.sec || 0) / 60) + '분 · ' + (d.keys || 0).toLocaleString() + '타</td>' +
          '<td>' + (d.cpm || 0) + '타</td><td>' + (d.acc || 0) + '%</td>' +
          '<td>' + (d.err || 0) + '번</td></tr>';
      });
      h += '</tbody></table>';

      /* 상세(무엇을 했나·단계별·틀린 자리) — 상세가 올라온 가장 최근 날 */
      var dk = null;
      for (var i = dates.length - 1; i >= 0; i--) {
        if (days[dates[i]].modes) { dk = dates[i]; break; }
      }
      if (dk) {
        var d2 = days[dk];
        h += '<h4 class="td-h">' + dk + ' 자세히</h4>';
        h += '<div class="td-detail">';

        var mh = '';
        for (var m in d2.modes) {
          mh += '<li><b>' + (MODE_LABEL[m] || m) + '</b><span>' + d2.modes[m] + '번</span></li>';
        }
        h += '<div class="td-box"><h5>한 것</h5>' +
          (mh ? '<ul class="td-did">' + mh + '</ul>' : '<p class="dim">기록 없음</p>') + '</div>';

        var lh = '';
        var lvs = Object.keys(d2.byLevel || {}).sort(function (a, b) { return a - b; });
        lvs.forEach(function (lv) {
          var b = d2.byLevel[lv];
          lh += '<li><b>' + lv + '단계</b><span>' + b.n + '번 · ' + b.cpm + '타 · ' + b.acc + '%</span></li>';
        });
        h += '<div class="td-box"><h5>단계별</h5>' +
          (lh ? '<ul class="td-did">' + lh + '</ul>' : '<p class="dim">기록 없음</p>') + '</div>';

        var xh = '';
        (d2.miss || []).forEach(function (t) {
          xh += '<li><b>' + esc(t.jamo) + '</b><span>' + esc(t.finger) + ' · ' + t.count + '번</span></li>';
        });
        h += '<div class="td-box"><h5>자주 틀린 자리</h5>' +
          (xh ? '<ul class="td-did">' + xh + '</ul>' : '<p class="dim">눈에 띄는 것 없음</p>') + '</div>';

        h += '</div>';
      } else {
        h += '<p class="t-note">무엇을 연습했는지·자주 틀린 자리 같은 상세는 학생이 새 버전으로 연습한 날부터 보입니다.</p>';
      }
    }

    $('td-body').innerHTML = h;
    $('stu-modal').hidden = false;
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
    $('goal-saved').textContent = g
      ? '목표가 저장돼 있습니다. 바꿀 때까지 매일 적용됩니다.'
      : '아직 목표가 없습니다.';
  }

  function saveGoal() {
    if (!curClass) return;
    var goal = {
      text: $('goal-text').value.trim(),
      min: Math.max(0, $('goal-min').value | 0),
      acc: Math.max(0, Math.min(100, $('goal-acc').value | 0)),
      cpm: Math.max(0, $('goal-cpm').value | 0),
      points: Math.max(1, Math.min(100, $('goal-points').value | 0))
    };
    db.collection('classes').doc(curClass.code).update({ goal: goal })
      .then(function () {
        curClass.goal = goal;
        checkToday(curClass.code);
        $('goal-saved').textContent = '저장했습니다. 바꿀 때까지 매일 적용됩니다.';
        toast('목표를 저장했습니다');
        renderStudents();
      })
      .catch(function (e) { toast('저장 실패: ' + e.message); });
  }

  /* =========================================================
     게임 설정 — 반 학생들의 게임 열림 여부·요일·시간(한국시간)
     ========================================================= */
  function fillGameForm(g) {
    $('game-on').checked = g ? g.on !== false : true;
    document.querySelectorAll('#game-days .chip').forEach(function (b) {
      var day = Number(b.dataset.day);
      b.classList.toggle('sel', !!(g && g.days && g.days.indexOf(day) >= 0));
    });
    $('game-from').value = (g && g.from) || '';
    $('game-to').value = (g && g.to) || '';
    $('game-saved').textContent = g ? '저장된 설정이 있습니다.' : '아직 설정이 없습니다 (항상 열림).';
  }

  function saveGameCfg() {
    if (!curClass) return;
    var days = [];
    document.querySelectorAll('#game-days .chip.sel').forEach(function (b) {
      days.push(Number(b.dataset.day));
    });
    var from = $('game-from').value, to = $('game-to').value;
    if ((from && !to) || (!from && to)) {
      toast('여는 시간과 닫는 시간을 둘 다 정하거나, 둘 다 비워 주세요');
      return;
    }
    if (from && to && from >= to) {
      toast('여는 시간이 닫는 시간보다 빨라야 합니다');
      return;
    }
    var game = { on: $('game-on').checked, days: days, from: from, to: to };
    db.collection('classes').doc(curClass.code).update({ game: game })
      .then(function () {
        curClass.game = game;
        $('game-saved').textContent = '저장했습니다. 학생 화면에 1분 안에 적용됩니다.';
        toast('게임 설정을 저장했습니다');
      })
      .catch(function (e) { toast('저장 실패: ' + e.message); });
  }

  /* 그라운드 설정은 담당 교사와 지급 서버만 읽는다. */
  var stopStudents, stopReceipts;
  async function rewardCall(payload) {
    var token = await auth.currentUser.getIdToken();
    var response = await fetch('/api/grownd', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(Object.assign({ action: payload.decision ? 'review' : 'manual' }, payload)) });
    var data = await response.json();
    if (!response.ok) throw new Error(data.error || '지급 서버에 연결하지 못했어요.');
    return { data: data };
  }

  async function checkToday(code) {
    try {
      var result = (await rewardCall({ code: code, action: 'catchup' })).data;
      var list = result.students || [];
      for (var i = 0; i < list.length; i += 4) {
        await Promise.all(list.slice(i, i + 4).map(nick => rewardCall({ code: code,
          action: 'catchup-one', nick: nick, date: result.date })));
      }
    } catch (e) { if (curClass && curClass.code === code) toast('오늘 지급 확인: ' + e.message); }
  }

  function stopClassWatch() {
    if (stopStudents) stopStudents();
    if (stopReceipts) stopReceipts();
    stopStudents = stopReceipts = null;
  }

  function watchStudents() {
    var selected = curClass;
    if (!selected) return;
    if (stopStudents) stopStudents();
    stopStudents = db.collection('classes').doc(selected.code).collection('students')
      .onSnapshot(function (snap) {
        if (curClass !== selected || !me) return;
        students = snap.docs.map(function (doc) {
          var student = scrubStudent(doc.data());
          student.nick = doc.id;
          return student;
        }).sort(function (a, b) {
          return (a.no || 999) - (b.no || 999) || a.nick.localeCompare(b.nick);
        });
        renderStudents();
      }, function (e) { toast('학생 현황을 읽지 못했습니다. ' + e.message); });
  }

  async function loadGrowndCfg() {
    var selected = curClass;
    var ref = db.collection('classes').doc(selected.code);
    $('gr-key').value = $('gr-class').value = $('gr-result').textContent = '';
    $('gr-mode-auto').checked = true;
    $('gr-saved').textContent = '설정을 읽는 중…';
    $('btn-save-grownd').disabled = true;
    $('gr-issues').replaceChildren();
    stopReceipts = ref.collection('growndRewards').where('status', 'in', ['sending','unknown','rejected','retry'])
      .onSnapshot(function (snap) {
        if (curClass === selected && me) renderRewardIssues(selected.code, snap.docs);
      }, function () {
        if (curClass === selected) $('gr-result').textContent = '지급 내역을 읽지 못했습니다. 새로고침해 주세요.';
      });
    try {
      var snap = await ref.collection('integrations').doc('grownd').get({ source: 'server' });
      if (curClass !== selected || !me) return;
      var cfg = snap.data() || {};
      if (!snap.exists) {
        try { cfg = JSON.parse(localStorage.getItem('grownd_' + selected.code) || '{}') || {}; } catch (e) {}
      }
      $('gr-key').value = cfg.apiKey || '';
      $('gr-class').value = cfg.classId || '';
      $(cfg.mode === 'manual' ? 'gr-mode-manual' : 'gr-mode-auto').checked = true;
      $('gr-saved').textContent = snap.exists ? (cfg.mode === 'auto' ? '자동 지급 중' : '수동 지급 중')
        : cfg.apiKey ? '이 기기의 기존 설정을 불러왔어요. 학급에 한 번 저장해 주세요.' : '아직 연결하지 않았어요.';
      $('btn-save-grownd').disabled = false;
    } catch (e) {
      if (curClass === selected) $('gr-saved').textContent = '설정을 읽지 못했습니다. 새로고침해 주세요.';
    }
  }

  async function saveGrowndCfg() {
    var selected = curClass;
    if (!selected) return;
    var cfg = { apiKey: $('gr-key').value.trim(), classId: $('gr-class').value.trim(),
      mode: $('gr-mode-auto').checked ? 'auto' : 'manual' };
    if (!cfg.apiKey || !cfg.classId) { toast('API 키와 그라운드 학급 ID를 입력해 주세요.'); return; }
    $('btn-save-grownd').disabled = true;
    try {
      await db.collection('classes').doc(selected.code).collection('integrations').doc('grownd').set(cfg);
      if (cfg.mode === 'auto') checkToday(selected.code);
      try { localStorage.removeItem('grownd_' + selected.code); } catch (e) {}
      if (curClass === selected) $('gr-saved').textContent = cfg.mode === 'auto' ? '저장했어요. 자동 지급 중입니다.' : '저장했어요. 수동 지급 중입니다.';
    } catch (e) {
      if (curClass === selected) $('gr-saved').textContent = '저장하지 못했습니다. ' + e.message;
    } finally { if (curClass === selected) $('btn-save-grownd').disabled = false; }
  }

  function renderRewardIssues(code, docs) {
    var panel = $('gr-issues');
    panel.replaceChildren();
    docs.forEach(function (doc) {
      var item = doc.data();
      var row = document.createElement('div');
      var labels = { sending: '처리 중', unknown: '그라운드 지급 내역 확인 필요',
        retry: '요청이 몰려 대기 중', rejected: '미지급 · 연동 설정과 출석번호를 확인해 주세요' };
      row.textContent = item.date + ' · ' + item.no + '번 · ' + item.points + '점 · ' + labels[item.status] + ' ';
      if (item.status === 'sending') row.append('5분 넘게 처리 중이면 거래 내역을 확인해 주세요. ');
      if (item.status === 'unknown' || item.status === 'sending') {
        ['paid', 'unpaid'].forEach(function (decision) {
          var button = document.createElement('button');
          button.className = 'btn ghost sm';
          button.textContent = decision === 'paid' ? '지급 확인' : '미지급 확인';
          button.onclick = async function () {
            if (!confirm('그라운드에서 해당 날짜와 학생의 내역을 확인했나요? ' + button.textContent + '으로 기록합니다.')) return;
            try {
              await rewardCall({ code: code, receipt: doc.id, attempt: item.attempt, decision: decision });
              toast(decision === 'paid' ? '지급 완료로 표시했습니다.' : '해당 날짜를 선택해 다시 지급할 수 있어요.');
            } catch (e) { toast(e.message); }
          };
          row.appendChild(button);
        });
      }
      panel.appendChild(row);
    });
  }

  async function sendGrowndPoints() {
    var selected = curClass, date = selDate;
    if (!selected || !selected.goal) { toast('먼저 활동 목표를 저장해 주세요.'); return; }
    var targets = students.filter(s => s.no && metGoalOn(s, date) && !sentOn(s, date));
    if (!targets.length) { $('gr-result').textContent = date + '에 추가로 지급할 학생이 없습니다.'; return; }
    if (!confirm(date + ' 목표 달성 학생 ' + targets.length + '명의 지급 내역을 확인하고 ' + selected.goal.points + '점씩 보낼까요?')) return;
    var btn = $('btn-send-grownd');
    btn.disabled = true;
    var done = 0, messages = [];
    var labels = { unknown: '지급 내역 확인 필요', sending: '처리 중', retry: '잠시 후 재시도',
      rejected: '연동 설정 확인', disabled: '연동 설정 필요', ineligible: '목표 미달', 'no-number': '출석번호 없음',
      'invalid-points': '목표 점수 확인' };
    try {
      for (var s of targets) {
        if (curClass !== selected || !me) break;
        var result = await rewardCall({ code: selected.code, nick: s.nick, date: date });
        if (result.data.status === 'sent') done++;
        else messages.push(s.no + '번 ' + (labels[result.data.status] || '확인 필요'));
      }
    } catch (e) { messages.push(e.message); }
    finally {
      btn.disabled = false;
      if (curClass === selected) $('gr-result').textContent = date + ' 지급 완료 ' + done + '명. ' + messages.join(' · ');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
