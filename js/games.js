/* =========================================================
   games.js — 타자 게임 3종
     defense : 낙하 낱말 방어전
     race    : 컴퓨터와 달리기
     mole    : 두더지 타자
   세 게임 모두 고른 단계의 자판으로만 된 낱말을 쓴다.
   ========================================================= */
var GAMES = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* 난이도
     컴퓨터를 처음 만지는 아이도 있어서 '처음'을 기본으로 둔다.
     fall 은 배수, 실제 낙하 속도는 BASE_FALL 에 곱해진다.
     ramp 는 시간이 갈수록 빨라지는 정도(0.10 이면 최대 1.10배). */
  var DIFFS = [
    { id: 'first', name: '처음', fall: 0.70, spawn: 4.6, aiCpm: 45, life: 9.5, maxUp: 1, alive: 2, ramp: 0.10, shortOnly: true },
    { id: 'easy', name: '쉬움', fall: 1.00, spawn: 3.6, aiCpm: 75, life: 7.0, maxUp: 2, alive: 3, ramp: 0.20, shortOnly: true },
    { id: 'normal', name: '보통', fall: 1.45, spawn: 2.7, aiCpm: 130, life: 5.0, maxUp: 3, alive: 4, ramp: 0.30 },
    { id: 'hard', name: '어려움', fall: 2.10, spawn: 2.0, aiCpm: 200, life: 3.5, maxUp: 4, alive: 5, ramp: 0.45 }
  ];
  var BASE_FALL = 3.2;          // %/초 — '쉬움' 기준으로 84% 내려오는 데 약 26초
  var GAME_NAME = {
    defense: '낱말 방어전', race: '컴퓨터와 달리기', mole: '두더지 타자',
    build: '한글 조립', spell: '마법사 주문', chain: '끝말잇기'
  };

  /* 아이템 — 낱말을 쳐서 없애면 효과가 걸린다 */
  var ITEMS = {
    freeze: { icon: '❄', name: '3초 멈춤', color: '#5ad4e6' },
    bomb: { icon: '💥', name: '모두 없애기', color: '#ff8fab' },
    heal: { icon: '❤', name: '방어선 회복', color: '#6ee7a0' },
    double: { icon: '★', name: '점수 2배', color: '#ffcc5c' }
  };
  var ITEM_KEYS = ['freeze', 'bomb', 'heal', 'double'];

  var sel = { level: 2, diff: 'first' };
  var G = null;        // 진행 중인 게임 상태

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function diffOf() {
    for (var i = 0; i < DIFFS.length; i++) if (DIFFS[i].id === sel.diff) return DIFFS[i];
    return DIFFS[1];
  }
  function keyLen(w) { return HG.textToKeys(w).length; }

  function wordPool() {
    var p = DATA.WORD_UPTO[sel.level] || [];
    if (!p.length) p = DATA.WORDS;
    // 쉬운 난이도에서는 짧은 낱말만 — 처음 치는 아이가 긴 낱말에 막히지 않게
    if (diffOf().shortOnly) {
      var s = p.filter(function (w) { return keyLen(w) <= 8; });
      if (s.length > 25) return s;
    }
    return p;
  }
  function randWord(avoid) {
    var p = wordPool();
    for (var t = 0; t < 30; t++) {
      var w = p[Math.floor(Math.random() * p.length)];
      if (!avoid || avoid.indexOf(w) < 0) return w;
    }
    return p[Math.floor(Math.random() * p.length)];
  }

  /** 긴 낱말은 천천히 떨어지게 — 치는 데 걸리는 시간을 맞춰 준다 */
  function speedFactor(word) {
    var n = keyLen(word);
    var f = 6 / (n + 1.2);
    return Math.max(0.5, Math.min(1.2, f));
  }

  /* =========================================================
     게임 선택 화면
     ========================================================= */
  function openSelect() {
    var lvBox = $('game-levels');
    lvBox.innerHTML = '';
    DATA.LEVELS.forEach(function (lv) {
      var b = document.createElement('button');
      b.className = 'chip' + (lv.no === sel.level ? ' sel' : '');
      b.textContent = lv.no + '단계';
      b.title = lv.hint;
      b.onclick = function () { sel.level = lv.no; openSelect(); };
      lvBox.appendChild(b);
    });

    var TIP = {
      first: '컴퓨터를 처음 만지는 친구에게',
      easy: '자판이 조금 익숙해졌다면',
      normal: '자리를 다 외웠다면',
      hard: '빠르게 칠 수 있다면'
    };
    var dBox = $('game-diffs');
    dBox.innerHTML = '';
    DIFFS.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'chip' + (d.id === sel.diff ? ' sel' : '');
      b.textContent = d.name;
      b.title = TIP[d.id] || '';
      b.onclick = function () { sel.diff = d.id; openSelect(); };
      dBox.appendChild(b);
    });
    var tip = $('diff-tip');
    if (tip) tip.textContent = TIP[sel.diff] || '';

    APP.show('gamesel');
  }

  /* =========================================================
     공통 준비 / 정리
     ========================================================= */
  function prepare(gameId) {
    stop();
    var lv = DATA.getLevel(sel.level);
    var d = diffOf();

    G = {
      id: gameId, diff: d, level: lv,
      score: 0, combo: 0, bestCombo: 0,
      keys: 0, errors: 0,
      startAt: 0, elapsed: 0, running: false, over: false,
      raf: null, lastT: 0,
      locked: false,
      items: []      // 게임별 대상 목록
    };

    $('game-lv').textContent = lv.no + '단계 · ' + d.name;
    $('game-title').textContent = GAME_NAME[gameId];
    $('g-score').textContent = '0';
    $('g-combo').textContent = '0';
    $('g-cpm').textContent = '0';
    $('g-prog').style.width = '0%';

    var st = $('stage');
    st.innerHTML = '<div class="grid-bg"></div>';

    var input = $('gamein');
    input.value = '';
    input.disabled = false;

    APP.show('game');
    countdown(function () {
      G.running = true;
      G.startAt = Date.now();
      G.lastT = performance.now();
      G.raf = requestAnimationFrame(loop);
      input.focus();
    });
  }

  function countdown(done) {
    var st = $('stage');
    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="big">3</div><p>한/영 키를 눌러 한글 자판으로 바꾸세요</p>';
    st.appendChild(ov);
    var n = 3;
    var big = ov.querySelector('.big');
    var tm = setInterval(function () {
      n--;
      if (n > 0) { big.textContent = n; }
      else if (n === 0) { big.textContent = '시작!'; big.classList.add('go'); }
      else {
        clearInterval(tm);
        ov.remove();
        done();
      }
    }, 800);
    G._cdTimer = tm;
  }

  function stop() {
    if (!G) return;
    if (G.raf) cancelAnimationFrame(G.raf);
    if (G._cdTimer) clearInterval(G._cdTimer);
    if (G._spawnTimer) clearInterval(G._spawnTimer);
    G.running = false;
    G = null;
  }

  function loop(t) {
    if (!G || !G.running) return;
    var dt = Math.min((t - G.lastT) / 1000, 0.1);
    G.lastT = t;
    // 실제로 흐른 프레임만 더한다 — 탭을 잠깐 벗어나도 시간이 건너뛰지 않는다
    G.elapsed += dt;

    if (G.id === 'defense') stepDefense(dt);
    else if (G.id === 'race') stepRace(dt);
    else if (G.id === 'mole') stepMole(dt);
    else if (G.id === 'build') stepBuild(dt);
    else if (G.id === 'spell') stepSpell(dt);
    else if (G.id === 'chain') stepChain(dt);

    var cpm = G.elapsed > 1 ? Math.round(G.keys / (G.elapsed / 60)) : 0;
    $('g-cpm').textContent = cpm;
    G.cpm = cpm;

    if (G.running) G.raf = requestAnimationFrame(loop);
  }

  function addScore(word) {
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    var base = keyLen(word) * 10;
    var bonus = 1 + Math.min(G.combo, 20) * 0.05;
    if (G.doubleUntil > G.elapsed) bonus *= 2;
    G.score += Math.round(base * bonus);
    G.keys += keyLen(word);
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;
  }
  function breakCombo() {
    G.combo = 0;
    $('g-combo').textContent = '0';
  }

  /* =========================================================
     입력 처리 — 여러 대상 중 맞는 것을 찾아 잠금
     ========================================================= */
  var composing = false;
  var wantCommit = false;

  function onGameInput(commit) {
    if (!G || !G.running) return;
    var input = $('gamein');
    if (G.locked) { input.value = ''; return; }
    var v = input.value;

    // 낱말을 통째로 확인해야 하는 게임은 엔터를 눌렀을 때만 판정한다
    if (G.id === 'build') return buildInput(v, commit);
    if (G.id === 'chain') return chainInput(v, commit);

    if (!v.length) {
      G.items.forEach(function (it) { it.lock = false; it.matched = 0; });
      input.style.borderColor = '';
      draw();
      return;
    }

    var best = null, bestJ = null;
    G.items.forEach(function (it) {
      if (it.dead) return;
      var j = HG.judge(it.word, v);
      if (j.ok && j.matched > 0) {
        if (!best || j.matched > bestJ.matched) { best = it; bestJ = j; }
      }
    });

    G.items.forEach(function (it) { it.lock = false; it.matched = 0; });

    if (!best) {
      input.style.borderColor = 'var(--warn)';
      if (!G.wasBad) { G.errors++; G.wasBad = true; breakCombo(); }
      draw();
      return;
    }
    G.wasBad = false;
    input.style.borderColor = '';
    best.lock = true;
    best.matched = bestJ.charDone;

    // 조합이 끝나야(엔터·스페이스 등) 성공 처리한다 — IME 상태를 깨지 않기 위해
    if (bestJ.complete && !composing) {
      hit(best);
      clearInput();
    }
    draw();
  }

  function clearInput() {
    var el = $('gamein');
    G.locked = true;
    el.value = '';
    setTimeout(function () {
      if (!G) return;
      el.value = '';
      G.locked = false;
      if (!G.over) el.focus();
    }, 0);
  }

  function hit(item) {
    addScore(item.word);
    if (G.id === 'defense') killFalling(item);
    else if (G.id === 'race') raceHit(item);
    else if (G.id === 'mole') moleHit(item);
    else if (G.id === 'spell') spellHit(item);
  }

  function draw() {
    if (!G) return;
    if (G.id === 'defense') drawDefense();
    else if (G.id === 'mole') drawMole();
    else if (G.id === 'race') drawRaceWord();
    else if (G.id === 'spell') drawSpell();
  }

  /** 낱말을 "친 부분 / 남은 부분" 으로 나눠 그린다 */
  function wordHtml(item) {
    var w = item.word, n = item.lock ? item.matched : 0;
    return '<span class="hit">' + esc(w.slice(0, n)) + '</span>' + esc(w.slice(n));
  }

  /* =========================================================
     1) 낱말 방어전
     ========================================================= */
  function startDefense() {
    prepare('defense');
    var st = $('stage');
    var shield = document.createElement('div');
    shield.className = 'shieldline';
    var hp = document.createElement('div');
    hp.className = 'hpbar';
    hp.innerHTML = '<i style="width:100%"></i><span>방어선 100%</span>';
    st.appendChild(shield);
    st.appendChild(hp);

    var buff = document.createElement('div');
    buff.className = 'buffbar';
    buff.id = 'buffbar';
    st.appendChild(buff);

    G.hp = 100;
    G.hpEl = hp.querySelector('i');
    G.hpTx = hp.querySelector('span');
    G.spawnAcc = 0;
    G.spawnCount = 0;
    G.freezeUntil = -1;
    G.doubleUntil = -1;
    G.doubleOn = false;
    G.limitY = 84;    // 방어선 위치(%)
  }

  function stepDefense(dt) {
    var d = G.diff;
    var ramp = 1 + Math.min(G.elapsed / 120, 1) * d.ramp;
    var speed = BASE_FALL * d.fall * ramp;                 // %/초
    var interval = Math.max(1.1, d.spawn / ramp);

    // 얼리기 아이템이 걸려 있으면 멈춘다
    var frozen = G.freezeUntil > G.elapsed;
    if (G.doubleUntil <= G.elapsed && G.doubleOn) { G.doubleOn = false; showBuff(); }

    var alive = 0;
    for (var i = 0; i < G.items.length; i++) if (!G.items[i].dead) alive++;

    if (!frozen) {
      G.spawnAcc += dt;
      if (G.spawnAcc >= interval) {
        G.spawnAcc = 0;
        if (alive < d.alive) spawnFalling();
      }
    }

    var leaked = false;
    if (!frozen) {
      G.items.forEach(function (it) {
        if (it.dead) return;
        it.y += speed * it.sf * dt;
        if (it.y >= G.limitY) {
          it.dead = true;
          it.el.classList.add('boom');
          var el = it.el;
          setTimeout(function () { el.remove(); }, 260);
          G.hp -= 10;
          leaked = true;
        }
      });
      G.items = G.items.filter(function (it) { return !it.dead || it.el.parentNode; });
    }

    if (leaked) {
      breakCombo();
      G.hp = Math.max(0, G.hp);
      updateHp();
      if (G.hp <= 0) { gameOver('방어선이 무너졌어요'); return; }
    }
    if (frozen) $('stage').classList.add('frozen');
    else $('stage').classList.remove('frozen');
    drawDefense();
  }

  function updateHp() {
    G.hpEl.style.width = G.hp + '%';
    G.hpTx.textContent = '방어선 ' + G.hp + '%';
    $('g-prog').style.width = (100 - G.hp) + '%';
  }

  function spawnFalling() {
    var active = G.items.filter(function (it) { return !it.dead; })
      .map(function (it) { return it.word; });
    var w = randWord(active);

    // 아이템은 처음 두 번은 안 나오고, 그 뒤 여섯에 하나꼴
    G.spawnCount = (G.spawnCount || 0) + 1;
    var item = null;
    if (G.spawnCount > 2 && Math.random() < 0.17) {
      // 방어선이 깎였으면 회복이 더 잘 나오게
      var pool = ITEM_KEYS.slice();
      if (G.hp <= 50) pool.push('heal', 'heal');
      item = pool[Math.floor(Math.random() * pool.length)];
    }

    var el = document.createElement('div');
    el.className = 'falling' + (item ? ' item' : '');
    var x = 12 + Math.random() * 76;
    el.style.left = x + '%';
    el.style.top = '0%';
    if (item) el.style.setProperty('--ic', ITEMS[item].color);
    $('stage').appendChild(el);

    G.items.push({
      word: w, el: el, x: x, y: 0, lock: false, matched: 0,
      dead: false, item: item, sf: speedFactor(w)
    });
  }

  function drawDefense() {
    G.items.forEach(function (it) {
      if (it.dead) return;
      it.el.style.top = it.y + '%';
      it.el.classList.toggle('lock', !!it.lock);
      it.el.innerHTML = (it.item ? '<span class="ii">' + ITEMS[it.item].icon + '</span>' : '') + wordHtml(it);
    });
  }

  function killFalling(item) {
    item.dead = true;
    item.el.classList.add('boom');
    var el = item.el;
    setTimeout(function () { el.remove(); }, 260);
    G.items = G.items.filter(function (it) { return it !== item; });
    if (item.item) applyItem(item.item);
  }

  /* ---------- 아이템 효과 ---------- */
  function applyItem(kind) {
    var info = ITEMS[kind];
    if (kind === 'freeze') {
      G.freezeUntil = G.elapsed + 3.2;
    } else if (kind === 'bomb') {
      var gone = G.items.slice();
      gone.forEach(function (it) {
        if (it.dead) return;
        it.dead = true;
        it.el.classList.add('boom');
        var el = it.el;
        setTimeout(function () { el.remove(); }, 260);
        G.score += 20;
      });
      G.items = [];
      $('g-score').textContent = G.score;
    } else if (kind === 'heal') {
      G.hp = Math.min(100, G.hp + 25);
      updateHp();
    } else if (kind === 'double') {
      G.doubleUntil = G.elapsed + 9;
      G.doubleOn = true;
    }
    flashItem(info);
    showBuff();
  }

  function flashItem(info) {
    var el = document.createElement('div');
    el.className = 'itemflash';
    el.style.setProperty('--ic', info.color);
    el.innerHTML = info.icon + ' ' + info.name;
    $('stage').appendChild(el);
    setTimeout(function () { el.remove(); }, 1100);
  }

  function showBuff() {
    var box = $('buffbar');
    if (!box) return;
    var out = '';
    if (G.freezeUntil > G.elapsed) out += '<span style="--ic:' + ITEMS.freeze.color + '">❄ 멈춤</span>';
    if (G.doubleUntil > G.elapsed) out += '<span style="--ic:' + ITEMS.double.color + '">★ 점수 2배</span>';
    box.innerHTML = out;
  }

  /* =========================================================
     2) 컴퓨터와 달리기
     ========================================================= */
  var RACE_WORDS = 12;

  function startRace() {
    prepare('race');
    var st = $('stage');
    var track = document.createElement('div');
    track.className = 'track';
    track.innerHTML =
      '<div class="lane me">' +
      '  <div class="who">🏃 나 <span class="pct" id="r-me-pct">0%</span></div>' +
      '  <div class="rail"><i id="r-me"></i></div>' +
      '  <div class="runner" id="r-me-run" style="left:0%">🏃</div>' +
      '</div>' +
      '<div class="lane ai">' +
      '  <div class="who">🤖 컴퓨터 <span class="pct" id="r-ai-pct">0%</span></div>' +
      '  <div class="rail"><i id="r-ai"></i></div>' +
      '  <div class="runner" id="r-ai-run" style="left:0%">🤖</div>' +
      '</div>' +
      '<div style="text-align:center;margin-top:6px">' +
      '  <div id="r-word" style="font-size:clamp(24px,5vh,44px);font-weight:800"></div>' +
      '  <div id="r-next" style="color:var(--dim2);font-size:13px;margin-top:6px"></div>' +
      '</div>';
    st.appendChild(track);
    var fin = document.createElement('div');
    fin.className = 'finish';
    st.appendChild(fin);

    // 낱말 목록을 미리 뽑아 총 타건 수를 정한다
    G.list = [];
    for (var i = 0; i < RACE_WORDS; i++) G.list.push(randWord(null));
    G.totalKeys = G.list.reduce(function (s, w) { return s + keyLen(w); }, 0);
    G.myKeys = 0;
    G.aiKeys = 0;
    G.wordIdx = 0;
    G.items = [{ word: G.list[0], lock: false, matched: 0 }];
    drawRaceWord();
  }

  function stepRace(dt) {
    // 처음 5초는 컴퓨터가 기다려 준다 — 아이가 화면을 읽을 시간
    if (G.elapsed > 5) G.aiKeys += (G.diff.aiCpm / 60) * dt;

    var mp = Math.min(100, G.myKeys / G.totalKeys * 100);
    var ap = Math.min(100, G.aiKeys / G.totalKeys * 100);
    $('r-me').style.width = mp + '%';
    $('r-ai').style.width = ap + '%';
    $('r-me-pct').textContent = Math.round(mp) + '%';
    $('r-ai-pct').textContent = Math.round(ap) + '%';
    $('r-me-run').style.left = mp + '%';
    $('r-ai-run').style.left = ap + '%';
    $('g-prog').style.width = mp + '%';

    if (mp >= 100) { gameOver('🏆 이겼어요! 컴퓨터보다 빨랐습니다', true); return; }
    if (ap >= 100) { gameOver('컴퓨터가 먼저 들어왔어요'); return; }
  }

  function raceHit() {
    G.myKeys += keyLen(G.list[G.wordIdx]);
    G.wordIdx++;
    if (G.wordIdx < G.list.length) {
      G.items = [{ word: G.list[G.wordIdx], lock: false, matched: 0 }];
    } else {
      G.items = [];
      G.myKeys = G.totalKeys;
    }
    drawRaceWord();
  }

  function drawRaceWord() {
    if (G.id !== 'race') return;
    var wEl = $('r-word'), nEl = $('r-next');
    if (!wEl) return;
    if (!G.items.length) { wEl.textContent = '완주!'; nEl.textContent = ''; return; }
    wEl.innerHTML = wordHtml(G.items[0]);
    nEl.textContent = '다음  ' + G.list.slice(G.wordIdx + 1, G.wordIdx + 5).join('   ');
  }

  /* =========================================================
     3) 두더지 타자
     ========================================================= */
  var MOLE_TIME = 60;

  function startMole() {
    prepare('mole');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'moles';
    for (var i = 0; i < 9; i++) {
      var h = document.createElement('div');
      h.className = 'hole';
      h.innerHTML = '<div class="word"></div><div class="timer"></div>';
      wrap.appendChild(h);
    }
    st.appendChild(wrap);
    G.holes = [].slice.call(wrap.children).map(function (el) {
      return { el: el, wordEl: el.querySelector('.word'), timerEl: el.querySelector('.timer'), item: null };
    });
    G.missed = 0;
    G.spawnAcc = 0.4;
  }

  function stepMole(dt) {
    var d = G.diff;
    var ramp = 1 + Math.min(G.elapsed / 90, 1) * d.ramp;
    var life = Math.max(2.4, d.life / ramp);
    var interval = Math.max(1.0, (d.spawn * 0.7) / ramp);
    var maxUp = d.maxUp + (G.elapsed > 40 ? 1 : 0);

    var upCount = G.holes.filter(function (h) { return h.item; }).length;
    G.spawnAcc += dt;
    if (G.spawnAcc >= interval && upCount < maxUp) {
      G.spawnAcc = 0;
      popMole(life);
    }

    var missedNow = false;
    G.holes.forEach(function (h) {
      if (!h.item) return;
      h.item.t -= dt;
      h.timerEl.style.width = Math.max(0, h.item.t / h.item.life * 100) + '%';
      if (h.item.t <= 0) {
        removeMole(h);
        G.missed++;
        missedNow = true;
      }
    });
    if (missedNow) breakCombo();

    var left = Math.max(0, MOLE_TIME - G.elapsed);
    $('g-prog').style.width = (G.elapsed / MOLE_TIME * 100) + '%';
    if (left <= 0) { gameOver('시간 종료! 놓친 낱말 ' + G.missed + '개', G.missed <= 3); return; }
    drawMole();
  }

  function popMole(life) {
    var empty = G.holes.filter(function (h) { return !h.item; });
    if (!empty.length) return;
    var h = empty[Math.floor(Math.random() * empty.length)];
    var active = G.items.map(function (it) { return it.word; });
    var w = randWord(active);
    var item = { word: w, hole: h, t: life, life: life, lock: false, matched: 0 };
    h.item = item;
    G.items.push(item);
    h.el.classList.add('up');
    h.timerEl.style.width = '100%';
  }

  function removeMole(h) {
    if (!h.item) return;
    G.items = G.items.filter(function (it) { return it !== h.item; });
    h.item = null;
    h.el.classList.remove('up', 'lock');
    h.wordEl.textContent = '';
  }

  function moleHit(item) {
    var h = item.hole;
    h.el.classList.add('pop');
    setTimeout(function () { h.el.classList.remove('pop'); }, 260);
    removeMole(h);
  }

  function drawMole() {
    G.holes.forEach(function (h) {
      if (!h.item) return;
      h.wordEl.innerHTML = wordHtml(h.item);
      h.el.classList.toggle('lock', !!h.item.lock);
    });
  }

  /* =========================================================
     4) 한글 조립 — 떨어진 자모를 모아 글자를 만든다
     ========================================================= */
  var BUILD_CAP = 9;

  function levelJamos(lv) {
    var cons = [], vow = [];
    lv.keyList.forEach(function (k) {
      var j = HG.KEYMAP[k];
      if (!j) return;
      if (j.charCodeAt(0) >= 0x314F && j.charCodeAt(0) <= 0x3163) vow.push(j);
      else cons.push(j);
    });
    return { cons: cons, vow: vow };
  }

  function startBuild() {
    prepare('build');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'buildwrap';
    wrap.innerHTML =
      '<div class="bhint" id="b-hint"></div>' +
      '<div class="bshelf" id="b-shelf"></div>' +
      '<div class="bcap">보관함 <b id="b-count">0</b> / ' + BUILD_CAP + '</div>';
    st.appendChild(wrap);

    G.jamos = levelJamos(G.level);
    G.shelf = [];                   // 보관함에 쌓인 자모
    G.spawnAcc = 0;
    G.limitY = 66;
    drawBuild();
  }

  // 이 게임은 낙하가 아니라 조립이 어려운 부분이라 낙하 속도를 따로 잡는다
  var BUILD_FALL = { first: 7, easy: 8.5, normal: 11, hard: 14 };      // %/초
  var BUILD_SPAWN = { first: 4.2, easy: 3.4, normal: 2.6, hard: 2.0 }; // 초

  function stepBuild(dt) {
    var d = G.diff;
    var ramp = 1 + Math.min(G.elapsed / 120, 1) * d.ramp;
    var speed = (BUILD_FALL[d.id] || 9) * ramp;
    var interval = Math.max(1.2, (BUILD_SPAWN[d.id] || 3) / ramp);

    G.spawnAcc += dt;
    if (G.spawnAcc >= interval && G.items.length < 4) {
      G.spawnAcc = 0;
      spawnJamo();
    }

    var landed = false;
    G.items.forEach(function (it) {
      if (it.dead) return;
      it.y += speed * dt;
      if (it.y >= G.limitY) {
        it.dead = true;
        it.el.remove();
        G.shelf.push(it.word);
        landed = true;
      }
    });
    G.items = G.items.filter(function (it) { return !it.dead; });

    if (landed) {
      drawBuild();
      $('g-prog').style.width = (G.shelf.length / BUILD_CAP * 100) + '%';
      if (G.shelf.length >= BUILD_CAP) {
        gameOver('보관함이 가득 찼어요');
        return;
      }
    }
    G.items.forEach(function (it) { it.el.style.top = it.y + '%'; });
  }

  function spawnJamo() {
    // 보관함에 모음이 없으면 모음이 나오게 해서 글자를 만들 수 있게 한다
    var hasVow = G.shelf.some(function (j) {
      var c = j.charCodeAt(0); return c >= 0x314F && c <= 0x3163;
    });
    var pool = (!hasVow && G.jamos.vow.length) ? G.jamos.vow
      : (Math.random() < 0.45 ? G.jamos.vow : G.jamos.cons);
    if (!pool.length) pool = G.jamos.cons.concat(G.jamos.vow);
    var j = pool[Math.floor(Math.random() * pool.length)];

    var el = document.createElement('div');
    el.className = 'falling jamo';
    el.style.left = (14 + Math.random() * 72) + '%';
    el.style.top = '0%';
    el.textContent = j;
    $('stage').appendChild(el);
    G.items.push({ word: j, el: el, y: 0, dead: false });
  }

  function drawBuild() {
    var shelf = $('b-shelf');
    if (!shelf) return;
    shelf.innerHTML = G.shelf.map(function (j) {
      return '<span class="btile">' + esc(j) + '</span>';
    }).join('');
    $('b-count').textContent = G.shelf.length;
    var hint = $('b-hint');
    var can = findBuildable();
    hint.innerHTML = can
      ? '만들 수 있어요 → <b>' + esc(can) + '</b> 치고 엔터'
      : '자모를 더 모아 보세요';
  }

  /** 보관함 자모만으로 만들 수 있는 글자 하나를 찾아 힌트로 준다 */
  function findBuildable() {
    var pool = countJamo(G.shelf);
    var cons = [], vow = [];
    for (var j in pool) {
      var c = j.charCodeAt(0);
      if (c >= 0x314F && c <= 0x3163) vow.push(j); else cons.push(j);
    }
    for (var a = 0; a < cons.length; a++) {
      for (var b = 0; b < vow.length; b++) {
        var s = APP.compose(cons[a], vow[b], '');
        if (s) return s;
      }
    }
    return null;
  }

  function countJamo(list) {
    var m = {};
    list.forEach(function (j) { m[j] = (m[j] || 0) + 1; });
    return m;
  }

  /** 입력한 글자를 보관함 자모로 만들 수 있는지 확인하고 차감한다 */
  function buildInput(v, commit) {
    var input = $('gamein');
    if (!commit) { input.style.borderColor = ''; return; }
    var word = v.trim();
    if (!word) return;

    // 낱말을 기본 자모로 모두 분해
    var need = [];
    var ok = true;
    for (var i = 0; i < word.length; i++) {
      var keys = HG.charToKeys(word[i]);
      if (!keys.length) { ok = false; break; }
      keys.forEach(function (k) {
        var j = HG.KEYMAP[k.toLowerCase()];
        // 윗글쇠 자모는 그대로 쓴다
        need.push(HG.KEYMAP[k] || j);
      });
    }
    if (!ok || !need.length) { badBuild('글자를 다시 확인해 보세요'); return; }

    var have = countJamo(G.shelf);
    var short = null;
    var want = countJamo(need);
    for (var j in want) {
      if ((have[j] || 0) < want[j]) { short = j; break; }
    }
    if (short) { badBuild('보관함에 ' + short + ' 이(가) 모자라요'); return; }

    // 차감
    need.forEach(function (j) {
      var idx = G.shelf.indexOf(j);
      if (idx >= 0) G.shelf.splice(idx, 1);
    });
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    G.score += need.length * 15 * (1 + Math.min(G.combo, 15) * 0.05);
    G.score = Math.round(G.score);
    G.keys += HG.textToKeys(word).length;
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;
    input.style.borderColor = '';
    flashItem({ icon: '✦', name: word + ' 완성', color: '#3ee0c0' });
    clearInput();
    drawBuild();
    $('g-prog').style.width = (G.shelf.length / BUILD_CAP * 100) + '%';
  }

  function badBuild(msg) {
    var input = $('gamein');
    input.style.borderColor = 'var(--warn)';
    G.errors++;
    breakCombo();
    var h = $('b-hint');
    if (h) h.innerHTML = '<span style="color:var(--warn)">' + esc(msg) + '</span>';
    setTimeout(drawBuild, 1400);
  }

  /* =========================================================
     5) 마법사 주문 — 속성을 맞춰 쳐야 큰 피해가 들어간다
     ========================================================= */
  var ELEMS = {
    fire: { name: '불', icon: '🔥', color: '#ff8a5c', beats: 'wind' },
    wind: { name: '바람', icon: '🌪', color: '#7ee7c4', beats: 'ice' },
    ice: { name: '얼음', icon: '❄', color: '#5ad4e6', beats: 'fire' }
  };
  var ELEM_KEYS = ['fire', 'wind', 'ice'];

  function startSpell() {
    prepare('spell');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'spellwrap';
    wrap.innerHTML =
      '<div class="boss" id="s-boss">' +
      '  <div class="bico" id="s-bico">👹</div>' +
      '  <div class="belem" id="s-belem"></div>' +
      '  <div class="bhp"><i id="s-bhp"></i><span id="s-bhptx"></span></div>' +
      '</div>' +
      '<div class="spells" id="s-cards"></div>' +
      '<div class="myhp"><span>내 체력</span><div class="bhp"><i id="s-mhp"></i><span id="s-mhptx"></span></div></div>';
    st.appendChild(wrap);

    G.bossHp = 100;
    G.myHp = 100;
    G.atkAcc = 0;
    G.elem = pick(ELEM_KEYS);
    G.elemAcc = 0;
    newSpells();
    drawSpell();
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function newSpells() {
    var used = [];
    G.items = [];
    for (var i = 0; i < 3; i++) {
      // 주문이 한 글자면 너무 싱겁다 — 두 글자 이상을 고른다
      var w = randWord(used);
      for (var t = 0; t < 20 && w.length < 2; t++) w = randWord(used);
      used.push(w);
      G.items.push({ word: w, elem: ELEM_KEYS[i], lock: false, matched: 0 });
    }
    // 속성 순서를 섞는다
    G.items.forEach(function (it) { it.elem = pick(ELEM_KEYS); });
    // 적어도 하나는 약점 속성이 나오게 한다
    var weak = weakness(G.elem);
    if (!G.items.some(function (it) { return it.elem === weak; })) {
      G.items[Math.floor(Math.random() * 3)].elem = weak;
    }
  }

  /** 보스 속성을 이기는 속성 */
  function weakness(bossElem) {
    for (var k in ELEMS) if (ELEMS[k].beats === bossElem) return k;
    return ELEM_KEYS[0];
  }

  function stepSpell(dt) {
    var d = G.diff;
    // 보스 공격 주기 — 난이도가 낮을수록 느리다
    var period = { first: 9, easy: 7, normal: 5, hard: 3.6 }[d.id] || 6;
    G.atkAcc += dt;
    if (G.atkAcc >= period) {
      G.atkAcc = 0;
      G.myHp -= 12;
      breakCombo();
      flashItem({ icon: '💢', name: '공격을 받았어요', color: '#ff6b81' });
      if (G.myHp <= 0) { G.myHp = 0; drawSpell(); gameOver('마법사가 쓰러졌어요'); return; }
    }
    // 보스가 가끔 속성을 바꾼다
    G.elemAcc += dt;
    if (G.elemAcc >= period * 2.5) {
      G.elemAcc = 0;
      G.elem = pick(ELEM_KEYS);
      newSpells();
    }
    $('g-prog').style.width = (100 - G.bossHp) + '%';
    drawSpell();
  }

  function spellHit(item) {
    var weak = weakness(G.elem);
    var strong = item.elem === weak;
    var dmg = strong ? 22 : 7;
    G.bossHp -= dmg;
    flashItem({
      icon: ELEMS[item.elem].icon,
      name: strong ? '약점 적중! ' + dmg : dmg + ' 피해',
      color: ELEMS[item.elem].color
    });
    if (G.bossHp <= 0) {
      G.bossHp = 0; drawSpell();
      gameOver('🏆 보스를 물리쳤어요', true);
      return;
    }
    newSpells();
    drawSpell();
  }

  function drawSpell() {
    if (G.id !== 'spell') return;
    var e = ELEMS[G.elem];
    var be = $('s-belem');
    if (!be) return;
    be.innerHTML = '<span style="--ec:' + e.color + '">' + e.icon + ' ' + e.name + ' 보스</span>' +
      '<em>약점 · ' + ELEMS[weakness(G.elem)].icon + ' ' + ELEMS[weakness(G.elem)].name + '</em>';
    $('s-bhp').style.width = G.bossHp + '%';
    $('s-bhptx').textContent = G.bossHp + '%';
    $('s-mhp').style.width = G.myHp + '%';
    $('s-mhptx').textContent = G.myHp + '%';
    $('s-mhp').style.background = G.myHp > 40
      ? 'linear-gradient(90deg,var(--ok),var(--accent))'
      : 'linear-gradient(90deg,#c0392b,var(--warn))';

    var weak = weakness(G.elem);
    $('s-cards').innerHTML = G.items.map(function (it) {
      var el = ELEMS[it.elem];
      return '<div class="spell' + (it.lock ? ' lock' : '') + (it.elem === weak ? ' weak' : '') +
        '" style="--ec:' + el.color + '">' +
        '<div class="se">' + el.icon + ' ' + el.name + (it.elem === weak ? ' · 약점' : '') + '</div>' +
        '<div class="sw">' + wordHtml(it) + '</div></div>';
    }).join('');
  }

  /* =========================================================
     6) 끝말잇기 — 컴퓨터와 번갈아 낱말을 잇는다
     ========================================================= */
  function startChain() {
    prepare('chain');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'chainwrap';
    wrap.innerHTML =
      '<div class="clog" id="c-log"></div>' +
      '<div class="cturn" id="c-turn"></div>' +
      '<div class="ctimer"><i id="c-timer"></i></div>';
    st.appendChild(wrap);

    // 끝말잇기는 이을 낱말이 많아야 재미있다.
    // 쉬운 난이도의 "짧은 낱말만" 제한을 빼고 그 단계 낱말을 모두 쓴다.
    var all = DATA.WORD_UPTO[sel.level] || DATA.WORDS;
    G.dict = all.filter(function (w) { return w.length >= 2; });
    G.dictSet = {};
    G.first = {};                   // 첫 글자 -> 낱말들
    G.dict.forEach(function (w) {
      G.dictSet[w] = 1;
      (G.first[w[0]] || (G.first[w[0]] = [])).push(w);
    });
    G.used = {};
    G.chain = [];
    G.limit = { first: 40, easy: 30, normal: 22, hard: 15 }[G.diff.id] || 25;
    G.left = G.limit;
    G.turn = 'ai';
    G.aiWait = 1.2;
    drawChain();
  }

  function lastChar(w) { return w[w.length - 1]; }

  /** 그 글자로 시작하면서 아직 안 쓴 낱말들 */
  function openWords(ch) {
    var list = G.first[ch] || [];
    return list.filter(function (w) { return !G.used[w]; });
  }

  function aiPick(startCh) {
    var cand = startCh ? openWords(startCh) : G.dict.slice();
    if (!cand.length) return null;

    // 사전이 작아서, 답이 없는 낱말을 내면 아이가 손도 못 댄다.
    // 다음 사람이 이을 수 있는 낱말을 먼저 고른다.
    var fair = cand.filter(function (w) {
      return openWords(lastChar(w)).filter(function (x) { return x !== w; }).length > 0;
    });
    var use = fair.length ? fair : cand;

    // 쉬운 난이도에서는 이을 길이 넉넉한 낱말을 골라 준다
    if (G.diff.id === 'first' || G.diff.id === 'easy') {
      use = use.slice().sort(function (a, b) {
        return openWords(lastChar(b)).length - openWords(lastChar(a)).length;
      }).slice(0, Math.max(3, Math.ceil(use.length * 0.3)));
    }
    return use[Math.floor(Math.random() * use.length)];
  }

  function stepChain(dt) {
    if (G.turn === 'ai') {
      G.aiWait -= dt;
      if (G.aiWait <= 0) {
        var need = G.chain.length ? lastChar(G.chain[G.chain.length - 1].word) : null;
        var w = need ? aiPick(need) : G.dict[Math.floor(Math.random() * G.dict.length)];
        if (!w) {
          gameOver('🏆 컴퓨터가 잇지 못했어요. 이겼습니다', true);
          return;
        }
        G.used[w] = 1;
        G.chain.push({ who: 'ai', word: w });
        G.turn = 'me';
        G.left = G.limit;
        drawChain();

        // 아이가 이을 낱말이 하나도 없으면 막다른 길이다. 벌 대신 승리로 끝낸다.
        if (!openWords(lastChar(w)).length) {
          gameOver('🏆 더 이을 낱말이 없어요. 이겼습니다', true);
          return;
        }
      }
      return;
    }
    // 내 차례 — 제한 시간
    G.left -= dt;
    $('c-timer').style.width = Math.max(0, G.left / G.limit * 100) + '%';
    $('c-timer').style.background = G.left < G.limit * 0.3 ? 'var(--warn)' : 'var(--accent)';
    if (G.left <= 0) {
      gameOver('시간이 다 됐어요');
      return;
    }
  }

  function chainInput(v, commit) {
    var input = $('gamein');
    if (!commit) { input.style.borderColor = ''; return; }
    if (G.turn !== 'me') return;
    var w = v.trim();
    if (!w) return;

    var need = G.chain.length ? lastChar(G.chain[G.chain.length - 1].word) : null;
    var why = null;
    if (w.length < 2) why = '두 글자 이상 낱말이어야 해요';
    else if (need && w[0] !== need) why = '"' + need + '" 로 시작해야 해요';
    else if (G.used[w]) why = '이미 나온 낱말이에요';
    else if (!G.dictSet[w]) why = '이 단계 낱말 목록에 없어요';

    if (why) {
      input.style.borderColor = 'var(--warn)';
      G.errors++;
      breakCombo();
      var t = $('c-turn');
      if (t) t.innerHTML = '<span style="color:var(--warn)">' + esc(why) + '</span>';
      return;
    }

    G.used[w] = 1;
    G.chain.push({ who: 'me', word: w });
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    G.score += w.length * 25 * (1 + Math.min(G.combo, 15) * 0.05);
    G.score = Math.round(G.score);
    G.keys += HG.textToKeys(w).length;
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;
    input.style.borderColor = '';
    clearInput();
    G.turn = 'ai';
    G.aiWait = { first: 2.2, easy: 1.8, normal: 1.2, hard: 0.7 }[G.diff.id] || 1.2;
    drawChain();
  }

  function drawChain() {
    var log = $('c-log');
    if (!log) return;
    log.innerHTML = G.chain.slice(-7).map(function (c) {
      return '<div class="cline ' + c.who + '">' +
        '<span class="cw">' + (c.who === 'ai' ? '🤖' : '🙋') + '</span>' +
        '<span class="ct">' + esc(c.word) + '</span></div>';
    }).join('');
    log.scrollTop = log.scrollHeight;

    var t = $('c-turn');
    if (G.turn === 'ai') {
      t.innerHTML = '<span class="dim">컴퓨터가 생각하고 있어요…</span>';
    } else {
      var need = G.chain.length ? lastChar(G.chain[G.chain.length - 1].word) : '아무';
      var html = '<b>' + esc(need) + '</b> 로 시작하는 낱말을 치고 엔터';
      // 쉬운 난이도에서는 보기를 하나 보여 준다
      if (G.diff.id === 'first' || G.diff.id === 'easy') {
        var ex = openWords(need);
        if (ex.length) html += ' <span class="dim">· 예를 들면 ' + esc(ex[0]) + '</span>';
      }
      t.innerHTML = html;
    }
  }

  /* =========================================================
     게임 종료
     ========================================================= */
  function gameOver(msg, win) {
    if (!G || G.over) return;
    G.over = true;
    G.running = false;
    if (G.raf) cancelAnimationFrame(G.raf);
    $('gamein').disabled = true;

    var key = G.id + '_' + G.level.no + '_' + G.diff.id;
    var prev = APP.rec.games[key] || 0;
    var isNew = G.score > prev;
    if (isNew) { APP.rec.games[key] = G.score; APP.save(); }

    var acc = G.keys + G.errors > 0
      ? Math.round(G.keys / (G.keys + G.errors) * 100) : 100;

    APP.logGame({
      game: G.id, name: GAME_NAME[G.id], level: G.level.no, diff: G.diff.id,
      diffName: G.diff.name, score: G.score, cpm: G.cpm || 0, acc: acc,
      keys: G.keys, err: G.errors, combo: G.bestCombo,
      sec: Math.round(G.elapsed), win: !!win, at: Date.now()
    });

    var ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML =
      '<h3>' + esc(msg) + '</h3>' +
      '<div class="result-grid" style="margin:6px 0">' +
      '<div class="rcard b"><div class="k">점수</div><div class="v">' + G.score + '</div>' +
      '<div class="sub">최고 ' + Math.max(prev, G.score) + '</div></div>' +
      '<div class="rcard a"><div class="k">타수</div><div class="v">' + (G.cpm || 0) + '</div><div class="sub">타/분</div></div>' +
      '<div class="rcard c"><div class="k">정확도</div><div class="v">' + acc + '%</div><div class="sub">오타 ' + G.errors + '번</div></div>' +
      '<div class="rcard"><div class="k">최고 연속</div><div class="v">' + G.bestCombo + '</div><div class="sub">연속 성공</div></div>' +
      '</div>' +
      (isNew ? '<div class="newrec">🏆 <span>최고 점수를 세웠어요!</span></div>' : '') +
      '<div class="btnrow">' +
      '<button class="btn primary" id="go-again">다시 하기</button>' +
      '<button class="btn" id="go-sel">게임 고르기</button>' +
      '<button class="btn ghost" id="go-home">처음으로</button>' +
      '</div>';
    $('stage').appendChild(ov);

    var id = G.id;
    $('go-again').onclick = function () { start(id); };
    $('go-sel').onclick = function () { stop(); openSelect(); };
    $('go-home').onclick = function () { stop(); APP.show('home'); };
    $('go-again').focus();
  }

  /* =========================================================
     시작 / 초기화
     ========================================================= */
  function start(id) {
    if (id === 'defense') startDefense();
    else if (id === 'race') startRace();
    else if (id === 'mole') startMole();
    else if (id === 'build') startBuild();
    else if (id === 'spell') startSpell();
    else if (id === 'chain') startChain();
  }

  function init() {
    document.querySelectorAll('.game-card').forEach(function (b) {
      b.onclick = function () { start(b.dataset.game); };
    });
    var gi = $('gamein');
    gi.addEventListener('input', onGameInput);
    gi.addEventListener('compositionstart', function () { composing = true; });
    gi.addEventListener('compositionend', function () {
      composing = false;
      var c = wantCommit; wantCommit = false;
      setTimeout(function () { onGameInput(c); }, 0);
    });
    gi.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { stop(); openSelect(); return; }
      if (e.key === 'Enter') {
        // 조합 중이면 IME 가 먼저 글자를 확정한다 → compositionend 에서 이어받는다
        wantCommit = true;
        if (!e.isComposing) {
          e.preventDefault();
          composing = false; wantCommit = false;
          onGameInput(true);
        }
        return;
      }
      if (e.key === ' ' && !e.isComposing) {
        e.preventDefault();
        composing = false;
        onGameInput(true);
      }
    });
    $('btn-game-exit').onclick = function () { stop(); openSelect(); };
    $('s-game').addEventListener('mousedown', function (e) {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        setTimeout(function () { var i = $('gamein'); if (!i.disabled) i.focus(); }, 0);
      }
    });
  }

  return { init: init, openSelect: openSelect, start: start, stop: stop };
})();
