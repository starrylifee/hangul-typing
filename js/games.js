/* =========================================================
   games.js — 타자 게임 5종
     defense : 낙하 낱말 방어전 (아이템 있음)
     race    : 컴퓨터와 달리기 (아이템 있음)
     mole    : 두더지 타자
     erase   : 낱말 지우개
     spell   : 마법사 주문 (아이템 있음)
   모두 고른 단계의 자판으로만 된 낱말을 쓴다.
   아이템은 게임 성격에 맞는 곳에만 넣었다 (GAME_ITEMS).
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
    erase: '낱말 지우개', spell: '마법사 주문'
  };

  /* 아이템 — 아이템이 붙은 낱말을 쳐서 없애면 효과가 걸린다.
     게임 성격에 맞는 곳에만 넣는다 (두더지는 칸이 빽빽해 넣지 않음). */
  var ITEMS = {
    freeze: { icon: '❄', name: '3초 멈춤', color: '#5ad4e6' },
    bomb: { icon: '💥', name: '모두 없애기', color: '#ff8fab' },
    heal: { icon: '❤', name: '방어선 회복', color: '#6ee7a0' },
    double: { icon: '★', name: '점수 2배', color: '#ffcc5c' },
    boost: { icon: '⚡', name: '앞으로 쭉', color: '#ffd166' },
    slowai: { icon: '🐢', name: '컴퓨터 느리게', color: '#7ee7c4' },
    blast: { icon: '💫', name: '큰 피해', color: '#ff8a5c' },
    potion: { icon: '❤', name: '체력 회복', color: '#6ee7a0' },
    wild: { icon: '⭐', name: '만능 자모', color: '#ffcc5c' }
  };
  var ITEM_KEYS = ['freeze', 'bomb', 'heal', 'double'];
  var GAME_ITEMS = {
    defense: ['freeze', 'bomb', 'heal', 'double'],
    race: ['boost', 'slowai', 'double'],
    spell: ['blast', 'potion', 'double'],
    mole: [],                      // 두더지는 칸이 빽빽해 넣지 않음
    erase: []                      // 낱말 지우개는 시간 퍼즐이라 넣지 않음
  };

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
    else if (G.id === 'erase') stepErase(dt);
    else if (G.id === 'spell') stepSpell(dt);

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
    if (G.id === 'erase') return eraseInput(v, commit);

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
      // 한/영 키가 영문 상태인지 살펴서 알려 준다
      var eng = G.items.some(function (it) {
        return !it.dead && HG.judge(it.word, v).engMode;
      });
      if (eng) showEngWarn();
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

  /** 한/영 키를 안 눌렀을 때 크게 알려 준다 */
  function showEngWarn() {
    var st = $('stage');
    if (!st || st.querySelector('.engwarn')) return;
    var w = document.createElement('div');
    w.className = 'engwarn';
    w.textContent = '한/영 키를 눌러 한글 자판으로 바꿔 주세요';
    st.appendChild(w);
    setTimeout(function () { w.remove(); }, 2200);
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
    // 치면 안 되는 동물은 점수를 주지 않고 깎는다
    if (G.id === 'mole' && item.bad) { moleBadHit(item); return; }
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
    var item = rollItem(0.17);

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

  /* ---------- 아이템 ---------- */
  /** 이 게임에서 아이템 하나를 뽑는다 (안 나올 수도 있다) */
  function rollItem(chance) {
    var pool = GAME_ITEMS[G.id] || [];
    if (!pool.length) return null;
    G.spawnCount = (G.spawnCount || 0) + 1;
    if (G.spawnCount <= 2) return null;              // 처음 두 번은 그냥
    if (Math.random() >= (chance || 0.17)) return null;
    var p = pool.slice();
    // 체력이 깎였으면 회복이 더 잘 나오게
    if (G.id === 'defense' && G.hp <= 50) p.push('heal', 'heal');
    if (G.id === 'spell' && G.myHp <= 50) p.push('potion', 'potion');
    return p[Math.floor(Math.random() * p.length)];
  }

  function applyItem(kind) {
    var info = ITEMS[kind];
    if (kind === 'boost') {
      G.myKeys = Math.min(G.totalKeys, G.myKeys + G.totalKeys * 0.12);
    } else if (kind === 'slowai') {
      G.aiSlowUntil = G.elapsed + 8;
    } else if (kind === 'blast') {
      G.bossHp -= 25;
      shakeStage(500);
      if (G.bossHp <= 0) { G.bossHp = 0; drawSpell(); flashItem(info); gameOver('🏆 보스를 물리쳤어요', true); return; }
    } else if (kind === 'potion') {
      G.myHp = Math.min(100, G.myHp + 28);
    } else if (kind === 'wild') {
      G.shelf.push('⭐');
    } else if (kind === 'freeze') {
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
    var slow = G.aiSlowUntil > G.elapsed ? 0.4 : 1;
    if (G.elapsed > 5) G.aiKeys += (G.diff.aiCpm * slow / 60) * dt;
    if (G.aiSlowUntil && G.aiSlowUntil <= G.elapsed && G.slowOn) { G.slowOn = false; showBuff(); }

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

  /* 두더지 그림 — 낱말 팻말을 들고 구멍에서 올라온다 */
  var MOLE_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="30" ry="7" fill="rgba(0,0,0,.35)"/>' +
    // 몸통
    '  <path d="M22 88 C18 58 28 38 50 38 C72 38 82 58 78 88 Z" fill="#7a6357"/>' +
    // 배
    '  <path d="M34 88 C31 66 38 54 50 54 C62 54 69 66 66 88 Z" fill="#c8ad97"/>' +
    // 머리
    '  <ellipse cx="50" cy="40" rx="27" ry="24" fill="#8d7365"/>' +
    // 볼
    '  <ellipse cx="38" cy="47" rx="10" ry="8" fill="#a8897a"/>' +
    '  <ellipse cx="62" cy="47" rx="10" ry="8" fill="#a8897a"/>' +
    // 눈
    '  <ellipse cx="41" cy="34" rx="4.6" ry="5.2" fill="#2b1f19"/>' +
    '  <ellipse cx="59" cy="34" rx="4.6" ry="5.2" fill="#2b1f19"/>' +
    '  <circle cx="42.6" cy="32.2" r="1.6" fill="#fff"/>' +
    '  <circle cx="60.6" cy="32.2" r="1.6" fill="#fff"/>' +
    // 코
    '  <ellipse cx="50" cy="45" rx="6" ry="4.6" fill="#e8a0a8"/>' +
    '  <ellipse cx="47.4" cy="44.2" rx="1.3" ry="1" fill="#8d5b62"/>' +
    '  <ellipse cx="52.6" cy="44.2" rx="1.3" ry="1" fill="#8d5b62"/>' +
    // 수염
    '  <g stroke="#5c4438" stroke-width="1.2" stroke-linecap="round">' +
    '    <path d="M42 49 L28 47"/><path d="M42 51 L29 53"/>' +
    '    <path d="M58 49 L72 47"/><path d="M58 51 L71 53"/>' +
    '  </g>' +
    // 앞니
    '  <rect x="47" y="49.5" width="6" height="5" rx="1.2" fill="#fff"/>' +
    '  <line x1="50" y1="49.5" x2="50" y2="54.5" stroke="#dcd2c8" stroke-width=".8"/>' +
    // 팻말 든 손
    '  <ellipse cx="24" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '  <ellipse cx="76" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '</svg>';

  /* 치면 안 되는 동물들 — 이 친구들이 든 낱말을 치면 점수가 깎인다 */
  var RABBIT_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="28" ry="6" fill="rgba(0,0,0,.35)"/>' +
    // 귀
    '  <ellipse cx="38" cy="20" rx="7" ry="20" fill="#eee7e1" transform="rotate(-10 38 20)"/>' +
    '  <ellipse cx="62" cy="20" rx="7" ry="20" fill="#eee7e1" transform="rotate(10 62 20)"/>' +
    '  <ellipse cx="38" cy="21" rx="3.4" ry="14" fill="#f2b8c6" transform="rotate(-10 38 21)"/>' +
    '  <ellipse cx="62" cy="21" rx="3.4" ry="14" fill="#f2b8c6" transform="rotate(10 62 21)"/>' +
    // 몸·머리
    '  <path d="M24 88 C21 64 30 46 50 46 C70 46 79 64 76 88 Z" fill="#efe9e3"/>' +
    '  <ellipse cx="50" cy="52" rx="25" ry="21" fill="#f6f1ec"/>' +
    // 눈
    '  <ellipse cx="41" cy="48" rx="4.2" ry="5" fill="#3a2a2a"/>' +
    '  <ellipse cx="59" cy="48" rx="4.2" ry="5" fill="#3a2a2a"/>' +
    '  <circle cx="42.4" cy="46.4" r="1.5" fill="#fff"/>' +
    '  <circle cx="60.4" cy="46.4" r="1.5" fill="#fff"/>' +
    // 코·입
    '  <path d="M50 58 L46.6 54.6 L53.4 54.6 Z" fill="#e08fa2"/>' +
    '  <path d="M50 58 v3.4" stroke="#c98096" stroke-width="1.4" stroke-linecap="round"/>' +
    '  <rect x="47" y="61.4" width="6" height="5" rx="1" fill="#fff" stroke="#ddd2c8" stroke-width=".6"/>' +
    '  <g stroke="#c9bdb2" stroke-width="1.1" stroke-linecap="round">' +
    '    <path d="M42 57 L28 54"/><path d="M42 59 L29 62"/>' +
    '    <path d="M58 57 L72 54"/><path d="M58 59 L71 62"/>' +
    '  </g>' +
    '</svg>';

  var FROG_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="30" ry="6" fill="rgba(0,0,0,.35)"/>' +
    '  <path d="M18 88 C16 62 28 46 50 46 C72 46 84 62 82 88 Z" fill="#5aa851"/>' +
    '  <ellipse cx="50" cy="76" rx="22" ry="13" fill="#d2ea9d"/>' +
    '  <ellipse cx="50" cy="52" rx="30" ry="19" fill="#6cbe61"/>' +
    // 튀어나온 눈
    '  <circle cx="33" cy="33" r="13" fill="#6cbe61"/>' +
    '  <circle cx="67" cy="33" r="13" fill="#6cbe61"/>' +
    '  <circle cx="33" cy="32" r="9" fill="#fff"/>' +
    '  <circle cx="67" cy="32" r="9" fill="#fff"/>' +
    '  <circle cx="33" cy="33" r="5" fill="#1e2b16"/>' +
    '  <circle cx="67" cy="33" r="5" fill="#1e2b16"/>' +
    '  <circle cx="34.8" cy="31" r="1.8" fill="#fff"/>' +
    '  <circle cx="68.8" cy="31" r="1.8" fill="#fff"/>' +
    // 입·콧구멍
    '  <path d="M31 57 Q50 69 69 57" stroke="#2f6b2c" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
    '  <circle cx="45" cy="47" r="1.5" fill="#2f6b2c"/>' +
    '  <circle cx="55" cy="47" r="1.5" fill="#2f6b2c"/>' +
    '</svg>';

  var CRITTERS = {
    mole: { svg: MOLE_SVG, name: '두더지', bad: false },
    rabbit: { svg: RABBIT_SVG, name: '토끼', bad: true },
    frog: { svg: FROG_SVG, name: '개구리', bad: true }
  };
  var BAD_KINDS = ['rabbit', 'frog'];
  /* 치면 안 되는 동물이 나올 확률 */
  var BAD_RATE = { first: 0.15, easy: 0.22, normal: 0.30, hard: 0.38 };

  function startMole() {
    prepare('mole');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'moles';
    for (var i = 0; i < 9; i++) {
      var h = document.createElement('div');
      h.className = 'hole';
      h.innerHTML =
        '<div class="dirt"></div>' +
        '<div class="mole"></div>' +
        '<div class="timer"></div>';
      wrap.appendChild(h);
    }
    st.appendChild(wrap);
    G.holes = [].slice.call(wrap.children).map(function (el) {
      return {
        el: el, moleEl: el.querySelector('.mole'), wordEl: null,
        timerEl: el.querySelector('.timer'), item: null
      };
    });
    G.missed = 0;
    G.badHit = 0;
    G.spawnAcc = 0.4;

    // 규칙 안내 — 무엇을 치면 안 되는지 먼저 알려 준다
    var rule = document.createElement('div');
    rule.className = 'molerule';
    rule.innerHTML = '두더지가 든 낱말만 치세요 · ' +
      '<span class="bad">토끼와 개구리</span>가 든 낱말을 치면 점수가 깎여요';
    st.appendChild(rule);
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
        // 토끼·개구리는 그냥 사라지는 게 맞다. 놓친 것으로 치지 않는다.
        var wasBad = h.item.bad;
        removeMole(h);
        if (!wasBad) { G.missed++; missedNow = true; }
      }
    });
    if (missedNow) breakCombo();

    var left = Math.max(0, MOLE_TIME - G.elapsed);
    $('g-prog').style.width = (G.elapsed / MOLE_TIME * 100) + '%';
    if (left <= 0) {
      var msg = '시간 종료! 놓친 두더지 ' + G.missed + '마리';
      if (G.badHit) msg += ' · 잘못 친 동물 ' + G.badHit + '마리';
      gameOver(msg, G.missed <= 3 && G.badHit === 0);
      return;
    }
    drawMole();
  }

  function popMole(life) {
    var empty = G.holes.filter(function (h) { return !h.item; });
    if (!empty.length) return;
    var h = empty[Math.floor(Math.random() * empty.length)];
    var active = G.items.map(function (it) { return it.word; });
    var w = randWord(active);

    // 가끔 치면 안 되는 동물이 나온다
    var kind = 'mole';
    if (Math.random() < (BAD_RATE[G.diff.id] || 0.25)) {
      kind = BAD_KINDS[Math.floor(Math.random() * BAD_KINDS.length)];
    }
    var c = CRITTERS[kind];

    var item = {
      word: w, hole: h, t: life, life: life,
      lock: false, matched: 0, kind: kind, bad: c.bad
    };
    h.item = item;
    G.items.push(item);

    h.moleEl.innerHTML = c.svg +
      '<div class="sign' + (c.bad ? ' bad' : '') + '"><div class="word"></div></div>';
    h.wordEl = h.moleEl.querySelector('.word');
    h.el.classList.toggle('badhole', !!c.bad);
    h.el.classList.add('up');
    h.timerEl.style.width = '100%';
  }

  function removeMole(h) {
    if (!h.item) return;
    G.items = G.items.filter(function (it) { return it !== h.item; });
    h.item = null;
    h.el.classList.remove('up', 'lock');
    var el = h.moleEl;
    // 내려간 뒤에 지운다 — 내려가는 모습이 보이게
    setTimeout(function () {
      if (el && !el.parentNode.classList.contains('up')) el.innerHTML = '';
    }, 300);
    h.wordEl = null;
  }

  function moleHit(item) {
    var h = item.hole;
    h.el.classList.add('pop');
    setTimeout(function () { h.el.classList.remove('pop'); }, 260);
    removeMole(h);
  }

  /** 토끼·개구리를 쳐 버렸을 때 */
  function moleBadHit(item) {
    var h = item.hole;
    var c = CRITTERS[item.kind];
    var pen = keyLen(item.word) * 12;
    G.score = Math.max(0, G.score - pen);
    G.badHit++;
    breakCombo();
    $('g-score').textContent = G.score;

    h.el.classList.add('wrong');
    setTimeout(function () { h.el.classList.remove('wrong'); }, 500);
    // 토끼·개구리 모두 받침이 없어서 조사는 '는' 으로 붙는다
    flashItem({ icon: '✋', name: c.name + '는 치면 안 돼요 · ' + pen + '점 깎임', color: '#ff6b81' });
    removeMole(h);
  }

  function drawMole() {
    G.holes.forEach(function (h) {
      if (!h.item || !h.wordEl) return;
      h.wordEl.innerHTML = wordHtml(h.item);
      h.el.classList.toggle('lock', !!h.item.lock);
    });
  }

  /* =========================================================
     4) 낱말 지우개 — 판에 깔린 자모를 낱말로 지운다
        판은 그 단계 낱말들을 자모로 풀어 섞어 만든다.
        그래서 반드시 지울 수 있는 낱말이 판 안에 들어 있다.
     ========================================================= */
  var ERASE_WORDS = { first: 8, easy: 11, normal: 15, hard: 20 };
  var ERASE_TIME = { first: 150, easy: 120, normal: 95, hard: 75 };

  /** 낱말을 기본 자모로 풀어낸다 (겹받침·겹모음도 낱개로) */
  function jamosOfWord(w) {
    var out = [];
    HG.textToKeys(w).forEach(function (k) {
      var j = HG.KEYMAP[k];
      if (j) out.push(j);
    });
    return out;
  }

  function startErase() {
    prepare('erase');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'erasewrap';
    wrap.innerHTML =
      '<div class="ehead">' +
      '  <span id="e-left">남은 시간</span>' +
      '  <span id="e-goal"></span>' +
      '</div>' +
      '<div class="eboard" id="e-board"></div>' +
      '<div class="ehint" id="e-hint"></div>';
    st.appendChild(wrap);

    var pool = DATA.WORD_UPTO[sel.level] || DATA.WORDS;
    var n = Math.min(ERASE_WORDS[G.diff.id] || 12, pool.length);
    var picks = DATA.shuffle(pool.slice()).slice(0, n);

    var tiles = [];
    picks.forEach(function (w) {
      jamosOfWord(w).forEach(function (j) { tiles.push(j); });
    });
    G.tiles = DATA.shuffle(tiles);          // 지워진 자리는 null 로 남긴다
    G.total = G.tiles.length;
    G.cleared = 0;
    G.goal = Math.ceil(G.total * 0.5);
    G.left = ERASE_TIME[G.diff.id] || 100;
    G.dict = DATA.shuffle(pool.slice());
    G.dictSet = {};
    pool.forEach(function (w) { G.dictSet[w] = 1; });
    drawErase();
  }

  function stepErase(dt) {
    G.left -= dt;
    var le = $('e-left');
    if (le) le.textContent = '남은 시간 ' + Math.max(0, Math.ceil(G.left)) + '초';
    $('g-prog').style.width = Math.min(100, G.cleared / G.goal * 100) + '%';

    if (G.cleared >= G.goal) {
      gameOver('🏆 목표를 채웠어요! ' + Math.round(G.cleared / G.total * 100) + '% 지움', true);
      return;
    }
    if (G.left <= 0) {
      var pct = Math.round(G.cleared / G.total * 100);
      gameOver(pct >= 50 ? '🏆 ' + pct + '% 지웠어요' : '시간 종료 · ' + pct + '% 지웠어요', pct >= 50);
    }
  }

  /** 지금 판으로 지울 수 있는 낱말 하나 */
  function findErasable() {
    var have = {};
    G.tiles.forEach(function (j) { if (j) have[j] = (have[j] || 0) + 1; });
    for (var i = 0; i < G.dict.length; i++) {
      var need = jamosOfWord(G.dict[i]);
      if (!need.length) continue;
      var want = {}, ok = true;
      need.forEach(function (j) { want[j] = (want[j] || 0) + 1; });
      for (var j in want) { if ((have[j] || 0) < want[j]) { ok = false; break; } }
      if (ok) return G.dict[i];
    }
    return null;
  }

  function drawErase() {
    var b = $('e-board');
    if (!b) return;
    b.innerHTML = G.tiles.map(function (j) {
      return j
        ? '<span class="etile">' + esc(j) + '</span>'
        : '<span class="etile gone"></span>';
    }).join('');
    var g = $('e-goal');
    if (g) g.innerHTML = '지운 자모 <b>' + G.cleared + '</b> / 목표 ' + G.goal +
      ' <span class="dim">(전체 ' + G.total + ')</span>';
    showEraseHint();
  }

  function showEraseHint() {
    var h = $('e-hint');
    if (!h) return;
    var w = findErasable();
    if (!w) { h.innerHTML = '<span class="dim">더 지울 낱말이 없어요</span>'; return; }
    var d = G.diff.id;
    if (d === 'first' || d === 'easy') {
      h.innerHTML = '이런 낱말을 칠 수 있어요 → <b>' + esc(w) + '</b>';
    } else if (d === 'normal') {
      h.innerHTML = '<b>' + esc(w[0]) + '</b> 로 시작하는 낱말을 칠 수 있어요';
    } else {
      h.innerHTML = '<span class="dim">판을 보고 낱말을 찾아 치세요</span>';
    }
  }

  function eraseInput(v, commit) {
    var input = $('gamein');
    if (!commit) { input.style.borderColor = ''; return; }
    var w = v.trim();
    if (!w) return;

    if (!G.dictSet[w]) { badErase('이 단계 낱말 목록에 없어요'); return; }

    var need = jamosOfWord(w);
    var have = {};
    G.tiles.forEach(function (j) { if (j) have[j] = (have[j] || 0) + 1; });
    var want = {}, missing = null;
    need.forEach(function (j) { want[j] = (want[j] || 0) + 1; });
    for (var j in want) { if ((have[j] || 0) < want[j]) { missing = j; break; } }
    if (missing) { badErase('판에 ' + missing + ' 이(가) 모자라요'); return; }

    // 같은 자모가 여러 개면 그 중 아무거나 하나를 지운다
    need.forEach(function (jm) {
      var idxs = [];
      for (var i = 0; i < G.tiles.length; i++) if (G.tiles[i] === jm) idxs.push(i);
      if (!idxs.length) return;
      G.tiles[idxs[Math.floor(Math.random() * idxs.length)]] = null;
    });

    G.cleared += need.length;
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    G.score += Math.round(need.length * 20 * (1 + Math.min(G.combo, 15) * 0.05));
    G.keys += HG.textToKeys(w).length;
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;
    input.style.borderColor = '';
    flashItem({ icon: '✦', name: w + ' 지움', color: '#3ee0c0' });
    clearInput();
    drawErase();
  }

  function badErase(msg) {
    var input = $('gamein');
    input.style.borderColor = 'var(--warn)';
    G.errors++;
    breakCombo();
    var h = $('e-hint');
    if (h) h.innerHTML = '<span style="color:var(--warn)">' + esc(msg) + '</span>';
    setTimeout(function () { if (G && G.running) showEraseHint(); }, 1500);
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
    // 공격 2초 전부터 기를 모은다 — 예고가 있어야 긴장이 생긴다
    var wind = period - 2;
    if (!G.charging && G.atkAcc >= wind) {
      G.charging = true;
      var bico = $('s-bico');
      if (bico) bico.classList.add('charge');
    }

    G.atkAcc += dt;
    if (G.atkAcc >= period) {
      G.atkAcc = 0;
      G.charging = false;
      bossAttack();
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

  /* ---------- 보스 공격 연출 ---------- */
  function shakeStage(ms) {
    var st = $('stage');
    if (!st) return;
    st.classList.add('shake');
    setTimeout(function () { st.classList.remove('shake'); }, ms || 420);
  }

  function bossAttack() {
    var e = ELEMS[G.elem];
    G.myHp -= 12;
    breakCombo();

    var st = $('stage');
    var bico = $('s-bico');
    if (bico) {
      bico.classList.remove('charge');
      bico.classList.add('roar');
      setTimeout(function () { if (bico) bico.classList.remove('roar'); }, 620);
    }

    // 보스 입에서 화면 아래로 뻗어 나가는 숨결
    if (st) {
      var breath = document.createElement('div');
      breath.className = 'breath ' + G.elem;
      breath.style.setProperty('--ec', e.color);
      breath.innerHTML = e.icon + e.icon + e.icon;
      st.appendChild(breath);
      setTimeout(function () { breath.remove(); }, 800);

      // 화면 전체가 그 속성 색으로 번쩍
      var flash = document.createElement('div');
      flash.className = 'hitflash';
      flash.style.setProperty('--ec', e.color);
      st.appendChild(flash);
      setTimeout(function () { flash.remove(); }, 520);
    }
    shakeStage(520);
    flashItem({ icon: '💢', name: e.name + ' 공격 · 12 피해', color: '#ff6b81' });
  }

  function spellHit(item) {
    var weak = weakness(G.elem);
    var strong = item.elem === weak;
    var dmg = strong ? 22 : 7;
    G.bossHp -= dmg;

    // 내 주문이 보스에게 날아가는 연출
    var st = $('stage');
    if (st) {
      var bolt = document.createElement('div');
      bolt.className = 'bolt' + (strong ? ' strong' : '');
      bolt.style.setProperty('--ec', ELEMS[item.elem].color);
      bolt.textContent = ELEMS[item.elem].icon;
      st.appendChild(bolt);
      setTimeout(function () { bolt.remove(); }, 520);
    }
    var bico = $('s-bico');
    if (bico) {
      bico.classList.add(strong ? 'bighit' : 'hit');
      setTimeout(function () {
        if (bico) bico.classList.remove('bighit', 'hit');
      }, strong ? 560 : 320);
    }
    if (strong) shakeStage(380);

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

    // 몰릴수록 커지고 붉어진다
    var bico = $('s-bico');
    if (bico) {
      var rage = G.bossHp <= 35;
      bico.classList.toggle('rage', rage);
      bico.style.setProperty('--grow', (1 + (100 - G.bossHp) / 100 * 0.35).toFixed(3));
      bico.style.setProperty('--ec', e.color);
    }
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
    else if (id === 'erase') startErase();
    else if (id === 'spell') startSpell();
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
