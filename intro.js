/* ==========================================================================
   첫 방문 입장 화면 — 안내견 말풍선에 보고 싶은 것을 적고 Enter →
   프로젝트 캡처가 잠깐 지나가고 → 문이 좌우로 열리며 그 화면으로 들어간다.
   · 같은 창에서는 한 번만, 홈 주소로 들어왔을 때만 보인다 (특정 페이지 링크로 오면 건너뜀)
   · ?intro 를 붙이면 다시 볼 수 있다
   · 키워드로 안내한다 (AI 답변이 아니다 — 화면 아래에도 밝힌다)
   ========================================================================== */
(function () {
  const KEY = 'intro_seen_v1';
  const params = new URLSearchParams(location.search);
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 매번 보여 준다 */ }
  if (params.has('intro')) seen = false;
  const deepLink = location.hash.replace(/^#\/?/, '') !== '';
  if (seen || deepLink || params.has('nointro')) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* 무시 */ }

  const T = {
    ja: {
      title: '何をお手伝いしましょうか？',
      hello: 'こんにちは！\n金兌衍のポートフォリオの案内係です。',
      ask: '見たいものを入力して［検索］を押してください。',
      auto: 'ポートフォリオを見せて',
      opt: 'オプション(<u>O</u>)', find: '検索(<u>S</u>)',
      hint: 'Enter でも入場できます', skip: 'スキップ',
      note: '※ 入力したキーワードから該当ページへ案内します（AI による回答ではありません）',
      chips: ['実案件（BtoB）を見たい', '日本語力は？', '学習の日誌', 'このサイトの作り方'],
      label: '入場ガイド',
    },
    ko: {
      title: '무엇을 도와 드릴까요?',
      hello: '안녕하세요!\n김태연 포트폴리오 안내 담당입니다.',
      ask: '보고 싶은 것을 입력하고 [찾기]를 눌러 주세요.',
      auto: '포트폴리오 보여줘',
      opt: '옵션(<u>O</u>)', find: '찾기(<u>S</u>)',
      hint: 'Enter로도 입장할 수 있습니다', skip: '건너뛰기',
      note: '※ 입력한 키워드로 해당 페이지를 안내합니다 (AI 답변이 아닙니다)',
      chips: ['실제 안건(B2B) 보고 싶어', '일본어 실력은?', '학습 일지', '이 사이트 제작 과정'],
      label: '입장 안내',
    }
  };

  // 사이트에 이미 공개된 각 프로젝트의 첫 화면
  const SHOTS = {
    hospital:  { src: './project_images/hosp_01_top_user.png', ja: '健康診断予約システム（BtoB 実案件）', ko: '건강검진 예약 시스템 (B2B 실제 안건)', en: 'HOSPITAL' },
    gakong:    { src: './project_images/gakong_01_top.webp',   ja: '架空読書会',                     ko: '가공독서회',                       en: 'BOOK CLUB' },
    typing:    { src: './project_images/typing_01_top.webp',   ja: 'タイピング練習プラットフォーム',     ko: '타이핑 연습 플랫폼',                en: 'ENTERPING' },
    portfolio: { src: './project_images/pf_01_home.png',       ja: 'このポートフォリオサイト',          ko: '이 포트폴리오 사이트',               en: 'PORTFOLIO' },
  };

  const ROUTES = [
    { re: /病院|健診|健康診断|BtoB|B2B|実案件|案件|병원|건강검진|검진|안건/i, hash: '#/project/hospital/overview', first: 'hospital',
      ja: '実案件の「健康診断予約システム（BtoB）」へ\nご案内します！', ko: '실제 안건 「건강검진 예약 시스템(B2B)」으로\n안내할게요!' },
    { re: /読書|架空|가공|독서/i, hash: '#/project/gakong/overview', first: 'gakong',
      ja: '個人開発の「架空読書会」へご案内します！', ko: '개인 개발 프로젝트 「가공독서회」로\n안내할게요!' },
    { re: /タイピング|エンターピング|typing|타이핑|엔터핑/i, hash: '#/project/typing/overview', first: 'typing',
      ja: 'チームで作った\n「タイピング練習プラットフォーム」へ\nご案内します！', ko: '팀으로 만든 「타이핑 연습 플랫폼」으로\n안내할게요!' },
    { re: /作り方|制作|このサイト|ポートフォリオサイト|제작|이 사이트|만든 과정/i, hash: '#/project/portfolio/overview', first: 'portfolio',
      ja: 'このポートフォリオサイトの制作記録へ\nご案内します！', ko: '이 포트폴리오 사이트의 제작 기록으로\n안내할게요!' },
    { re: /日誌|ログ|学習|勉強|log|일지|학습|공부/i, hash: '#/log', first: null,
      ja: '2026年3月からの学習の日誌へ\nご案内します！', ko: '2026년 3월부터의 학습 일지로\n안내할게요!' },
    { re: /日本語|JLPT|N1|自己|経歴|自己紹介|about|일본어|자기소개|경력/i, hash: '#/about', first: null,
      ja: '自己紹介（経歴・日本語・自己PR）へ\nご案内します！', ko: '자기소개(경력·일본어·자기 PR)로\n안내할게요!' },
    { re: /連絡|コンタクト|contact|メール|연락|메일/i, hash: '#/contact', first: null,
      ja: '連絡先のページへご案内します！', ko: '연락처 페이지로 안내할게요!' },
  ];
  const HOME = { hash: '#/', first: null,
    ja: 'ホームへご案内します！\n4つのプロジェクトをご覧ください。', ko: '홈으로 안내할게요!\n4개의 프로젝트를 둘러봐 주세요.' };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
  const lang = () => (typeof currentLanguage !== 'undefined' && currentLanguage === 'ko') ? 'ko' : 'ja';
  const dogSvg = (document.querySelector('#bd-dog .px-dog') || {}).outerHTML || '';

  const root = document.createElement('div');
  root.id = 'intro';
  root.className = 'it';
  root.innerHTML = `
    <div class="it-door left" aria-hidden="true"><span class="it-panel top"></span><span class="it-panel bottom"></span><span class="it-knob"></span></div>
    <div class="it-door right" aria-hidden="true"><span class="it-panel top"></span><span class="it-panel bottom"></span><span class="it-knob"></span></div>
    <div class="it-jamb" aria-hidden="true"></div>
    <div class="it-lang" role="group" aria-label="Language">
      <button type="button" data-lang="ja">日本語</button><button type="button" data-lang="ko">한국어</button>
    </div>
    <div class="it-stage">
      <div class="it-buddy">
        <form class="it-balloon" id="it-form" autocomplete="off" role="dialog" aria-labelledby="it-title">
          <div class="it-title" id="it-title"></div>
          <div class="it-say" id="it-say" aria-live="polite"></div>
          <input class="it-field" id="it-q" type="text" maxlength="60">
          <div class="it-btns">
            <button type="button" class="it-xp" id="it-opt" accesskey="o" aria-expanded="false"></button>
            <button type="submit" class="it-xp it-find" id="it-find" accesskey="s"></button>
          </div>
          <div class="it-opts" id="it-opts"></div>
          <div class="it-hint"><span id="it-hint"></span><button type="button" class="it-skip" id="it-skip"></button></div>
        </form>
        <div class="it-dog" id="it-dog" aria-hidden="true">${dogSvg}</div>
      </div>
    </div>
    <div class="it-montage" aria-hidden="true"><div class="it-frame" id="it-frame"></div><div class="it-cap" id="it-cap"></div><div class="it-dots" id="it-dots"></div></div>
    <div class="it-note" id="it-note"></div>`;
  document.body.appendChild(root);
  document.body.classList.add('intro-open');
  Object.values(SHOTS).forEach(s => { const im = new Image(); im.src = s.src; });   // 미리 받아 두기

  const $ = id => document.getElementById(id);
  const say = $('it-say'), q = $('it-q'), dog = $('it-dog'), opts = $('it-opts');
  let busy = false, runId = 0;

  function paint() {
    const t = T[lang()];
    root.setAttribute('aria-label', t.label);
    $('it-title').textContent = t.title;
    $('it-opt').innerHTML = t.opt;
    $('it-find').innerHTML = t.find;
    $('it-hint').textContent = t.hint;
    $('it-skip').textContent = t.skip;
    $('it-note').textContent = t.note;
    opts.innerHTML = t.chips.map(c => `<button type="button">${c}</button>`).join('');
    opts.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { q.value = b.textContent; send(); }));
    root.querySelectorAll('.it-lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang()));
  }

  async function speak(text, id) {
    say.textContent = '';
    say.classList.add('typing');
    for (const ch of text) {
      if (id !== runId) return;
      say.textContent += ch;
      await wait(28);
    }
    say.classList.remove('typing');
  }

  async function intro() {
    const id = ++runId;
    q.value = '';
    delete q.dataset.touched;
    await wait(350);
    await speak(T[lang()].hello, id);
    await wait(450);
    await speak(T[lang()].ask, id);
    await wait(250);
    for (const ch of T[lang()].auto) {
      if (id !== runId || q.dataset.touched) return;   // 직접 쓰기 시작하면 멈춘다
      q.value += ch;
      await wait(70);
    }
    if (id === runId) q.focus();
  }
  q.addEventListener('input', () => { q.dataset.touched = '1'; });

  async function send() {
    if (busy) return;
    busy = true;
    const id = ++runId;
    const text = q.value.trim() || T[lang()].auto;
    const r = ROUTES.find(x => x.re.test(text)) || HOME;
    opts.classList.remove('on');
    dog.classList.add('jump');
    await speak(r[lang()], id);
    await wait(500);
    await montage(r.first);
    open(r.hash);
  }

  // 프로젝트 첫 화면을 차례로 (고른 프로젝트를 맨 앞에)
  async function montage(first) {
    const order = ['hospital', 'gakong', 'typing', 'portfolio'];
    if (first) { order.splice(order.indexOf(first), 1); order.unshift(first); }
    const frame = $('it-frame'), cap = $('it-cap'), dots = $('it-dots');
    frame.innerHTML = order.map(k => `<img src="${SHOTS[k].src}" alt="">`).join('');
    dots.innerHTML = order.map(() => '<i></i>').join('');
    root.classList.add('sent');
    await wait(300);
    root.classList.add('montage-on');
    const imgs = frame.querySelectorAll('img'), ds = dots.querySelectorAll('i');
    for (let i = 0; i < order.length; i++) {
      imgs.forEach((im, j) => im.classList.toggle('on', j === i));
      ds.forEach((d, j) => d.classList.toggle('on', j <= i));
      cap.innerHTML = `${SHOTS[order[i]][lang()]}<small>${SHOTS[order[i]].en}</small>`;
      await wait(i === 0 && first ? 900 : 520);
    }
  }

  // 뒤의 실제 화면을 먼저 바꿔 두고 문을 연다
  async function open(hash) {
    if (hash && hash !== '#/' && location.hash !== hash) {
      history.pushState(null, '', hash);
      if (typeof applyRoute === 'function') applyRoute();
    }
    await wait(150);
    root.classList.add('open');
    await wait(1100);
    root.remove();
    document.body.classList.remove('intro-open');
  }

  $('it-form').addEventListener('submit', e => { e.preventDefault(); send(); });
  $('it-opt').addEventListener('click', () => {
    const on = opts.classList.toggle('on');
    $('it-opt').setAttribute('aria-expanded', on);
  });
  const skip = () => { if (!busy) { busy = true; ++runId; open('#/'); } };
  $('it-skip').addEventListener('click', skip);
  document.addEventListener('keydown', function onKey(e) {
    if (!document.getElementById('intro')) { document.removeEventListener('keydown', onKey, true); return; }
    if (e.key === 'Escape') { e.stopPropagation(); skip(); }
  }, true);
  dog.addEventListener('click', () => { dog.classList.remove('jump'); void dog.offsetWidth; dog.classList.add('jump'); });
  dog.addEventListener('animationend', () => { if (!busy) dog.classList.remove('jump'); });
  root.querySelectorAll('.it-lang button').forEach(b => b.addEventListener('click', () => {
    if (busy || lang() === b.dataset.lang) return;
    if (typeof setLanguage === 'function') setLanguage(b.dataset.lang);
    paint();
    intro();
  }));

  paint();
  intro();
})();
