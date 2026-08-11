/* =========================================================
   app.js — 화면 전환, 연습 엔진, 기록
   ========================================================= */
var APP = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'hangul_typing_v1';

  var MODE_NAME = {
    place: '자리 연습', word: '낱말 연습', short: '짧은 글',
    long: '긴 글', game: '타자 게임'
  };

  /* =========================================================
     기록
     ========================================================= */
  var rec = load();

  function blank() {
    return { best: {}, games: {}, paste: '', name: '', days: {}, goals: null };
  }

  function load() {
    var r;
    try {
      var raw = localStorage.getItem(STORE_KEY);
      r = raw ? JSON.parse(raw) : blank();
    } catch (e) { r = blank(); }
    // 예전 버전 기록에 없던 칸 채우기
    var b = blank();
    for (var k in b) if (r[k] === undefined) r[k] = b[k];
    return r;
  }

  /* ---------- 날짜별 학습 기록 ---------- */
  function todayKey(d) {
    d = d || new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function dayLog(key) {
    key = key || todayKey();
    if (!rec.days[key]) rec.days[key] = { practice: [], games: [], miss: {} };
    var d = rec.days[key];
    if (!d.practice) d.practice = [];
    if (!d.games) d.games = [];
    if (!d.miss) d.miss = {};
    return d;
  }

  /** 어떤 자리(키)를 틀렸는지 누적 */
  function recordMiss(key) {
    if (!key || key === ' ') return;
    var d = dayLog();
    d.miss[key] = (d.miss[key] || 0) + 1;
  }

  function logPractice(entry) {
    dayLog().practice.push(entry);
    save();
  }

  function logGame(entry) {
    dayLog().games.push(entry);
    save();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); } catch (e) { }
  }
  function bestOf(key) { return rec.best[key] || null; }
  function putBest(key, cpm, acc) {
    var cur = rec.best[key];
    var isNew = !cur || cpm > cur.cpm;
    if (isNew) rec.best[key] = { cpm: cpm, acc: acc };
    save();
    return isNew;
  }
  function bestByMode(mode) {
    var m = 0;
    for (var k in rec.best) {
      if (k.indexOf(mode + '_') === 0 && rec.best[k].cpm > m) m = rec.best[k].cpm;
    }
    return m;
  }

  /* =========================================================
     화면 전환
     ========================================================= */
  var cur = 'home';
  function show(name) {
    var list = document.querySelectorAll('.screen');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('on');
    $('s-' + name).classList.add('on');
    cur = name;
    if (name === 'home') renderHome();
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  /* =========================================================
     홈
     ========================================================= */
  function renderHome() {
    ['place', 'word', 'short', 'long'].forEach(function (m) {
      var el = document.querySelector('[data-best="' + m + '"]');
      var b = bestByMode(m);
      el.textContent = b ? '최고 ' + b + '타' : '';
    });
    var g = 0;
    for (var k in rec.games) if (rec.games[k] > g) g = rec.games[k];
    document.querySelector('[data-best="game"]').textContent = g ? '최고 ' + g + '점' : '';

    // 오늘 얼마나 했는지 한 줄
    var brief = $('today-brief');
    if (brief) {
      var d = rec.days[todayKey()];
      if (!d || (!d.practice.length && !d.games.length)) {
        brief.textContent = '오늘은 아직 연습 기록이 없습니다.';
      } else {
        var sec = 0, keys = 0;
        d.practice.concat(d.games).forEach(function (x) {
          sec += x.sec || 0; keys += x.keys || 0;
        });
        brief.textContent = '오늘 ' + Math.round(sec / 60) + '분 · ' +
          keys.toLocaleString() + '타 연습했습니다.';
      }
    }
  }

  /* =========================================================
     단계 선택
     ========================================================= */
  var pendingMode = 'word';

  function renderLevels() {
    $('lv-modename').textContent = MODE_NAME[pendingMode];
    var grid = $('level-grid');
    grid.innerHTML = '';
    DATA.LEVELS.forEach(function (lv) {
      var pool = pendingMode === 'short'
        ? (DATA.SHORT_UPTO[lv.no] || []) : (DATA.WORD_UPTO[lv.no] || []);
      var fresh = pendingMode === 'short'
        ? (DATA.SHORT_BY_LEVEL[lv.no] || []) : (DATA.WORD_BY_LEVEL[lv.no] || []);
      var b = bestOf(pendingMode + '_' + lv.no);

      var btn = document.createElement('button');
      btn.className = 'level-card';
      btn.innerHTML =
        '<span class="no">' + lv.no + '</span>' +
        '<h4>' + lv.name + '</h4>' +
        '<div class="keys">' + lv.hint + '</div>' +
        '<div class="meta">' + lv.desc + '</div>' +
        (pendingMode === 'place'
          ? '<div class="meta">쓸 수 있는 자리 ' + lv.keyList.length + '개</div>'
          : '<div class="meta">새 ' + fresh.length + '개 · 전체 ' + pool.length + '개</div>') +
        (b ? '<div class="rec">최고 ' + b.cpm + '타 · ' + b.acc + '%</div>' : '');
      btn.onclick = function () { startPractice(pendingMode, lv.no); };
      grid.appendChild(btn);
    });
    show('level');
  }

  /* =========================================================
     긴글 선택
     ========================================================= */
  function renderLongList() {
    var grid = $('text-grid');
    grid.innerHTML = '';
    DATA.LONG_TEXTS.forEach(function (t, i) {
      var lines = t.body.split('\n').filter(function (l) { return l.trim(); });
      var chars = t.body.replace(/\s/g, '').length;
      var b = bestOf('long_' + t.title);
      var btn = document.createElement('button');
      btn.className = 'text-card';
      btn.innerHTML =
        '<span class="badge">' + t.tag + '</span>' +
        '<div class="t">' + t.title + '</div>' +
        '<div class="a">' + t.author + '</div>' +
        '<div class="n">' + lines.length + '줄 · ' + chars + '자' +
        (b ? ' · 최고 ' + b.cpm + '타' : '') + '</div>';
      btn.onclick = function () { startLong(t.title, t.body); };
      grid.appendChild(btn);
    });
    $('paste-area').value = rec.paste || '';
    show('long');
  }

  /* =========================================================
     자리 연습 문제 만들기
     ========================================================= */
  var CHO_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
    'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  var JUNG_LIST = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ',
    'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
  var JONG_LIST = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ',
    'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ',
    'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function isVowel(j) {
    var c = j.charCodeAt(0);
    return c >= 0x314F && c <= 0x3163;
  }
  function compose(cho, jung, jong) {
    var ci = CHO_LIST.indexOf(cho), vi = JUNG_LIST.indexOf(jung),
      ti = JONG_LIST.indexOf(jong || '');
    if (ci < 0 || vi < 0 || ti < 0) return '';
    return String.fromCharCode(0xAC00 + (ci * 21 + vi) * 28 + ti);
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /** 그 단계 자판으로 만들 수 있는 자모들 */
  function jamosOf(level) {
    var cons = [], vow = [];
    level.keyList.forEach(function (k) {
      var j = HG.KEYMAP[k];
      if (isVowel(j)) vow.push(j); else cons.push(j);
    });
    return { cons: cons, vow: vow };
  }
  function newJamosOf(level) {
    var cons = [], vow = [];
    (level.newKeys.length ? level.newKeys : level.keyList).forEach(function (k) {
      var j = HG.KEYMAP[k];
      if (isVowel(j)) vow.push(j); else cons.push(j);
    });
    return { cons: cons, vow: vow };
  }

  function repeatLine(jamos, times) {
    return jamos.map(function (j) {
      var s = ''; for (var i = 0; i < times; i++) s += j; return s;
    }).join(' ');
  }
  function mixLine(jamos, groups, per) {
    var out = [];
    for (var g = 0; g < groups; g++) {
      var s = '';
      for (var i = 0; i < per; i++) s += pick(jamos);
      out.push(s);
    }
    return out.join(' ');
  }
  function syllableLine(consPool, vowPool, jongPool, count) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var jong = jongPool && jongPool.length && Math.random() < 0.55 ? pick(jongPool) : '';
      var s = compose(pick(consPool), pick(vowPool), jong);
      if (!s) { i--; continue; }
      out.push(s);
    }
    return out.join(' ');
  }

  /** 그 단계 자판으로 칠 수 있는 종성 목록 */
  function jongOf(level) {
    var out = [];
    for (var i = 1; i < JONG_LIST.length; i++) {
      if (HG.isTypableWith(compose('ㅇ', 'ㅏ', JONG_LIST[i]), level.keys)) out.push(JONG_LIST[i]);
    }
    return out;
  }

  function makePlaceDrills(level) {
    var all = jamosOf(level);
    var lines = [];

    // 7단계는 새로 배우는 자리가 없다 → 겹모음·겹받침 위주로 따로 구성
    if (!level.newKeys.length) {
      var hardVow = ['ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ'];
      var hardJong = 'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'.split('');
      lines.push(repeatLine(hardVow.slice(0, 4), 3));
      lines.push(repeatLine(hardVow.slice(4), 3));
      lines.push(syllableLine(all.cons, hardVow, null, 7));
      lines.push(syllableLine(all.cons, hardVow, null, 7));
      lines.push(syllableLine(all.cons, all.vow, hardJong, 6));
      lines.push(syllableLine(all.cons, all.vow, hardJong, 6));
      lines.push(mixLine(all.cons, 5, 4));
      lines.push(syllableLine(all.cons, all.vow, jongOf(level), 6));
      lines.push(syllableLine(all.cons, hardVow, hardJong, 5));
      return lines;
    }

    var fresh = newJamosOf(level);

    // 1) 새로 배우는 자리를 하나씩 반복
    if (fresh.cons.length) lines.push(repeatLine(fresh.cons, 4));
    if (fresh.vow.length) lines.push(repeatLine(fresh.vow, 4));

    // 2) 새 자리끼리 섞기
    if (fresh.cons.length >= 2) lines.push(mixLine(fresh.cons, 5, 4));
    if (fresh.vow.length >= 2) lines.push(mixLine(fresh.vow, 5, 3));

    // 3) 지금까지 배운 자리 전부 섞기
    if (all.cons.length >= 2) lines.push(mixLine(all.cons, 5, 4));
    if (all.vow.length >= 2) lines.push(mixLine(all.vow, 5, 3));

    // 4) 글자 만들기 — 받침 없이
    var consPool = fresh.cons.length ? fresh.cons : all.cons;
    var vowPool = all.vow.length ? all.vow : ['ㅏ'];
    if (all.cons.length && all.vow.length) {
      lines.push(syllableLine(consPool, vowPool, null, 7));
      lines.push(syllableLine(all.cons, all.vow, null, 7));
    }

    // 5) 받침 붙이기
    var jongs = jongOf(level).filter(function (j) { return j.length === 1; });
    if (all.cons.length && all.vow.length && jongs.length) {
      lines.push(syllableLine(all.cons, all.vow, jongs, 6));
      lines.push(syllableLine(consPool, vowPool, jongs, 6));
    }

    return lines;
  }

  /* =========================================================
     연습 세션
     ========================================================= */
  var S = null;   // 현재 세션

  function startPractice(mode, levelNo) {
    var level = DATA.getLevel(levelNo);
    var items;
    if (mode === 'place') items = makePlaceDrills(level);
    else if (mode === 'word') {
      // 낱말은 한 줄에 5개씩 묶는다. 낱말 사이 스페이스가 한글 조합을 끊어 주므로
      // 입력창을 중간에 비울 필요가 없다.
      var ws = DATA.pickWords(levelNo, 30);
      items = [];
      for (var i = 0; i < ws.length; i += 5) items.push(ws.slice(i, i + 5).join(' '));
    } else {
      var pool = DATA.SHORT_UPTO[levelNo] || [];
      if (!pool.length) pool = DATA.SHORT_TEXTS.slice(0, 5);
      items = DATA.shuffle(pool.slice()).slice(0, Math.min(8, pool.length));
    }
    beginSession({
      mode: mode, level: level, levelNo: levelNo,
      items: items, recKey: mode + '_' + levelNo,
      title: MODE_NAME[mode], allowed: level.keys
    });
  }

  function startLong(title, body) {
    var items = body.split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length; });
    if (!items.length) { toast('연습할 글이 없습니다'); return; }
    beginSession({
      mode: 'long', level: null, levelNo: 0,
      items: items, recKey: 'long_' + title,
      title: title, allowed: null
    });
  }

  function beginSession(cfg) {
    S = {
      mode: cfg.mode, level: cfg.level, levelNo: cfg.levelNo,
      items: cfg.items, recKey: cfg.recKey, title: cfg.title,
      idx: 0,
      startAt: 0, endAt: 0,
      doneKeys: 0,      // 완료한 문제의 총 타건 수
      errors: 0,
      miss: {},         // 이번 연습에서 틀린 자리
      wasBad: false,
      locked: false,
      timer: null
    };

    $('play-lv').textContent = cfg.level ? cfg.level.no + '단계 ' + cfg.level.name : '자유';
    $('play-mode').textContent = MODE_NAME[cfg.mode] + (cfg.mode === 'long' ? ' · ' + cfg.title : '');

    var t = $('target');
    t.className = 'target' + (cfg.mode === 'long' ? ' xsmall' : ' small');

    KB.render($('kb'), $('finger-hint'), cfg.allowed);

    $('typein').value = '';
    $('typebox').classList.remove('bad');
    $('hintline').textContent = cfg.mode === 'place'
      ? '한/영 키로 한글 자판으로 바꾸고, 아래 손가락 안내를 보며 치세요 · 한 줄을 다 치면 엔터'
      : '틀리면 지우고 다시 치면 됩니다 · 한 줄을 다 치면 엔터';

    show('play');
    renderItem();
    focusInput();

    S.timer = setInterval(updateStats, 250);
  }

  function focusInput() {
    var el = $('typein');
    el.focus();
    setTimeout(function () { el.focus(); }, 30);
  }

  function curItem() { return S.items[S.idx]; }

  function renderItem() {
    var item = curItem();
    if (item === undefined) return;

    // 다음 줄 미리보기
    var up = $('upnext');
    var n1 = S.items[S.idx + 1];
    up.innerHTML = n1
      ? '다음 줄 &nbsp;<b>' + esc(n1.slice(0, 44)) + (n1.length > 44 ? '…' : '') + '</b>'
      : '마지막 줄!';

    paintTarget('');
    KB.highlight(HG.nextKey(item, ''));
    updateStats();
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 목표 글자를 한 글자씩 색칠 */
  function paintTarget(typed) {
    var item = curItem();
    var j = HG.judge(item, typed);
    var html = '';
    for (var i = 0; i < item.length; i++) {
      var ch = item[i];
      var cls = 'ch ';
      if (!j.ok && i === j.badFrom) cls += 'err';
      else if (i < j.charDone) cls += 'done';
      else if (i === j.charDone) cls += 'cur';
      else cls += 'wait';
      if (ch === ' ') html += '<span class="' + cls + ' sp">&nbsp;</span>';
      else html += '<span class="' + cls + '">' + esc(ch) + '</span>';
    }
    $('target').innerHTML = html;
    return j;
  }

  // 한글 IME 조합 중인지
  var composing = false;

  function onInput() {
    if (!S) return;
    var el = $('typein');
    if (S.locked) { el.value = ''; return; }

    var v = el.value;
    if (!S.startAt && v.length) S.startAt = Date.now();

    var j = paintTarget(v);

    // 오타 집계 — 틀린 상태로 "새로 진입"할 때만 1회
    if (!j.ok && !S.wasBad) {
      S.errors++;
      S.wasBad = true;
      // 이때 쳤어야 할 키가 곧 "틀린 자리"다
      var want = HG.textToKeys(curItem())[j.matched];
      if (want) { recordMiss(want); S.miss[want] = (S.miss[want] || 0) + 1; }
    }
    if (j.ok) S.wasBad = false;

    $('typebox').classList.toggle('bad', !j.ok);
    KB.highlight(j.ok ? HG.nextKey(curItem(), v) : null);
    S.curMatched = j.matched;

    // 한/영 키가 영문 상태면 아무리 쳐도 안 맞는다. 바로 알려 준다.
    var hint = $('hintline');
    if (j.engMode) {
      hint.innerHTML = '<b class="warnhint">한/영 키를 눌러 한글 자판으로 바꿔 주세요</b>';
      $('typebox').classList.add('eng');
    } else {
      $('typebox').classList.remove('eng');
      if (hint.querySelector('.warnhint')) {
        hint.textContent = '틀리면 지우고 다시 치면 됩니다 · 한 줄을 다 치면 엔터';
      }
    }

    if (j.complete) {
      // 조합이 아직 안 끝났으면 엔터(또는 조합 종료)를 기다린다
      if (composing) {
        $('hintline').textContent = '엔터를 누르면 다음 줄로 갑니다';
        updateStats();
      } else {
        advance(j.totalKeys);
      }
    } else {
      updateStats();
    }
  }

  /* 줄을 다 쳤을 때만 다음으로. 이 시점엔 조합이 끝나 있으므로
     입력창을 비워도 한글 IME 상태가 깨지지 않는다. */
  function advance(keys) {
    S.locked = true;
    S.doneKeys += keys;
    S.curMatched = 0;
    S.idx++;

    var el = $('typein');
    el.value = '';
    setTimeout(function () {
      if (!S) return;
      el.value = '';
      S.locked = false;
      if (S.idx >= S.items.length) { finish(); return; }
      el.focus();
      $('hintline').textContent = '틀리면 지우고 다시 치면 됩니다 · 한 줄을 다 치면 엔터';
      renderItem();
    }, 0);
  }

  function updateStats() {
    if (!S) return;
    var elapsed = S.startAt ? Date.now() - S.startAt : 0;
    var keys = S.doneKeys + (S.curMatched || 0);
    var cpm = elapsed > 800 ? HG.calcCPM(keys, elapsed) : 0;
    var acc = keys + S.errors > 0
      ? Math.round(keys / (keys + S.errors) * 100) : 100;

    $('st-cpm').textContent = cpm;
    $('st-acc').textContent = acc + '%';
    $('st-prog').textContent = Math.min(S.idx + 1, S.items.length) + ' / ' + S.items.length;
    $('prog-bar').style.width = (S.idx / S.items.length * 100) + '%';
    S.cpm = cpm; S.acc = acc;
  }

  function finish() {
    clearInterval(S.timer);
    var elapsed = S.startAt ? Date.now() - S.startAt : 1;
    var cpm = HG.calcCPM(S.doneKeys, elapsed);
    var acc = S.doneKeys + S.errors > 0
      ? Math.round(S.doneKeys / (S.doneKeys + S.errors) * 100) : 100;

    var isNew = putBest(S.recKey, cpm, acc);
    var best = bestOf(S.recKey);

    logPractice({
      mode: S.mode, level: S.levelNo, title: S.title,
      cpm: cpm, acc: acc, keys: S.doneKeys, err: S.errors,
      lines: S.items.length, sec: Math.round(elapsed / 1000),
      at: Date.now()
    });

    $('res-cpm').textContent = cpm;
    $('res-acc').textContent = acc + '%';
    $('res-err').textContent = '오타 ' + S.errors + '번';
    $('res-time').textContent = Math.round(elapsed / 1000) + '초';
    $('res-count').textContent = S.items.length + '줄 · ' + S.doneKeys + '타';
    $('res-best').textContent = best ? best.cpm : cpm;
    $('res-newrec').style.display = isNew ? 'flex' : 'none';

    $('res-title').textContent =
      acc >= 98 ? '정확해요! 아주 좋아요' :
        acc >= 92 ? '잘했어요!' :
          acc >= 80 ? '조금만 더 천천히 정확하게' : '천천히 다시 해 볼까요';

    var nextBtn = $('res-next');
    var canNext = (S.mode === 'place' || S.mode === 'word' || S.mode === 'short') && S.levelNo < 7;
    nextBtn.style.display = canNext ? '' : 'none';
    nextBtn.textContent = canNext ? (S.levelNo + 1) + '단계로' : '';

    var last = { mode: S.mode, levelNo: S.levelNo, title: S.title, items: S.items };
    $('res-again').onclick = function () {
      if (last.mode === 'long') startLong(last.title, last.items.join('\n'));
      else startPractice(last.mode, last.levelNo);
    };
    nextBtn.onclick = function () { startPractice(last.mode, last.levelNo + 1); };

    S = null;
    show('result');
  }

  function quitSession() {
    if (S) { clearInterval(S.timer); S = null; }
    show('home');
  }

  /* =========================================================
     이벤트 연결
     ========================================================= */
  function init() {
    // 홈 모드 카드
    document.querySelectorAll('.mode-card').forEach(function (btn) {
      btn.onclick = function () {
        var m = btn.dataset.mode;
        if (m === 'long') { renderLongList(); return; }
        if (m === 'game') { GAMES.openSelect(); return; }
        pendingMode = m;
        renderLevels();
      };
    });

    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () { show(b.dataset.go); };
    });

    $('btn-play-exit').onclick = quitSession;
    var ti = $('typein');
    ti.addEventListener('input', onInput);
    ti.addEventListener('compositionstart', function () { composing = true; });
    ti.addEventListener('compositionend', function () {
      composing = false;
      setTimeout(onInput, 0);     // 조합이 끝났으니 완료됐는지 다시 본다
    });
    ti.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { quitSession(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        // 조합 중이면 IME가 먼저 글자를 확정한다 → compositionend 에서 처리
        if (!e.isComposing) { composing = false; onInput(); }
      }
    });
    // 연습 화면 아무 데나 누르면 입력창으로
    $('s-play').addEventListener('mousedown', function (e) {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        setTimeout(function () { $('typein').focus(); }, 0);
      }
    });

    $('btn-paste-go').onclick = function () {
      var v = $('paste-area').value.trim();
      if (!v) { toast('먼저 글을 붙여넣어 주세요'); return; }
      rec.paste = v; save();
      startLong('직접 넣은 글', v);
    };

    $('btn-reset-rec').onclick = function () {
      if (!confirm('저장된 기록을 모두 지울까요?')) return;
      replaceRec(null);
      renderHome(); toast('기록을 지웠습니다');
    };

    renderHome();
  }

  /** rec 을 통째로 갈아끼운다. 다른 모듈이 잡고 있는 참조가 끊기지 않도록
      새 객체를 만들지 않고 같은 객체의 내용만 바꾼다. */
  function replaceRec(next) {
    var b = blank();
    for (var k in rec) delete rec[k];
    for (var k2 in b) rec[k2] = (next && next[k2] !== undefined) ? next[k2] : b[k2];
    save();
  }

  return {
    init: init, show: show, toast: toast,
    rec: rec, save: save, replaceRec: replaceRec,
    startPractice: startPractice, startLong: startLong,
    MODE_NAME: MODE_NAME,
    isVowel: isVowel, compose: compose,
    todayKey: todayKey, dayLog: dayLog,
    logPractice: logPractice, logGame: logGame, recordMiss: recordMiss,
    bestOf: bestOf, renderHome: renderHome
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  APP.init();
  GAMES.init();
});
