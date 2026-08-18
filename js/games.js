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
    erase: '낱말 맞추기', spell: '마법사 주문',
    // 학생이 종이 기획서로 설계한 게임 (game_vibe/ 의 PDF 참고)
    flip: '타자 판뒤집기', dig: '과자 캐기', fire: '폭죽 놀이'
  };
  /* 학생 게임의 기획 모둠 — 크레딧은 기획서 원문 그대로 */
  var STUDENT_CREDIT = { flip: '남자팀', dig: '쭈꾸미', fire: '3학년 아이들' };

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
    // 학생 게임은 단계(자리표) 제한 없이 전체 낱말을 쓴다
    if (G && G.student) {
      var all = DATA.WORDS;
      if (G.shortWords) {
        var ss = all.filter(function (w) { return keyLen(w) <= 8; });
        if (ss.length > 25) return ss;
      }
      return all;
    }
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
  /* introHtml 을 주면 카운트다운 전에 인트로 화면을 한 장 띄운다 (엔터로 넘어간다) */
  function prepare(gameId, introHtml) {
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
    var go = function () {
      G.running = true;
      G.startAt = Date.now();
      G.lastT = performance.now();
      G.raf = requestAnimationFrame(loop);
      input.focus();
    };
    if (introHtml) intro(introHtml, function () { countdown(go); });
    else countdown(go);
  }

  /* 게임 화면 위에 인트로 한 장. 엔터·스페이스·클릭으로 넘어간다 */
  function intro(html, done) {
    var st = $('stage');
    var ov = document.createElement('div');
    ov.className = 'gintro';
    ov.innerHTML = html;
    st.appendChild(ov);
    // 게임 쪽이 판(동굴·봉지)을 다 그린 뒤에 맨 위로 다시 올린다
    setTimeout(function () { if (ov.parentNode) ov.parentNode.appendChild(ov); }, 0);

    var closed = false;
    var next = function () {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      if (G) G._introKey = null;
      ov.classList.add('out');
      setTimeout(function () { ov.remove(); }, 260);
      done();
    };
    var onKey = function (e) {
      // 입력창이 포커스를 가진 채로 엔터가 오면 게임 쪽 처리로 새지 않게 막는다
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); next(); }
    };
    document.addEventListener('keydown', onKey, true);
    G._introKey = onKey;
    ov.onclick = next;
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
    if (G._introKey) document.removeEventListener('keydown', G._introKey, true);
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
    else if (G.id === 'flip') stepFlip(dt);
    else if (G.id === 'dig') stepDig(dt);
    else if (G.id === 'fire') stepFire(dt);

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

    /* 한글 IME 는 입력창을 비운 뒤에 조합 중이던 글자를 뒤늦게 밀어 넣는다.
       그래서 "낙지" 를 맞히고 나면 "지" 가 남아 다음 낱말이 "지알다" 가 됐다.
       방금 처리한 낱말의 꼬리 글자가 조합이 끝난 채로 혼자 들어오면 걷어낸다. */
    if (G.tail && performance.now() < G.tailUntil) {
      if (!composing && v && G.tail.indexOf(v) >= 0) {
        input.value = '';
        G.tail = '';
        return;
      }
      if (v && v !== G.tail) G.tail = '';      // 새로 치기 시작했으면 감시를 푼다
    }

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
      var done = best.word;
      hit(best);
      clearInput(done);
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

  /** 낱말을 처리한 뒤 입력창을 비운다.
      뒤늦게 들어올 수 있는 조합 잔여 글자를 걷어내려고 꼬리를 기억해 둔다. */
  function clearInput(word) {
    var el = $('gamein');
    G.locked = true;
    el.value = '';
    G.tail = word ? String(word).slice(-2) : '';
    G.tailUntil = performance.now() + 700;
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
    // 폭죽 놀이는 점수 규칙이 다르고(+5점 고정) 폭탄 판정이 있어서 따로 처리한다
    if (G.id === 'fire') { fireHit(item); return; }
    addScore(item.word);
    if (G.id === 'defense') killFalling(item);
    else if (G.id === 'race') raceHit(item);
    else if (G.id === 'mole') moleHit(item);
    else if (G.id === 'spell') spellHit(item);
    else if (G.id === 'flip') flipHit(item);
    else if (G.id === 'dig') digHit(item);
  }

  function draw() {
    if (!G) return;
    if (G.id === 'defense') drawDefense();
    else if (G.id === 'mole') drawMole();
    else if (G.id === 'race') drawRaceWord();
    else if (G.id === 'spell') drawSpell();
    else if (G.id === 'flip') drawFlip();
    else if (G.id === 'dig') drawDig();
    else if (G.id === 'fire') drawFire();
  }

  /** 낱말을 "친 부분 / 남은 부분" 으로 나눠 그린다 */
  function wordHtml(item) {
    var w = item.word, n = item.lock ? item.matched : 0;
    return '<span class="hit">' + esc(w.slice(0, n)) + '</span>' + esc(w.slice(n));
  }

  /* =========================================================
     1) 낱말 방어전
     ========================================================= */
  var DEF_TIME = 120;    // "언제 끝나요?" — 2분 버티면 승리

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

    var tm = document.createElement('div');
    tm.className = 'deftime';
    tm.id = 'def-time';
    tm.textContent = '남은 시간 ' + DEF_TIME + '초';
    st.appendChild(tm);

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
    // 시간을 다 버티면 승리
    var leftSec = Math.max(0, DEF_TIME - G.elapsed);
    var te = $('def-time');
    if (te) te.textContent = '남은 시간 ' + Math.ceil(leftSec) + '초';
    $('g-prog').style.width = Math.min(100, G.elapsed / DEF_TIME * 100) + '%';
    if (G.elapsed >= DEF_TIME) { gameOver('🏆 2분을 버텨냈어요! 방어 성공', true); return; }

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
          G.hp -= (window.CLOUD ? CLOUD.perks().defenseDmg : 10);   // 레벨 특전: 피해 감소
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
    // 위쪽 진행바는 남은 시간이 담당한다 (stepDefense)
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
    if (G.elapsed > 5) G.aiKeys += (G.diff.aiCpm * slow / 60) * dt
      * (window.CLOUD ? CLOUD.perks().raceSlow : 1);   // 레벨 특전: 컴퓨터 감속
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

  /* 두더지 가면을 쓴 토끼 — 귀와 흰 몸이 그대로 드러나 정체를 알 수 있다 */
  var MASKED_RABBIT_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="28" ry="6" fill="rgba(0,0,0,.35)"/>' +
    // 귀 — 가면 위로 그대로 드러나는 단서
    '  <ellipse cx="38" cy="20" rx="7" ry="20" fill="#eee7e1" transform="rotate(-10 38 20)"/>' +
    '  <ellipse cx="62" cy="20" rx="7" ry="20" fill="#eee7e1" transform="rotate(10 62 20)"/>' +
    '  <ellipse cx="38" cy="21" rx="3.4" ry="14" fill="#f2b8c6" transform="rotate(-10 38 21)"/>' +
    '  <ellipse cx="62" cy="21" rx="3.4" ry="14" fill="#f2b8c6" transform="rotate(10 62 21)"/>' +
    // 몸·머리 — 흰 토끼 그대로
    '  <path d="M24 88 C21 64 30 46 50 46 C70 46 79 64 76 88 Z" fill="#efe9e3"/>' +
    '  <ellipse cx="50" cy="52" rx="25" ry="21" fill="#f6f1ec"/>' +
    // 가면 끈
    '  <g stroke="#5c4438" stroke-width="2" stroke-linecap="round">' +
    '    <path d="M31 48 L26 45"/><path d="M69 48 L74 45"/>' +
    '  </g>' +
    // 두더지 얼굴 가면
    '  <ellipse cx="50" cy="53" rx="20" ry="16" fill="#8d7365" stroke="#5c4438" stroke-width="1.6"/>' +
    '  <ellipse cx="41" cy="58" rx="7" ry="5.5" fill="#a8897a"/>' +
    '  <ellipse cx="59" cy="58" rx="7" ry="5.5" fill="#a8897a"/>' +
    '  <ellipse cx="42" cy="48" rx="3.8" ry="4.4" fill="#2b1f19"/>' +
    '  <ellipse cx="58" cy="48" rx="3.8" ry="4.4" fill="#2b1f19"/>' +
    '  <circle cx="43.4" cy="46.4" r="1.3" fill="#fff"/>' +
    '  <circle cx="59.4" cy="46.4" r="1.3" fill="#fff"/>' +
    '  <ellipse cx="50" cy="56" rx="5" ry="3.8" fill="#e8a0a8"/>' +
    '  <rect x="47.5" y="59.8" width="5" height="4.2" rx="1" fill="#fff"/>' +
    '  <line x1="50" y1="59.8" x2="50" y2="64" stroke="#dcd2c8" stroke-width=".7"/>' +
    '</svg>';

  /* 두더지 가면을 쓴 개구리 — 튀어나온 왕눈과 초록 몸이 단서 */
  var MASKED_FROG_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="30" ry="6" fill="rgba(0,0,0,.35)"/>' +
    '  <path d="M18 88 C16 62 28 46 50 46 C72 46 84 62 82 88 Z" fill="#5aa851"/>' +
    '  <ellipse cx="50" cy="76" rx="22" ry="13" fill="#d2ea9d"/>' +
    '  <ellipse cx="50" cy="52" rx="30" ry="19" fill="#6cbe61"/>' +
    // 튀어나온 눈 — 가면 위로 드러나는 단서
    '  <circle cx="33" cy="33" r="13" fill="#6cbe61"/>' +
    '  <circle cx="67" cy="33" r="13" fill="#6cbe61"/>' +
    '  <circle cx="33" cy="32" r="9" fill="#fff"/>' +
    '  <circle cx="67" cy="32" r="9" fill="#fff"/>' +
    '  <circle cx="33" cy="33" r="5" fill="#1e2b16"/>' +
    '  <circle cx="67" cy="33" r="5" fill="#1e2b16"/>' +
    '  <circle cx="34.8" cy="31" r="1.8" fill="#fff"/>' +
    '  <circle cx="68.8" cy="31" r="1.8" fill="#fff"/>' +
    // 가면 끈
    '  <g stroke="#5c4438" stroke-width="2" stroke-linecap="round">' +
    '    <path d="M32 56 L24 53"/><path d="M68 56 L76 53"/>' +
    '  </g>' +
    // 두더지 얼굴 가면
    '  <ellipse cx="50" cy="57" rx="19" ry="13" fill="#8d7365" stroke="#5c4438" stroke-width="1.6"/>' +
    '  <ellipse cx="42" cy="61" rx="6" ry="4.6" fill="#a8897a"/>' +
    '  <ellipse cx="58" cy="61" rx="6" ry="4.6" fill="#a8897a"/>' +
    '  <ellipse cx="43" cy="53" rx="3.2" ry="3.8" fill="#2b1f19"/>' +
    '  <ellipse cx="57" cy="53" rx="3.2" ry="3.8" fill="#2b1f19"/>' +
    '  <circle cx="44.2" cy="51.6" r="1.1" fill="#fff"/>' +
    '  <circle cx="58.2" cy="51.6" r="1.1" fill="#fff"/>' +
    '  <ellipse cx="50" cy="59.5" rx="4.6" ry="3.4" fill="#e8a0a8"/>' +
    '  <rect x="47.8" y="62.6" width="4.4" height="3.8" rx="1" fill="#fff"/>' +
    '  <line x1="50" y1="62.6" x2="50" y2="66.4" stroke="#dcd2c8" stroke-width=".7"/>' +
    '</svg>';

  /* 토끼 가면을 쓴 두더지 — 갈색 몸과 손이 그대로라 두더지인 걸 알 수 있다 (쳐야 함) */
  var MOLE_RABBIT_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="30" ry="7" fill="rgba(0,0,0,.35)"/>' +
    // 가면에 달린 토끼 귀
    '  <ellipse cx="38" cy="16" rx="6" ry="16" fill="#f6f1ec" transform="rotate(-10 38 16)"/>' +
    '  <ellipse cx="62" cy="16" rx="6" ry="16" fill="#f6f1ec" transform="rotate(10 62 16)"/>' +
    '  <ellipse cx="38" cy="17" rx="2.8" ry="11" fill="#f2b8c6" transform="rotate(-10 38 17)"/>' +
    '  <ellipse cx="62" cy="17" rx="2.8" ry="11" fill="#f2b8c6" transform="rotate(10 62 17)"/>' +
    // 두더지 몸·배 — 정체의 단서
    '  <path d="M22 88 C18 58 28 38 50 38 C72 38 82 58 78 88 Z" fill="#7a6357"/>' +
    '  <path d="M34 88 C31 66 38 54 50 54 C62 54 69 66 66 88 Z" fill="#c8ad97"/>' +
    '  <ellipse cx="50" cy="40" rx="27" ry="24" fill="#8d7365"/>' +
    // 가면 끈
    '  <g stroke="#5c4438" stroke-width="2" stroke-linecap="round">' +
    '    <path d="M30 40 L25 37"/><path d="M70 40 L75 37"/>' +
    '  </g>' +
    // 토끼 얼굴 가면
    '  <ellipse cx="50" cy="40" rx="21" ry="17" fill="#f6f1ec" stroke="#ddd2c8" stroke-width="1.4"/>' +
    '  <ellipse cx="42" cy="36" rx="3.8" ry="4.4" fill="#3a2a2a"/>' +
    '  <ellipse cx="58" cy="36" rx="3.8" ry="4.4" fill="#3a2a2a"/>' +
    '  <circle cx="43.2" cy="34.6" r="1.3" fill="#fff"/>' +
    '  <circle cx="59.2" cy="34.6" r="1.3" fill="#fff"/>' +
    '  <path d="M50 45 L47 41.8 L53 41.8 Z" fill="#e08fa2"/>' +
    '  <rect x="47.5" y="46.4" width="5" height="4" rx="1" fill="#fff" stroke="#ddd2c8" stroke-width=".5"/>' +
    // 팻말 든 두더지 손
    '  <ellipse cx="24" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '  <ellipse cx="76" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '</svg>';

  /* 개구리 가면을 쓴 두더지 — 역시 갈색 몸이 단서 (쳐야 함) */
  var MOLE_FROG_SVG =
    '<svg class="msvg" viewBox="0 0 100 92" aria-hidden="true">' +
    '  <ellipse cx="50" cy="86" rx="30" ry="7" fill="rgba(0,0,0,.35)"/>' +
    // 두더지 몸·배 — 정체의 단서
    '  <path d="M22 88 C18 58 28 38 50 38 C72 38 82 58 78 88 Z" fill="#7a6357"/>' +
    '  <path d="M34 88 C31 66 38 54 50 54 C62 54 69 66 66 88 Z" fill="#c8ad97"/>' +
    '  <ellipse cx="50" cy="40" rx="27" ry="24" fill="#8d7365"/>' +
    // 가면 끈
    '  <g stroke="#5c4438" stroke-width="2" stroke-linecap="round">' +
    '    <path d="M30 42 L25 39"/><path d="M70 42 L75 39"/>' +
    '  </g>' +
    // 개구리 얼굴 가면
    '  <ellipse cx="50" cy="42" rx="21" ry="15" fill="#6cbe61" stroke="#4a9343" stroke-width="1.4"/>' +
    // 가면에 달린 왕눈
    '  <circle cx="36" cy="26" r="10" fill="#6cbe61"/>' +
    '  <circle cx="64" cy="26" r="10" fill="#6cbe61"/>' +
    '  <circle cx="36" cy="25" r="7" fill="#fff"/>' +
    '  <circle cx="64" cy="25" r="7" fill="#fff"/>' +
    '  <circle cx="36" cy="26" r="4" fill="#1e2b16"/>' +
    '  <circle cx="64" cy="26" r="4" fill="#1e2b16"/>' +
    '  <circle cx="37.4" cy="24.4" r="1.4" fill="#fff"/>' +
    '  <circle cx="65.4" cy="24.4" r="1.4" fill="#fff"/>' +
    // 콧구멍·입
    '  <circle cx="46" cy="38" r="1.4" fill="#2f6b2c"/>' +
    '  <circle cx="54" cy="38" r="1.4" fill="#2f6b2c"/>' +
    '  <path d="M37 46 Q50 55 63 46" stroke="#2f6b2c" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
    // 팻말 든 두더지 손
    '  <ellipse cx="24" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '  <ellipse cx="76" cy="66" rx="8" ry="7" fill="#7a6357"/>' +
    '</svg>';

  var CRITTERS = {
    mole: { svg: MOLE_SVG, name: '두더지', bad: false },
    /* 가면을 쓴 두더지 — 겉은 토끼·개구리지만 진짜 두더지라 쳐야 한다 */
    moleRabbit: { svg: MOLE_RABBIT_SVG, name: '토끼 가면을 쓴 두더지', bad: false, masked: true },
    moleFrog: { svg: MOLE_FROG_SVG, name: '개구리 가면을 쓴 두더지', bad: false, masked: true },
    rabbit: { svg: RABBIT_SVG, name: '토끼', bad: true },
    frog: { svg: FROG_SVG, name: '개구리', bad: true },
    /* masked: 겉모습 단서(빨간 팻말·경고 글)를 주지 않는다 — 그림만 보고 알아채야 한다 */
    maskedRabbit: { svg: MASKED_RABBIT_SVG, name: '두더지 가면을 쓴 토끼', bad: true, masked: true },
    maskedFrog: { svg: MASKED_FROG_SVG, name: '두더지 가면을 쓴 개구리', bad: true, masked: true }
  };
  var BAD_KINDS = ['rabbit', 'frog', 'maskedRabbit', 'maskedFrog'];
  var DISGUISED_MOLES = ['moleRabbit', 'moleFrog'];
  /* 두더지가 가면을 쓰고 나올 확률 (쳐야 하는 건 그대로) */
  var DISGUISE_RATE = 0.25;
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
      '<span class="bad">토끼와 개구리</span>를 치면 점수가 깎여요 · ' +
      '다들 가면을 쓰고 나오기도 해요 — 얼굴 말고 <b>몸 색</b>을 보세요! 갈색 몸이 두더지예요';
    st.appendChild(rule);
  }

  function stepMole(dt) {
    var d = G.diff;
    var ramp = 1 + Math.min(G.elapsed / 90, 1) * d.ramp;
    var life = Math.max(2.4, d.life / ramp)
      * (window.CLOUD ? CLOUD.perks().moleLife : 1);   // 레벨 특전: 낱말이 오래 보임
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

    // 가끔 치면 안 되는 동물이 나오고, 두더지도 가끔 가면을 쓰고 나온다
    var kind = 'mole';
    if (Math.random() < (BAD_RATE[G.diff.id] || 0.25)) {
      kind = BAD_KINDS[Math.floor(Math.random() * BAD_KINDS.length)];
    } else if (Math.random() < DISGUISE_RATE) {
      kind = DISGUISED_MOLES[Math.floor(Math.random() * DISGUISED_MOLES.length)];
    }
    var c = CRITTERS[kind];

    var item = {
      word: w, hole: h, t: life, life: life,
      lock: false, matched: 0, kind: kind, bad: c.bad
    };
    h.item = item;
    G.items.push(item);

    // 가면을 쓴 동물은 팻말도 두더지와 똑같다 — 경고 표시를 붙이지 않는다
    var warn = c.bad && !c.masked;
    h.moleEl.innerHTML = c.svg +
      '<div class="sign' + (warn ? ' bad' : '') + '"><div class="word"></div></div>';
    h.wordEl = h.moleEl.querySelector('.word');
    h.el.classList.toggle('badhole', warn);
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
     4) 낱말 맞추기 — 자모 카드를 보고 낱말을 알아낸다

     앞선 설계(자모를 판에 흩뿌리기)는 두 가지가 무너졌다.
     하나는 짧은 낱말만 반복해도 목표가 채워진 것, 다른 하나는
     "칠 수 있는 낱말" 힌트를 띄우니 학생이 판을 보지 않고 힌트만 읽은 것이다.

     그래서 자모를 낱말 단위 카드에 담았다. 카드에 든 자모가 딱 그 낱말 분량이라
     힌트 없이도 답이 나온다. 카드 자체가 문제다.
     ========================================================= */
  var CARD_COUNT = { first: 5, easy: 7, normal: 10, hard: 14 };
  var CARD_TIME = { first: 150, easy: 130, normal: 110, hard: 90 };
  /* 자모 자리를 몇 번 바꿀지.
     한 번에 두 자모가 서로 자리를 바꾼다. -1 이면 전부 섞는다.
     순서를 조금씩 흐트러뜨려야 난이도가 계단처럼 올라간다. */
  var CARD_MIX = { first: 1, easy: 2, normal: 4, hard: -1 };
  var MIX_NOTE = {
    first: '자모 자리가 한 군데 바뀌어 있어요',
    easy: '자모 자리가 두 군데 바뀌어 있어요',
    normal: '자모 자리가 네 군데 바뀌어 있어요',
    hard: '자모가 완전히 섞여 있어요'
  };

  /** 자모 순서를 정해진 횟수만큼 자리바꿈한다 */
  function mixJamo(list, swaps) {
    var a = list.slice();
    if (a.length < 2) return a;
    if (swaps < 0) return DATA.shuffle(a);

    for (var s = 0, guard = 0; s < swaps && guard < 200; guard++) {
      var i = Math.floor(Math.random() * a.length);
      var j = Math.floor(Math.random() * a.length);
      if (i === j || a[i] === a[j]) continue;   // 같은 자리·같은 자모면 바꿔도 티가 안 난다
      var t = a[i]; a[i] = a[j]; a[j] = t;
      s++;
    }
    return a;
  }

  /** 낱말을 기본 자모로 풀어낸다 (겹받침·겹모음도 낱개로) */
  function jamosOfWord(w) {
    var out = [];
    HG.textToKeys(w).forEach(function (k) {
      var j = HG.KEYMAP[k];
      if (j) out.push(j);
    });
    return out;
  }

  /** 자모 묶음을 견주기 좋게 정렬한 문자열로 */
  function jamoKey(list) {
    return list.slice().sort().join('');
  }

  function startErase() {
    prepare('erase');
    var st = $('stage');
    var wrap = document.createElement('div');
    wrap.className = 'cardwrap';
    wrap.innerHTML =
      '<div class="chead">' +
      '  <span id="c-left">남은 시간</span>' +
      '  <span id="c-count"></span>' +
      '</div>' +
      '<div class="cards" id="c-cards"></div>' +
      '<div class="cnote" id="c-note"></div>';
    st.appendChild(wrap);

    // 두 글자 이상만 — 한 글자는 자모 두세 개뿐이라 문제가 되지 않는다
    var pool = (DATA.WORD_UPTO[sel.level] || DATA.WORDS)
      .filter(function (w) { return w.length >= 2; });
    var n = Math.min(CARD_COUNT[G.diff.id] || 8, pool.length);
    var picks = DATA.shuffle(pool.slice()).slice(0, n);

    var swaps = CARD_MIX[G.diff.id];
    if (swaps === undefined) swaps = 2;
    G.cards = picks.map(function (w) {
      var j = jamosOfWord(w);
      return {
        word: w,
        key: jamoKey(j),
        show: mixJamo(j, swaps),
        done: false,
        hint: false
      };
    });
    G.dictSet = {};
    pool.forEach(function (w) { G.dictSet[w] = 1; });

    G.total = G.cards.length;
    G.solved = 0;
    G.left = (CARD_TIME[G.diff.id] || 110)
      + (window.CLOUD ? CLOUD.perks().eraseBonus : 0);   // 레벨 특전: 추가 시간
    G.stuck = 0;                       // 못 맞힌 채 흐른 시간
    G.note = (MIX_NOTE[G.diff.id] || '') + ' · 낱말을 알아내 치고 엔터';
    var cn = $('c-note');
    if (cn) cn.textContent = G.note;
    drawCards();
  }

  function stepErase(dt) {
    G.left -= dt;
    G.stuck += dt;

    var le = $('c-left');
    if (le) le.textContent = '남은 시간 ' + Math.max(0, Math.ceil(G.left)) + '초';
    $('g-prog').style.width = (G.solved / G.total * 100) + '%';

    // 한참 막혀 있으면 아직 못 맞힌 카드 하나에 첫 글자만 슬쩍 보여 준다
    var wait = G.diff.id === 'hard' ? 30 : G.diff.id === 'normal' ? 24 : 18;
    if (G.stuck >= wait) {
      G.stuck = 0;
      var todo = G.cards.filter(function (c) { return !c.done && !c.hint; });
      if (todo.length) {
        todo[0].hint = true;
        drawCards();
        flashItem({ icon: '💡', name: '첫 글자를 보여 줄게요', color: '#ffcc5c' });
      }
    }

    if (G.solved >= G.total) {
      gameOver('🏆 카드를 모두 맞혔어요! ' + Math.ceil(G.left) + '초 남김', true);
      return;
    }
    if (G.left <= 0) {
      gameOver((G.solved >= Math.ceil(G.total / 2) ? '🏆 ' : '시간 종료 · ') +
        G.total + '장 중 ' + G.solved + '장 맞혔어요', G.solved >= Math.ceil(G.total / 2));
    }
  }

  function drawCards() {
    var box = $('c-cards');
    if (!box) return;
    box.innerHTML = G.cards.map(function (c, i) {
      if (c.done) {
        return '<div class="wcard done"><div class="wans">' + esc(c.word) + '</div></div>';
      }
      var tiles = c.show.map(function (j) {
        return '<span class="wj">' + esc(j) + '</span>';
      }).join('');
      return '<div class="wcard' + (c.hint ? ' hinted' : '') + '">' +
        '<div class="wjs">' + tiles + '</div>' +
        '<div class="wmeta">' + c.word.length + '글자' +
        (c.hint ? ' · <b>' + esc(c.word[0]) + '</b> 로 시작' : '') +
        '</div></div>';
    }).join('');

    var cc = $('c-count');
    if (cc) cc.innerHTML = '맞힌 카드 <b>' + G.solved + '</b> / ' + G.total;
  }

  function eraseInput(v, commit) {
    var input = $('gamein');
    if (!commit) { input.style.borderColor = ''; return; }
    var w = v.trim();
    if (!w) return;

    if (w.length < 2) { badErase('두 글자 이상 낱말을 쳐 주세요'); return; }
    if (!G.dictSet[w]) { badErase('우리가 배운 낱말이 아니에요'); return; }

    // 자모 구성이 똑같은 카드를 찾는다.
    // 카드에 적힌 낱말이 아니어도, 그 자모로 만들어지는 다른 낱말이면 맞는 것으로 친다.
    var key = jamoKey(jamosOfWord(w));
    var card = null;
    for (var i = 0; i < G.cards.length; i++) {
      if (!G.cards[i].done && G.cards[i].key === key) { card = G.cards[i]; break; }
    }
    if (!card) { badErase('어느 카드와도 자모가 맞지 않아요'); return; }

    card.done = true;
    card.word = w;                       // 학생이 찾아낸 낱말로 적어 준다
    G.solved++;
    G.stuck = 0;
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    var lenBonus = 1 + (w.length - 2) * 0.35;
    G.score += Math.round(w.length * 40 * lenBonus * (1 + Math.min(G.combo, 15) * 0.05));
    G.keys += HG.textToKeys(w).length;
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;
    input.style.borderColor = '';
    flashItem({ icon: '✦', name: w + ' 맞혔어요', color: '#3ee0c0' });
    clearInput(w);
    drawCards();
  }

  function badErase(msg) {
    var input = $('gamein');
    input.style.borderColor = 'var(--warn)';
    G.errors++;
    breakCombo();
    var h = $('c-note');
    if (h) h.innerHTML = '<span style="color:var(--warn)">' + esc(msg) + '</span>';
    setTimeout(function () {
      if (G && G.running && h) h.textContent = G.note || '낱말을 알아내 치고 엔터';
    }, 1600);
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
    G.myHp -= Math.round(12 * (window.CLOUD ? CLOUD.perks().spellGuard : 1));   // 레벨 특전: 피해 감소
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
     학생이 만든 게임 3종
     여름캠프 학생들이 종이에 그린 기획서(game_vibe/*.pdf)를 그대로 옮겼다.
     기획서의 수치(판 25개, 코인 20, 도화선 10초, +5점, 목숨 3개, 제한 2분,
     판 가격 100~1000코인)는 임의로 고치지 않는다.
     단계(자리표) 제한 없이 전체 낱말을 쓴다.
     ========================================================= */

  /** 타자코인·산 판 개수 — 판뒤집기 상점용 저장 공간 */
  function stu() {
    if (!APP.rec.student) APP.rec.student = { coin: 0, boards: 0 };
    return APP.rec.student;
  }
  function renderStudent() {
    var el = $('tycoin');
    if (el) el.textContent = '🪙 ' + stu().coin;
    var b = document.querySelector('[data-best="student"]');
    if (b) b.textContent = stu().coin ? '🪙 타자코인 ' + stu().coin : '';
  }

  /** 학생 게임 선택 화면 */
  function openStudent() {
    renderStudent();
    APP.show('studentsel');
  }

  /* ---------- 1) 타자 판뒤집기 (기획 · 남자팀) ---------- */
  var FLIP_START = 25;        // 기획서: 각 팀에 판 25개씩
  var FLIP_WIN_COIN = 20;     // 기획서: 승리하면 타자코인 20

  function startFlip() {
    prepare('flip');
    G.student = true;
    G.shortWords = true;      // 판이 작아서 짧은 낱말 위주
    $('game-lv').textContent = '학생 게임 · 기획 남자팀';

    var st = $('stage');
    var bar = document.createElement('div');
    bar.className = 'flipbar';
    bar.innerHTML = '<span class="me">나 0</span>' +
      '<div class="meter"><i id="f-meter"></i></div>' +
      '<span class="ai">컴퓨터 0</span>' +
      '<span class="timeleft" id="f-time"></span>';
    st.appendChild(bar);

    var wrap = document.createElement('div');
    wrap.className = 'flipwrap';
    st.appendChild(wrap);

    // 상점에서 산 판만큼 내 판이 많은 상태로 시작한다 (기획서 원문)
    var extra = Math.min(stu().boards, 10);
    var owners = [];
    var total = FLIP_START * 2 + extra;
    for (var i = 0; i < total; i++) owners.push(i < FLIP_START + extra ? 'me' : 'ai');
    for (var s = owners.length - 1; s > 0; s--) {
      var r = Math.floor(Math.random() * (s + 1));
      var tmp = owners[s]; owners[s] = owners[r]; owners[r] = tmp;
    }

    var used = [];
    G.panels = [];
    owners.forEach(function (o) {
      var w = randWord(used); used.push(w);
      var el = document.createElement('div');
      wrap.appendChild(el);
      G.panels.push({ word: w, owner: o, box: false, el: el, lock: false, matched: 0, dead: false });
    });

    // 기획서: 제한시간은 10분 내로 랜덤 결정된다 → 수업용으로 1분30초~3분 사이 랜덤
    G.timeLimit = 90 + Math.floor(Math.random() * 90);
    G.aiAcc = 0;
    G.boxAcc = 0;
    G.bonusGiven = false;
    syncFlipItems();
    drawFlip();
  }

  function syncFlipItems() {
    // 칠 수 있는 것 = 컴퓨터 판(랜덤박스 포함). 내 판은 쳐도 변화 없음
    G.items = G.panels.filter(function (p) { return p.owner === 'ai'; });
  }
  function countOwner(o) {
    var n = 0;
    for (var i = 0; i < G.panels.length; i++) if (G.panels[i].owner === o) n++;
    return n;
  }
  function popPanel(p) {
    p.el.classList.add('pop');
    setTimeout(function () { p.el.classList.remove('pop'); }, 200);
  }

  function stepFlip(dt) {
    // 컴퓨터가 내 판을 빼앗아 간다 — 시간이 갈수록 조금씩 빨라진다
    // (처음 치는 아이가 10낱말/분 정도인 걸 감안해 컴퓨터는 그보다 느리게 시작)
    var gap = Math.max(4.5, 7.0 - G.elapsed / 60);
    G.aiAcc += dt;
    if (G.aiAcc >= gap) {
      G.aiAcc = 0;
      var mine = G.panels.filter(function (p) { return p.owner === 'me'; });
      if (mine.length) {
        var p = mine[Math.floor(Math.random() * mine.length)];
        p.owner = 'ai'; p.box = false; p.lock = false;
        popPanel(p);
        syncFlipItems();
        drawFlip();
      }
    }
    // 기획서: 중간에 곳곳에 상자 판이 나온다
    G.boxAcc += dt;
    if (G.boxAcc >= 12) {
      G.boxAcc = 0;
      var ais = G.panels.filter(function (p) { return p.owner === 'ai' && !p.box; });
      if (ais.length) {
        ais[Math.floor(Math.random() * ais.length)].box = true;
        drawFlip();
      }
    }

    var left = Math.max(0, G.timeLimit - G.elapsed);
    $('g-prog').style.width = Math.min(100, G.elapsed / G.timeLimit * 100) + '%';
    var ft = $('f-time');
    if (ft) ft.textContent = Math.ceil(left) + '초';

    if (left <= 0) {
      var me = countOwner('me'), ai = countOwner('ai');
      if (me === ai && !G.bonusGiven) {
        // 기획서: 판 개수가 같다면 보너스 시간이 랜덤으로 주어진다
        G.bonusGiven = true;
        G.timeLimit += 6 + Math.floor(Math.random() * 10);
        flashItem({ icon: '⏱', name: '동점! 보너스 시간', color: '#ffcc5c' });
      } else {
        flipEnd(me, ai);
      }
    }
  }

  function flipHit(item) {
    item.lock = false;
    if (item.box) {
      // 기획서: 상자 판을 치면 상대 판 중 n개를 랜덤으로 가져온다
      var n = 2 + Math.floor(Math.random() * 3);
      item.box = false; item.owner = 'me'; popPanel(item);
      var ais = G.panels.filter(function (p) { return p.owner === 'ai'; });
      var got = 0;
      for (var i = 0; i < n && ais.length; i++) {
        var k = Math.floor(Math.random() * ais.length);
        var p = ais.splice(k, 1)[0];
        p.owner = 'me'; p.box = false; p.lock = false;
        popPanel(p); got++;
      }
      flashItem({ icon: '🎁', name: '랜덤박스! 컴퓨터 판 ' + got + '개 획득', color: '#ffcc5c' });
    } else {
      item.owner = 'me';
      popPanel(item);
    }
    syncFlipItems();
    drawFlip();
  }

  function flipEnd(me, ai) {
    var win = me > ai;
    if (win) {
      stu().coin += FLIP_WIN_COIN;   // 기획서: 승리하면 타자코인 20
      APP.save();
      renderStudent();
    }
    var msg = win ? '🏆 ' + me + ' : ' + ai + ' — 이겼어요! 타자코인 +' + FLIP_WIN_COIN
      : me === ai ? me + ' : ' + ai + ' — 무승부'
        : me + ' : ' + ai + ' — 컴퓨터가 이겼어요';
    gameOver(msg, win);
  }

  function drawFlip() {
    if (!G || G.id !== 'flip') return;
    var me = 0, ai = 0;
    G.panels.forEach(function (p) {
      if (p.owner === 'me') me++; else ai++;
      p.el.className = 'fpanel ' + p.owner + (p.box ? ' box' : '') + (p.lock ? ' lock' : '');
      p.el.innerHTML = (p.box ? '🎁 ' : '') + wordHtml(p);
    });
    var bar = $('stage').querySelector('.flipbar');
    if (bar) {
      bar.querySelector('.me').textContent = '나 ' + me;
      bar.querySelector('.ai').textContent = '컴퓨터 ' + ai;
      var m = $('f-meter');
      if (m) m.style.width = (me / (me + ai) * 100) + '%';
    }
  }

  /* ---------- 2) 과자 캐기 (기획 · 쭈꾸미) ---------- */
  var DIG_COUNT = 14;
  var DIG_GEM_RATE = 0.18;     // 기획서: 운이 좋으면 가끔 보석
  var DIG_GEM_BONUS = 50;
  var BAG_ICONS = ['🍪', '🍬', '🍭', '🍫', '🍿', '🧁', '🍩', '🥨'];
  /* 봉지 색 — 기획서 디자인2의 색연필 봉지들(하늘·주황·초록·빨강·노랑) */
  var BAG_COLORS = [
    ['#7ec8e3', '#5aa8c6'], ['#f5a25d', '#d97f3c'], ['#67c587', '#46a366'],
    ['#e5726f', '#c14f4c'], ['#f2d15a', '#d4ac35'], ['#b48ce0', '#9067c4']
  ];
  /* 호미 — 이모지가 없어서 직접 그렸다. 나무 자루 + 굽은 쇠날 */
  var HOE_SVG =
    '<svg viewBox="0 0 60 60" aria-hidden="true">' +
    '  <rect x="44" y="2" width="7" height="38" rx="3.5" fill="#a8734b" transform="rotate(28 47.5 21)"/>' +
    '  <rect x="44" y="2" width="3" height="38" rx="1.5" fill="#c99569" transform="rotate(28 47.5 21)"/>' +
    '  <path d="M34 36 C20 34 10 40 6 52 C16 48 24 50 32 56 C38 50 40 42 34 36 Z" fill="#5a6472"/>' +
    '  <path d="M34 36 C24 35 15 39 10 47 C18 44 26 46 32 51 C36 46 37 40 34 36 Z" fill="#7b8694"/>' +
    '</svg>';
  /* 봉지에는 진짜 과자 이름이 적혀 있다 — 기획서 디자인2가 실제 과자 봉지 그림이었다.
     (포카칩·바나나킥·누룽지팝은 기획서에 그려진 것) */
  var SNACK_NAMES = [
    '포카칩', '바나나킥', '새우깡', '누룽지팝', '꼬깔콘', '홈런볼', '초코파이', '오징어집',
    '양파링', '콘칩', '맛동산', '죠리퐁', '빼빼로', '칸쵸', '웨하스', '몽쉘',
    '오예스', '에이스', '계란과자', '별뽀빠이', '조청유과', '감자깡', '고구마깡', '자갈치',
    '꿀꽈배기', '캐러멜콘', '치즈볼', '쌀로별'
  ];

  /* 인트로 그림은 기획서 2쪽 "3. 디자인" 을 그대로 옮긴 것이다 (img/dig-intro.svg) */
  var DIG_INTRO =
    '<img class="gintro-art" src="img/dig-intro.svg" alt="">' +
    '<div class="gintro-box">' +
    '  <p class="gintro-by">학생이 만든 게임 · 기획 쭈꾸미</p>' +
    '  <h2>과자 캐기</h2>' +
    '  <p class="gintro-desc">동굴에 도둑이 숨긴 과자가 있어요.<br>' +
    '     봉지에 적힌 과자 이름을 치면 호미로 캡니다. ' + DIG_COUNT + '개를 다 캐면 끝!</p>' +
    '  <p class="gintro-hint">💎 운이 좋으면 보석이 나와요 (+' + DIG_GEM_BONUS + '점)</p>' +
    '  <p class="gintro-go">엔터를 누르면 시작해요</p>' +
    '</div>';

  function startDig() {
    prepare('dig', DIG_INTRO);
    G.student = true;
    $('game-lv').textContent = '학생 게임 · 기획 쭈꾸미';

    var st = $('stage');
    var cave = document.createElement('div');
    cave.className = 'cave';
    st.appendChild(cave);
    G.cave = cave;

    // 동굴 벽을 따라 봉지가 삐죽 나와 있다 (기획서 그림)
    var slots = [
      [14, 18], [36, 14], [58, 13], [80, 18], [92, 36],
      [8, 40], [90, 60], [10, 64], [22, 84], [42, 88],
      [64, 87], [84, 80], [30, 42], [70, 40]
    ];
    // 과자 이름을 섞어서 14개 뽑는다
    var names = SNACK_NAMES.slice();
    for (var s = names.length - 1; s > 0; s--) {
      var r = Math.floor(Math.random() * (s + 1));
      var t = names[s]; names[s] = names[r]; names[r] = t;
    }

    G.items = [];
    for (var i = 0; i < DIG_COUNT; i++) {
      var w = names[i];
      var el = document.createElement('div');
      el.className = 'snack';
      var x = slots[i][0] + (Math.random() * 4 - 2);
      var y = slots[i][1] + (Math.random() * 4 - 2);
      el.style.left = x + '%';
      el.style.top = y + '%';
      el.style.setProperty('--rot', (Math.random() * 24 - 12).toFixed(1) + 'deg');
      var bc = BAG_COLORS[i % BAG_COLORS.length];
      el.style.setProperty('--bagc', bc[0]);
      el.style.setProperty('--bagc-d', bc[1]);
      el.innerHTML = '<div class="bagico">' + BAG_ICONS[i % BAG_ICONS.length] + '</div>' +
        '<div class="sword"></div>';
      cave.appendChild(el);
      G.items.push({
        word: w, el: el, wEl: el.querySelector('.sword'),
        x: x, y: y, lock: false, matched: 0, dead: false
      });
    }
    G.dug = 0;
    drawDig();
  }

  function stepDig() {
    $('g-prog').style.width = (G.dug / DIG_COUNT * 100) + '%';
  }

  function digHit(item) {
    item.dead = true;
    G.dug++;

    var cave = G.cave, x = item.x, y = item.y;

    // 호미가 날아와 두 번 내려찍고, 그다음 봉지가 뽑혀 나온다
    var hoe = document.createElement('div');
    hoe.className = 'hoe';
    hoe.innerHTML = HOE_SVG;
    hoe.style.left = x + '%';
    hoe.style.top = y + '%';
    cave.appendChild(hoe);
    setTimeout(function () { hoe.remove(); }, 1050);

    (function (el) {
      setTimeout(function () { el.classList.add('dug'); }, 320);
      setTimeout(function () { el.remove(); }, 1000);
    })(item.el);

    if (Math.random() < DIG_GEM_RATE) {
      G.score += DIG_GEM_BONUS;
      $('g-score').textContent = G.score;
      // 보석이 캐낸 자리에서 반짝이며 튀어나온다
      setTimeout(function () {
        if (!cave.parentNode) return;
        var gem = document.createElement('div');
        gem.className = 'gempop';
        gem.innerHTML = '💎<span class="gtag">보석 +' + DIG_GEM_BONUS + '</span>';
        gem.style.left = x + '%';
        gem.style.top = y + '%';
        cave.appendChild(gem);
        for (var s = 0; s < 3; s++) {
          var sp = document.createElement('div');
          sp.className = 'gemspark';
          sp.textContent = '✨';
          sp.style.left = (x + (Math.random() * 10 - 5)) + '%';
          sp.style.top = (y + (Math.random() * 8 - 4)) + '%';
          cave.appendChild(sp);
          (function (e) { setTimeout(function () { e.remove(); }, 950); })(sp);
        }
        setTimeout(function () { gem.remove(); }, 1650);
      }, 480);
      flashItem({ icon: '💎', name: '보석을 캤어요! +' + DIG_GEM_BONUS, color: '#5ad4e6' });
    }

    G.items = G.items.filter(function (it) { return it !== item; });
    if (!G.items.length) {
      G.dug = DIG_COUNT;
      stepDig();
      gameOver('⛏️ 동굴의 과자를 다 캤어요! ' + Math.round(G.elapsed) + '초', true);
      return;
    }
    drawDig();
  }

  function drawDig() {
    if (!G || G.id !== 'dig') return;
    G.items.forEach(function (it) {
      it.wEl.innerHTML = wordHtml(it);
      it.el.classList.toggle('lock', !!it.lock);
    });
  }

  /* ---------- 3) 폭죽 놀이 (기획 · 3학년 아이들) ---------- */
  var FIRE_TIME = 120;    // 기획서: 제한시간 2분
  var FIRE_FUSE = 10;     // 기획서: 불이 폭죽에 닿을 때까지 10초
  var FIRE_POINT = 5;     // 기획서: 낱말을 쓰면 +5점
  var FIRE_LIVES = 3;     // 기획서: 목숨 3개

  function startFire() {
    prepare('fire');
    G.student = true;
    $('game-lv').textContent = '학생 게임 · 기획 3학년 아이들';

    var st = $('stage');
    var sky = document.createElement('div');
    sky.className = 'fwsky';
    sky.innerHTML = '<div class="fwground"></div><div class="fwlives" id="fw-lives"></div>';
    st.appendChild(sky);
    G.sky = sky;
    G.lives = FIRE_LIVES;
    G.spawnDelay = 0.6;
    drawLives();
  }

  function drawLives() {
    var el = $('fw-lives');
    if (!el) return;
    var h = '';
    for (var i = 0; i < FIRE_LIVES; i++) h += i < G.lives ? '❤️' : '🖤';
    el.textContent = h;
  }

  function makeRocket(w, x, bomb) {
    var el = document.createElement('div');
    el.className = 'rocket' + (bomb ? ' bombitem' : '');
    el.style.left = x + '%';
    el.innerHTML =
      (bomb ? '<div class="warns">쓰지 마시오!</div>' : '') +
      '<div class="rico">' + (bomb ? '💣' : '🧨') + '</div>' +
      '<div class="rword"></div>' +
      '<div class="fuse"><i></i></div>';
    G.sky.appendChild(el);
    return {
      word: w, el: el, wEl: el.querySelector('.rword'), fuseEl: el.querySelector('.fuse i'),
      t: FIRE_FUSE, bomb: bomb, x: x, lock: false, matched: 0, dead: false
    };
  }

  function spawnFire() {
    var used = G.items.map(function (i) { return i.word; });
    var w = randWord(used);
    var x = 25 + Math.random() * 40;
    G.items.push(makeRocket(w, x, false));
    // 기획서: 또 폭탄이 있는데, 폭탄의 낱말은 쓰면 안 된다
    if (Math.random() < 0.35) {
      used.push(w);
      G.items.push(makeRocket(randWord(used), x < 45 ? x + 30 : x - 30, true));
    }
    drawFire();
  }

  function stepFire(dt) {
    // 기획서: 폭죽이 하나씩 나온다
    if (!G.items.length) {
      G.spawnDelay -= dt;
      if (G.spawnDelay <= 0) { G.spawnDelay = 0.8; spawnFire(); }
    }
    for (var i = G.items.length - 1; i >= 0; i--) {
      var it = G.items[i];
      it.t -= dt;
      it.fuseEl.style.width = Math.max(0, it.t / FIRE_FUSE * 100) + '%';
      if (it.t <= 0) {
        it.el.remove();
        G.items.splice(i, 1);
        if (!it.bomb) {
          // 기획서: 낱말을 안 쓰면 목숨이 하나 없어진다
          G.lives--;
          breakCombo();
          drawLives();
          shakeStage(380);
          flashItem({ icon: '💥', name: '불이 닿았어요! 목숨 -1', color: '#ff6b81' });
          if (G.lives <= 0) { fireEnd(false); return; }
        }
      }
    }
    var left = Math.max(0, FIRE_TIME - G.elapsed);
    $('g-prog').style.width = Math.min(100, G.elapsed / FIRE_TIME * 100) + '%';
    if (left <= 0) { fireEnd(G.lives > 0); return; }
  }

  function fireHit(item) {
    G.items = G.items.filter(function (i) { return i !== item; });
    if (item.bomb) {
      // 기획서: 폭탄에 있는 낱말을 쓰면 목숨 두 개가 없어진다
      item.el.remove();
      G.lives -= 2;
      breakCombo();
      drawLives();
      shakeStage(500);
      flashItem({ icon: '💣', name: '폭탄이었어요! 목숨 -2', color: '#ff6b81' });
      if (G.lives <= 0) fireEnd(false);
      return;
    }
    // 기획서: 성공하면 +5점
    G.score += FIRE_POINT;
    G.keys += keyLen(item.word);
    G.combo++;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;
    $('g-score').textContent = G.score;
    $('g-combo').textContent = G.combo;

    // 폭죽이 날아올라 하늘에서 터진다
    item.el.classList.add('launch');
    var el = item.el;
    setTimeout(function () { el.remove(); }, 750);
    var burst = document.createElement('div');
    burst.className = 'fwburst';
    burst.textContent = ['🎆', '🎇', '✨'][Math.floor(Math.random() * 3)];
    burst.style.left = item.x + '%';
    burst.style.top = (12 + Math.random() * 25) + '%';
    var sky = G.sky;
    setTimeout(function () {
      if (!sky.parentNode) return;
      sky.appendChild(burst);
      setTimeout(function () { burst.remove(); }, 950);
    }, 450);
  }

  function fireEnd(survived) {
    drawLives();
    gameOver(survived ? '🎆 끝까지 살아남았어요! 폭죽 놀이 끝' : '폭죽 놀이 끝', survived);
  }

  function drawFire() {
    if (!G || G.id !== 'fire') return;
    G.items.forEach(function (it) {
      it.wEl.innerHTML = wordHtml(it);
      it.el.classList.toggle('lock', !!it.lock);
    });
  }

  /* ---------- 판 상점 (기획서의 Shop 화면) ---------- */
  function openShop() {
    var s = stu();
    var back = document.createElement('div');
    back.className = 'shop-back';
    var items = '';
    for (var i = 1; i <= 10; i++) {
      var price = i * 100;    // 기획서: 판 1개 100코인 … 판 10개 1000코인
      var cls = i <= s.boards ? ' owned' : (i === s.boards + 1 ? '' : ' locked');
      items += '<div class="shop-item' + cls + '">' +
        '<div class="no">' + i + '번째 판</div>' +
        '<div class="price">' + (i <= s.boards ? '내 것!' : price + ' 코인') + '</div>' +
        (i === s.boards + 1
          ? '<button class="btn sm primary" data-buy="' + i + '"' + (s.coin < price ? ' disabled' : '') + '>사기</button>'
          : '') +
        '</div>';
    }
    back.innerHTML =
      '<div class="shop"><h3>🪙 판 상점</h3>' +
      '<p class="desc">판뒤집기에서 이기면 타자코인 <b>20개</b>를 받아요. 판을 사면 다음 판뒤집기를 ' +
      '<b>내 판이 더 많은 상태</b>로 시작합니다. 판은 순서대로만 살 수 있고 최대 10개까지예요. (기획 · 남자팀)</p>' +
      '<div class="shop-grid">' + items + '</div>' +
      '<div class="shop-foot"><span class="tycoin">🪙 ' + s.coin + '</span><div class="spacer"></div>' +
      '<button class="btn" id="shop-close">닫기</button></div></div>';
    document.body.appendChild(back);
    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.id === 'shop-close') { back.remove(); return; }
      var buy = e.target.getAttribute && e.target.getAttribute('data-buy');
      if (buy) {
        var n = parseInt(buy, 10), cost = n * 100;
        if (s.coin >= cost && n === s.boards + 1) {
          s.coin -= cost;      // 기획서: 판을 사면 돈은 없어진다
          s.boards = n;
          APP.save();
          renderStudent();
          back.remove();
          openShop();
        }
      }
    });
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

    var key = G.student ? G.id + '_student' : G.id + '_' + G.level.no + '_' + G.diff.id;
    var prev = APP.rec.games[key] || 0;
    var isNew = G.score > prev;
    if (isNew) { APP.rec.games[key] = G.score; APP.save(); }

    var acc = G.keys + G.errors > 0
      ? Math.round(G.keys / (G.keys + G.errors) * 100) : 100;

    APP.logGame({
      game: G.id, name: GAME_NAME[G.id],
      level: G.student ? '-' : G.level.no,
      diff: G.student ? 'student' : G.diff.id,
      diffName: G.student ? '학생 게임' : G.diff.name,
      score: G.score, cpm: G.cpm || 0, acc: acc,
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

    var id = G.id, wasStudent = !!G.student;
    $('go-again').onclick = function () { start(id); };
    // 학생 게임은 학생 게임 선택 화면으로 돌아간다
    $('go-sel').onclick = function () { stop(); if (wasStudent) openStudent(); else openSelect(); };
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
    else if (id === 'flip') startFlip();
    else if (id === 'dig') startDig();
    else if (id === 'fire') startFire();
  }

  function init() {
    document.querySelectorAll('.game-card').forEach(function (b) {
      b.onclick = function () { start(b.dataset.game); };
    });
    // 학생이 만든 게임 — 홈 섹션 카드에서 바로 시작 (기획서 링크는 제외)
    document.querySelectorAll('.sgame-card').forEach(function (c) {
      c.onclick = function (e) {
        if (e.target.closest && e.target.closest('a')) return;
        start(c.dataset.sgame);
      };
    });
    var shopBtn = $('btn-shop');
    if (shopBtn) shopBtn.onclick = openShop;
    renderStudent();
    var gi = $('gamein');
    gi.addEventListener('input', onGameInput);
    gi.addEventListener('compositionstart', function () { composing = true; });
    gi.addEventListener('compositionend', function () {
      composing = false;
      var c = wantCommit; wantCommit = false;
      setTimeout(function () { onGameInput(c); }, 0);
    });
    gi.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var wasStudent = G && G.student;
        stop();
        if (wasStudent) openStudent(); else openSelect();
        return;
      }
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
    $('btn-game-exit').onclick = function () {
      // 학생 게임에서 나가면 학생 게임 선택 화면으로
      var wasStudent = G && G.student;
      stop();
      if (wasStudent) openStudent(); else openSelect();
    };
    $('s-game').addEventListener('mousedown', function (e) {
      if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
        setTimeout(function () { var i = $('gamein'); if (!i.disabled) i.focus(); }, 0);
      }
    });
  }

  return {
    init: init, openSelect: openSelect, openStudent: openStudent,
    start: start, stop: stop, renderStudent: renderStudent
  };
})();
