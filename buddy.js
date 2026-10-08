/* ==========================================================================
   안내 오리 — 화면 오른쪽 아래에서 자고 있다가, 누르면 깨어나 검색 말풍선을 띄운다.
   입력한 말에서 키워드를 찾아 사이트 안의 해당 화면으로 안내한다 (AI 답변이 아니라 키워드 안내).
   오리는 직접 찍은 도트 그림(SVG). 옛 Office/Windows 도우미의 그림·이름은 쓰지 않는다.
   ========================================================================== */
(function () {
  const T = {
    ja: {
      title: '何をお手伝いしましょうか？',
      ask: '見たいものを入力するか、\nオプションから選んでください。',
      placeholder: '例）実案件を見たい',
      opt: 'オプション(<u>O</u>)', find: '検索(<u>S</u>)', close: '閉じる',
      chips: ['実案件（BtoB）を見たい', '日本で働きたい理由', '日本語力は？', '学習の日誌', 'このサイトの作り方', '連絡先'],
      miss: 'すみません、見つけられませんでした。\nオプションから選んでみてください。',
      note: 'キーワードで該当ページへ案内します\n（AI の回答ではありません）',
      dog: '案内役のアヒル（クリックで検索）',
    },
    ko: {
      title: '무엇을 도와 드릴까요?',
      ask: '보고 싶은 것을 입력하거나,\n옵션에서 골라 주세요.',
      placeholder: '예) 실제 안건 보고 싶어',
      opt: '옵션(<u>O</u>)', find: '찾기(<u>S</u>)', close: '닫기',
      chips: ['실제 안건(B2B) 보고 싶어', '일본에서 일하고 싶은 이유', '일본어 실력은?', '학습 일지', '이 사이트 제작 과정', '연락처'],
      miss: '죄송해요, 잘 찾지 못했어요.\n옵션에서 골라 보세요.',
      note: '키워드로 해당 페이지를 안내합니다\n(AI 답변이 아닙니다)',
      dog: '안내 오리 (누르면 검색)',
    }
  };

  const ROUTES = [
    { re: /ゴルフ|golf|골프|2件目|二件目|두 ?번째|2번째/i, hash: '#/project/golf/overview',
      ja: '2件目の実案件「ゴルフ予約サービス」へ\nご案内します！', ko: '두 번째 실제 안건 「골프 예약 서비스」로\n안내할게요!' },
    { re: /病院|健診|健康診断|BtoB|B2B|実案件|案件|병원|건강검진|검진|안건/i, hash: '#/project/hospital/overview',
      ja: '実案件の「健康診断予約システム（BtoB）」へ\nご案内します！', ko: '실제 안건 「건강검진 예약 시스템(B2B)」으로\n안내할게요!' },
    { re: /読書|架空|가공|독서/i, hash: '#/project/gakong/overview',
      ja: '個人開発の「架空読書会」へ\nご案内します！', ko: '개인 개발 프로젝트 「가공독서회」로\n안내할게요!' },
    { re: /タイピング|エンターピング|typing|타이핑|엔터핑/i, hash: '#/project/typing/overview',
      ja: 'チームで作った「タイピング練習プラットフォーム」へ\nご案内します！', ko: '팀으로 만든 「타이핑 연습 플랫폼」으로\n안내할게요!' },
    { re: /作り方|制作|このサイト|ポートフォリオサイト|제작|이 사이트|만든 과정/i, hash: '#/project/portfolio/overview',
      ja: 'このポートフォリオサイトの制作記録へ\nご案内します！', ko: '이 포트폴리오 사이트의 제작 기록으로\n안내할게요!' },
    { re: /プロジェクト|作品|project|프로젝트|작품/i, hash: '#/project/hospital/overview',
      ja: 'プロジェクトのページへ\nご案内します！', ko: '프로젝트 페이지로\n안내할게요!' },
    { re: /日誌|ログ|学習|勉強|log|일지|학습|공부/i, hash: '#/log',
      ja: '2026年3月からの学習の日誌へ\nご案内します！', ko: '2026년 3월부터의 학습 일지로\n안내할게요!' },
    { re: /志望|理由|なぜ日本|日本で働|働きたい|入社|지망|이유|왜 일본|일본에서|입사/i, hash: '#/about', scroll: '.about-why-section',
      ja: '「日本で働きたい理由」へ\nご案内します！', ko: '「일본에서 일하고 싶은 이유」로\n안내할게요!' },
    { re: /日本語|JLPT|N1|自己|経歴|自己紹介|資格|about|일본어|자기소개|경력|자격/i, hash: '#/about',
      ja: '自己紹介（経歴・日本語・自己PR）へ\nご案内します！', ko: '자기소개(경력·일본어·자기 PR)로\n안내할게요!' },
    { re: /連絡|コンタクト|contact|メール|ゲストブック|연락|메일|방명록/i, hash: '#/contact',
      ja: '連絡先のページへご案内します！', ko: '연락처 페이지로 안내할게요!' },
    { re: /ホーム|トップ|home|홈|처음/i, hash: '#/',
      ja: 'ホームへご案内します！', ko: '홈으로 안내할게요!' },
  ];

  // 도트 리트리버 (24×23 칸, 직접 찍은 그림). 눈·꼬리는 그룹을 바꿔 보여 준다.
  const DOG_SVG = `<svg class="px-dog" viewBox="0 0 24 23" shape-rendering="crispEdges" aria-hidden="true"><g class="px-base"><rect x="7" y="1" width="4" height="1" fill="#2C3E50"/><rect x="6" y="2" width="1" height="1" fill="#2C3E50"/><rect x="7" y="2" width="4" height="1" fill="#FFFFFF"/><rect x="11" y="2" width="1" height="1" fill="#2C3E50"/><rect x="5" y="3" width="1" height="1" fill="#2C3E50"/><rect x="6" y="3" width="6" height="1" fill="#FFFFFF"/><rect x="12" y="3" width="1" height="1" fill="#2C3E50"/><rect x="3" y="4" width="2" height="1" fill="#2C3E50"/><rect x="5" y="4" width="8" height="1" fill="#FFFFFF"/><rect x="13" y="4" width="1" height="1" fill="#2C3E50"/><rect x="1" y="5" width="2" height="1" fill="#2C3E50"/><rect x="3" y="5" width="1" height="1" fill="#F6A23A"/><rect x="4" y="5" width="1" height="1" fill="#2C3E50"/><rect x="5" y="5" width="8" height="1" fill="#FFFFFF"/><rect x="13" y="5" width="1" height="1" fill="#2C3E50"/><rect x="0" y="6" width="1" height="1" fill="#2C3E50"/><rect x="1" y="6" width="5" height="1" fill="#F6A23A"/><rect x="6" y="6" width="7" height="1" fill="#FFFFFF"/><rect x="13" y="6" width="1" height="1" fill="#2C3E50"/><rect x="1" y="7" width="1" height="1" fill="#2C3E50"/><rect x="2" y="7" width="3" height="1" fill="#D9781C"/><rect x="5" y="7" width="7" height="1" fill="#FFFFFF"/><rect x="12" y="7" width="1" height="1" fill="#2C3E50"/><rect x="2" y="8" width="4" height="1" fill="#2C3E50"/><rect x="6" y="8" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="8" width="1" height="1" fill="#2C3E50"/><rect x="5" y="9" width="1" height="1" fill="#2C3E50"/><rect x="6" y="9" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="9" width="7" height="1" fill="#2C3E50"/><rect x="5" y="10" width="1" height="1" fill="#2C3E50"/><rect x="6" y="10" width="12" height="1" fill="#FFFFFF"/><rect x="18" y="10" width="2" height="1" fill="#2C3E50"/><rect x="5" y="11" width="1" height="1" fill="#2C3E50"/><rect x="6" y="11" width="7" height="1" fill="#FFFFFF"/><rect x="13" y="11" width="5" height="1" fill="#DCE4EE"/><rect x="18" y="11" width="2" height="1" fill="#FFFFFF"/><rect x="20" y="11" width="1" height="1" fill="#2C3E50"/><rect x="5" y="12" width="1" height="1" fill="#2C3E50"/><rect x="6" y="12" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="12" width="9" height="1" fill="#DCE4EE"/><rect x="20" y="12" width="1" height="1" fill="#FFFFFF"/><rect x="21" y="12" width="1" height="1" fill="#2C3E50"/><rect x="5" y="13" width="1" height="1" fill="#2C3E50"/><rect x="6" y="13" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="13" width="9" height="1" fill="#DCE4EE"/><rect x="20" y="13" width="2" height="1" fill="#FFFFFF"/><rect x="22" y="13" width="1" height="1" fill="#2C3E50"/><rect x="5" y="14" width="1" height="1" fill="#2C3E50"/><rect x="6" y="14" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="14" width="9" height="1" fill="#DCE4EE"/><rect x="20" y="14" width="2" height="1" fill="#FFFFFF"/><rect x="22" y="14" width="1" height="1" fill="#2C3E50"/><rect x="5" y="15" width="1" height="1" fill="#2C3E50"/><rect x="6" y="15" width="6" height="1" fill="#FFFFFF"/><rect x="12" y="15" width="7" height="1" fill="#DCE4EE"/><rect x="19" y="15" width="3" height="1" fill="#FFFFFF"/><rect x="22" y="15" width="1" height="1" fill="#2C3E50"/><rect x="5" y="16" width="1" height="1" fill="#2C3E50"/><rect x="6" y="16" width="2" height="1" fill="#FFFFFF"/><rect x="8" y="16" width="6" height="1" fill="#F1F5FA"/><rect x="14" y="16" width="7" height="1" fill="#FFFFFF"/><rect x="21" y="16" width="1" height="1" fill="#2C3E50"/><rect x="5" y="17" width="1" height="1" fill="#2C3E50"/><rect x="6" y="17" width="10" height="1" fill="#F1F5FA"/><rect x="16" y="17" width="5" height="1" fill="#FFFFFF"/><rect x="21" y="17" width="1" height="1" fill="#2C3E50"/><rect x="6" y="18" width="1" height="1" fill="#2C3E50"/><rect x="7" y="18" width="8" height="1" fill="#F1F5FA"/><rect x="15" y="18" width="4" height="1" fill="#FFFFFF"/><rect x="19" y="18" width="2" height="1" fill="#2C3E50"/><rect x="7" y="19" width="3" height="1" fill="#2C3E50"/><rect x="10" y="19" width="7" height="1" fill="#FFFFFF"/><rect x="17" y="19" width="2" height="1" fill="#2C3E50"/><rect x="10" y="20" width="1" height="1" fill="#2C3E50"/><rect x="11" y="20" width="2" height="1" fill="#F6A23A"/><rect x="13" y="20" width="2" height="1" fill="#2C3E50"/><rect x="15" y="20" width="2" height="1" fill="#F6A23A"/><rect x="10" y="21" width="3" height="1" fill="#F6A23A"/><rect x="14" y="21" width="3" height="1" fill="#F6A23A"/></g><g class="px-eyes-open"><rect x="7" y="4" width="1" height="1" fill="#2A1A10"/><rect x="8" y="4" width="1" height="1" fill="#FFFFFF"/><rect x="7" y="5" width="2" height="1" fill="#2A1A10"/></g><g class="px-eyes-shut"><rect x="6" y="5" width="3" height="1" fill="#2A1A10"/></g><g class="px-tail-a"><rect x="21" y="9" width="2" height="1" fill="#2C3E50"/><rect x="21" y="10" width="1" height="1" fill="#FFFFFF"/><rect x="22" y="10" width="1" height="1" fill="#2C3E50"/><rect x="21" y="11" width="1" height="1" fill="#FFFFFF"/><rect x="22" y="11" width="1" height="1" fill="#2C3E50"/><rect x="21" y="12" width="1" height="1" fill="#FFFFFF"/><rect x="22" y="12" width="1" height="1" fill="#2C3E50"/></g><g class="px-tail-b"><rect x="22" y="10" width="1" height="1" fill="#2C3E50"/><rect x="22" y="11" width="1" height="1" fill="#FFFFFF"/><rect x="23" y="11" width="1" height="1" fill="#2C3E50"/><rect x="21" y="12" width="2" height="1" fill="#2C3E50"/></g><g class="px-wing-up"><rect x="20" y="1" width="3" height="1" fill="#2C3E50"/><rect x="18" y="2" width="2" height="1" fill="#2C3E50"/><rect x="20" y="2" width="3" height="1" fill="#FFFFFF"/><rect x="23" y="2" width="1" height="1" fill="#2C3E50"/><rect x="16" y="3" width="2" height="1" fill="#2C3E50"/><rect x="18" y="3" width="1" height="1" fill="#FFFFFF"/><rect x="19" y="3" width="1" height="1" fill="#DCE4EE"/><rect x="20" y="3" width="1" height="1" fill="#FFFFFF"/><rect x="21" y="3" width="1" height="1" fill="#DCE4EE"/><rect x="22" y="3" width="1" height="1" fill="#FFFFFF"/><rect x="23" y="3" width="1" height="1" fill="#2C3E50"/><rect x="15" y="4" width="1" height="1" fill="#2C3E50"/><rect x="16" y="4" width="2" height="1" fill="#FFFFFF"/><rect x="18" y="4" width="1" height="1" fill="#DCE4EE"/><rect x="19" y="4" width="1" height="1" fill="#FFFFFF"/><rect x="20" y="4" width="1" height="1" fill="#DCE4EE"/><rect x="21" y="4" width="1" height="1" fill="#FFFFFF"/><rect x="22" y="4" width="1" height="1" fill="#2C3E50"/><rect x="14" y="5" width="1" height="1" fill="#2C3E50"/><rect x="15" y="5" width="2" height="1" fill="#FFFFFF"/><rect x="17" y="5" width="1" height="1" fill="#DCE4EE"/><rect x="18" y="5" width="1" height="1" fill="#FFFFFF"/><rect x="19" y="5" width="1" height="1" fill="#DCE4EE"/><rect x="20" y="5" width="1" height="1" fill="#FFFFFF"/><rect x="21" y="5" width="1" height="1" fill="#2C3E50"/><rect x="13" y="6" width="1" height="1" fill="#2C3E50"/><rect x="14" y="6" width="2" height="1" fill="#FFFFFF"/><rect x="16" y="6" width="1" height="1" fill="#DCE4EE"/><rect x="17" y="6" width="1" height="1" fill="#FFFFFF"/><rect x="18" y="6" width="1" height="1" fill="#DCE4EE"/><rect x="19" y="6" width="1" height="1" fill="#FFFFFF"/><rect x="20" y="6" width="1" height="1" fill="#2C3E50"/><rect x="13" y="7" width="1" height="1" fill="#2C3E50"/><rect x="14" y="7" width="3" height="1" fill="#FFFFFF"/><rect x="17" y="7" width="1" height="1" fill="#DCE4EE"/><rect x="18" y="7" width="1" height="1" fill="#FFFFFF"/><rect x="19" y="7" width="1" height="1" fill="#2C3E50"/><rect x="13" y="8" width="1" height="1" fill="#2C3E50"/><rect x="14" y="8" width="4" height="1" fill="#FFFFFF"/><rect x="18" y="8" width="1" height="1" fill="#2C3E50"/><rect x="13" y="9" width="1" height="1" fill="#2C3E50"/><rect x="14" y="9" width="3" height="1" fill="#FFFFFF"/><rect x="17" y="9" width="1" height="1" fill="#2C3E50"/><rect x="13" y="11" width="5" height="1" fill="#FFFFFF"/><rect x="11" y="12" width="9" height="1" fill="#FFFFFF"/><rect x="11" y="13" width="9" height="1" fill="#FFFFFF"/><rect x="11" y="14" width="9" height="1" fill="#FFFFFF"/><rect x="12" y="15" width="7" height="1" fill="#FFFFFF"/></g><g class="px-beak-open"><rect x="1" y="3" width="2" height="1" fill="#2C3E50"/><rect x="0" y="4" width="1" height="1" fill="#2C3E50"/><rect x="1" y="4" width="2" height="1" fill="#F6A23A"/><rect x="3" y="4" width="1" height="1" fill="#2C3E50"/><rect x="0" y="5" width="1" height="1" fill="#2C3E50"/><rect x="1" y="5" width="4" height="1" fill="#F6A23A"/><rect x="0" y="6" width="1" height="1" fill="#2C3E50"/><rect x="1" y="6" width="3" height="1" fill="#8C3B2A"/><rect x="4" y="6" width="2" height="1" fill="#F6A23A"/><rect x="0" y="7" width="1" height="1" fill="#2C3E50"/><rect x="1" y="7" width="4" height="1" fill="#D9781C"/><rect x="1" y="8" width="4" height="1" fill="#2C3E50"/></g></svg>`;

  // 엎드려 자는 도트 리트리버 (28×13 칸). 잘 때는 이 그림, 깨면 앉은 그림.
  const SLEEP_SVG = `<svg class="px-sleep" viewBox="0 4 28 13" shape-rendering="crispEdges" aria-hidden="true"><g class="px-sleep-body"><rect x="6" y="4" width="4" height="1" fill="#2C3E50"/><rect x="5" y="5" width="1" height="1" fill="#2C3E50"/><rect x="6" y="5" width="4" height="1" fill="#FFFFFF"/><rect x="10" y="5" width="2" height="1" fill="#2C3E50"/><rect x="4" y="6" width="1" height="1" fill="#2C3E50"/><rect x="5" y="6" width="7" height="1" fill="#FFFFFF"/><rect x="12" y="6" width="9" height="1" fill="#2C3E50"/><rect x="26" y="6" width="1" height="1" fill="#2C3E50"/><rect x="4" y="7" width="1" height="1" fill="#2C3E50"/><rect x="5" y="7" width="4" height="1" fill="#FFFFFF"/><rect x="9" y="7" width="1" height="1" fill="#2C3E50"/><rect x="10" y="7" width="11" height="1" fill="#FFFFFF"/><rect x="21" y="7" width="2" height="1" fill="#2C3E50"/><rect x="25" y="7" width="1" height="1" fill="#2C3E50"/><rect x="26" y="7" width="1" height="1" fill="#FFFFFF"/><rect x="27" y="7" width="1" height="1" fill="#2C3E50"/><rect x="2" y="8" width="2" height="1" fill="#2C3E50"/><rect x="4" y="8" width="3" height="1" fill="#FFFFFF"/><rect x="7" y="8" width="3" height="1" fill="#2A1A10"/><rect x="10" y="8" width="5" height="1" fill="#FFFFFF"/><rect x="15" y="8" width="7" height="1" fill="#DCE4EE"/><rect x="22" y="8" width="1" height="1" fill="#FFFFFF"/><rect x="23" y="8" width="2" height="1" fill="#2C3E50"/><rect x="25" y="8" width="2" height="1" fill="#FFFFFF"/><rect x="27" y="8" width="1" height="1" fill="#2C3E50"/><rect x="1" y="9" width="1" height="1" fill="#2C3E50"/><rect x="2" y="9" width="3" height="1" fill="#F6A23A"/><rect x="5" y="9" width="8" height="1" fill="#FFFFFF"/><rect x="13" y="9" width="11" height="1" fill="#DCE4EE"/><rect x="24" y="9" width="3" height="1" fill="#FFFFFF"/><rect x="27" y="9" width="1" height="1" fill="#2C3E50"/><rect x="1" y="10" width="1" height="1" fill="#2C3E50"/><rect x="2" y="10" width="4" height="1" fill="#F6A23A"/><rect x="6" y="10" width="7" height="1" fill="#FFFFFF"/><rect x="13" y="10" width="11" height="1" fill="#DCE4EE"/><rect x="24" y="10" width="2" height="1" fill="#FFFFFF"/><rect x="26" y="10" width="1" height="1" fill="#2C3E50"/><rect x="2" y="11" width="3" height="1" fill="#D9781C"/><rect x="5" y="11" width="9" height="1" fill="#FFFFFF"/><rect x="14" y="11" width="10" height="1" fill="#DCE4EE"/><rect x="24" y="11" width="2" height="1" fill="#FFFFFF"/><rect x="26" y="11" width="1" height="1" fill="#2C3E50"/><rect x="4" y="12" width="1" height="1" fill="#2C3E50"/><rect x="5" y="12" width="11" height="1" fill="#FFFFFF"/><rect x="16" y="12" width="5" height="1" fill="#DCE4EE"/><rect x="21" y="12" width="5" height="1" fill="#FFFFFF"/><rect x="26" y="12" width="1" height="1" fill="#2C3E50"/><rect x="5" y="13" width="1" height="1" fill="#2C3E50"/><rect x="6" y="13" width="19" height="1" fill="#FFFFFF"/><rect x="25" y="13" width="1" height="1" fill="#2C3E50"/><rect x="6" y="14" width="1" height="1" fill="#2C3E50"/><rect x="7" y="14" width="2" height="1" fill="#FFFFFF"/><rect x="9" y="14" width="10" height="1" fill="#F1F5FA"/><rect x="19" y="14" width="5" height="1" fill="#FFFFFF"/><rect x="24" y="14" width="1" height="1" fill="#2C3E50"/><rect x="7" y="15" width="1" height="1" fill="#2C3E50"/><rect x="8" y="15" width="12" height="1" fill="#F1F5FA"/><rect x="20" y="15" width="2" height="1" fill="#FFFFFF"/><rect x="22" y="15" width="2" height="1" fill="#2C3E50"/><rect x="8" y="16" width="5" height="1" fill="#2C3E50"/><rect x="13" y="16" width="6" height="1" fill="#FFFFFF"/><rect x="19" y="16" width="3" height="1" fill="#2C3E50"/></g></svg>`;

  const lang = () => (typeof currentLanguage !== 'undefined' && currentLanguage === 'ko') ? 'ko' : 'ja';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));

  const root = document.createElement('div');
  root.id = 'buddy';
  root.className = 'bd sleep';
  root.innerHTML = `
    <form class="bd-balloon" id="bd-balloon" role="dialog" aria-labelledby="bd-title" autocomplete="off" hidden>
      <button type="button" class="bd-x" id="bd-x">&#10005;</button>
      <div class="bd-title" id="bd-title"></div>
      <div class="bd-say" id="bd-say" aria-live="polite"></div>
      <input class="bd-field" id="bd-q" type="text" maxlength="60">
      <div class="bd-btns">
        <button type="button" class="bd-xp" id="bd-opt" accesskey="o" aria-expanded="false"></button>
        <button type="submit" class="bd-xp" id="bd-find" accesskey="s"></button>
      </div>
      <div class="bd-opts" id="bd-opts"></div>
      <div class="bd-note" id="bd-note"></div>
    </form>
    <button type="button" class="bd-dog" id="bd-dog">${DOG_SVG}${SLEEP_SVG}<span class="bd-z" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span></button>`;
  document.body.appendChild(root);

  const $ = id => document.getElementById(id);
  const balloon = $('bd-balloon'), say = $('bd-say'), q = $('bd-q'), dog = $('bd-dog'), opts = $('bd-opts');
  let sleepTimer = null, runId = 0, busy = false;

  function paint() {
    const t = T[lang()];
    $('bd-title').textContent = t.title;
    $('bd-opt').innerHTML = t.opt;
    $('bd-find').innerHTML = t.find;
    $('bd-x').setAttribute('aria-label', t.close);
    $('bd-note').textContent = t.note;  // 줄바꿈 기호는 CSS(white-space: pre-line)로 줄을 바꾼다
    q.placeholder = t.placeholder;
    dog.setAttribute('aria-label', t.dog);
    opts.innerHTML = t.chips.map(c => `<button type="button">${c}</button>`).join('');
    opts.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { q.value = b.textContent; go(); }));
  }

  async function speak(text, id) {
    say.textContent = '';
    say.classList.add('typing');
    for (const ch of text) {
      if (id !== runId) return;
      say.textContent += ch;
      await wait(55);
    }
    say.classList.remove('typing');
  }

  function open() {
    clearTimeout(sleepTimer);
    paint();
    root.classList.remove('sleep');
    root.classList.add('awake');
    balloon.hidden = false;
    opts.classList.remove('on');
    $('bd-opt').setAttribute('aria-expanded', 'false');
    q.value = '';
    speak(T[lang()].ask, ++runId);
    setTimeout(() => q.focus(), 50);
  }

  function close() {
    balloon.hidden = true;
    root.classList.remove('awake');
    busy = false;
    ++runId;
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => root.classList.add('sleep'), reduced ? 0 : 2500);
  }

  async function go() {
    if (busy) return;
    const text = q.value.trim();
    if (!text) { q.focus(); return; }
    const t = T[lang()];
    const r = ROUTES.find(x => x.re.test(text));
    const id = ++runId;
    if (!r) {
      await speak(t.miss, id);
      opts.classList.add('on');
      return;
    }
    busy = true;
    dog.classList.remove('jump'); void dog.offsetWidth; dog.classList.add('jump');
    await speak(r[lang()], id);
    await wait(700);
    if (id !== runId) return;
    if (location.hash !== r.hash) history.pushState(null, '', r.hash);
    if (typeof applyRoute === 'function') applyRoute();
    // 같은 화면 안의 특정 카드(예: 日本で働きたい理由)로 바로 내려간다
    const target = r.scroll && document.querySelector(r.scroll);
    if (target) setTimeout(() => target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }), 120);
    else window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    close();
  }

  dog.addEventListener('click', () => (balloon.hidden ? open() : close()));
  dog.addEventListener('animationend', e => { if (e.animationName === 'bd-hop') dog.classList.remove('jump'); });
  $('bd-x').addEventListener('click', close);
  $('bd-opt').addEventListener('click', () => {
    const on = opts.classList.toggle('on');
    $('bd-opt').setAttribute('aria-expanded', on);
  });
  balloon.addEventListener('submit', e => { e.preventDefault(); go(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !balloon.hidden) { close(); dog.focus(); }
  });
  document.addEventListener('click', e => {
    if (!balloon.hidden && !root.contains(e.target)) close();
  });
  // 푸터(메일·GitHub 링크)를 가리지 않도록, 푸터가 화면에 들어오면 그만큼 위로 올라간다
  const footer = document.querySelector('.site-footer');
  let liftQueued = false;
  function lift() {
    liftQueued = false;
    if (!footer || !footer.offsetParent) { root.style.transform = ''; return; }
    const overlap = Math.max(0, window.innerHeight - footer.getBoundingClientRect().top);
    root.style.transform = overlap ? `translateY(${-overlap}px)` : '';
  }
  const queueLift = () => { if (!liftQueued) { liftQueued = true; requestAnimationFrame(lift); } };
  window.addEventListener('scroll', queueLift, { passive: true });
  window.addEventListener('resize', queueLift);
  window.addEventListener('popstate', () => setTimeout(lift, 50));
  document.addEventListener('click', () => setTimeout(lift, 400));
  lift();

  paint();
})();
