/*
 * 프로토타입 공용 데이터 클라이언트 (FastAPI 백엔드 연동, main.py 참고)
 * user-flow-prototype.html / main-prototype.html / reservation-lookup-prototype.html /
 * admin-prototype.html 이 이 파일을 공유해서 백엔드의 /api/* 를 호출한다.
 *
 * localStorage 버전과 달리 데이터 접근 함수는 전부 비동기(Promise)다.
 * 사용 전 반드시 `await DemoDB.init()` 으로 SITES/TIMES 등 기준 데이터를 먼저 받아와야 한다.
 *
 * 포트폴리오 공개판: 서버 없이 아래 localApi() 가 브라우저 안에서 같은 응답을 만든다.
 */
window.DemoDB = (function () {
  var API_BASE = "/api";

  var state = {
    SITES: [], TIMES: [], SLOT_BASE_CAPACITY: {}, COURSES: [], OPTIONS: [],
    REQUIRED_FIELDS: [], FIELD_LABELS: {}, SEED_YEAR: null, SEED_MONTH: null,
  };

  // ---------- 포트폴리오 공개용: 서버 없이 브라우저 안에서 동작하는 가짜 API ----------
  // 원래는 FastAPI(main.py)의 /api/* 를 호출했다. 포트폴리오 사이트에는 그 서버가 없으므로
  // 같은 로직을 여기로 옮기고, 데이터는 방문자 브라우저(localStorage)에만 저장한다.
  // 시설명·주소·우편번호·연락처는 모두 샘플 값이다.
  var LS_KEY = "hospMockState_v1";
  var M_SITES = [
    "サンプル病院D", "サンプル病院A", "サンプル病院F", "サンプルクリニックD", "サンプルクリニックF",
    "サンプル病院G", "サンプルクリニックG", "サンプル医院C", "サンプルクリニックE", "サンプルクリニックB",
    "サンプル病院H", "サンプル診療所A", "サンプルクリニックH", "サンプル医院A", "サンプル病院C",
    "サンプルクリニックA", "サンプル医院B", "サンプル病院E", "サンプルクリニックC", "サンプル病院B"
  ];
  var M_TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];
  var M_BASE = { "09:00": 15, "09:30": 15, "10:00": 21, "10:30": 22, "11:00": 22, "11:30": 22,
                 "13:00": 15, "13:30": 22, "14:00": 22, "14:30": 22, "15:00": 22, "15:30": 20 };
  var M_YEAR = 2026, M_MONTH = 9;
  var M_COURSES = [{ key: "general", label: "기본 건강검진 (특정검진 포함)", code: "KD" }];
  var M_OPTIONS = [
    { key: "gastro_scope", label: "위 내시경 검사 추가", gender: null, minAge: 40, maxAge: null },
    { key: "gastro_barium", label: "위 X선(바륨) 검사 추가", gender: null, minAge: 40, maxAge: null },
    { key: "colon", label: "대장암 검진(변잠혈) 검사 추가", gender: null, minAge: 40, maxAge: null },
    { key: "abdominal_us", label: "복부 초음파 검사 추가", gender: null, minAge: null, maxAge: null },
    { key: "breast_mammo", label: "유방암 검진(유방촬영) 추가 (여성 40세+)", gender: "F", minAge: 40, maxAge: null },
    { key: "breast_us", label: "유방 초음파 검사 추가 (여성)", gender: "F", minAge: null, maxAge: null },
    { key: "cervical", label: "자궁경부암 검사 추가 (여성 20세+)", gender: "F", minAge: 20, maxAge: null },
    { key: "bone_density", label: "골밀도 검사 추가 (여성)", gender: "F", minAge: null, maxAge: null },
    { key: "prostate", label: "전립선암(PSA) 검사 추가 (남성 50세+)", gender: "M", minAge: 50, maxAge: null },
    { key: "tumor_marker", label: "종양표지자(암표지자) 검사 추가", gender: null, minAge: null, maxAge: null },
    { key: "fundus", label: "안저 검사 추가", gender: null, minAge: null, maxAge: null },
    { key: "hepatitis", label: "B형·C형 간염 바이러스 검사 추가", gender: null, minAge: null, maxAge: null }
  ];
  var M_REQUIRED = ["name", "gender", "birth", "phone", "insuranceNo", "zipcode", "address", "addressDetail", "site", "date", "time"];
  var M_LABELS = { name: "성명", gender: "성별", birth: "생년월일", phone: "전화번호(휴대 또는 유선)",
    insuranceNo: "보험자번호/기호/번호", zipcode: "우편번호", address: "주소", addressDetail: "상세번지",
    site: "희망 검진 거점", date: "희망 검진일자", time: "희망 검진시간" };
  var COURSE = M_COURSES[0].label;

  function mPad(n, len) { var s = String(n); while (s.length < (len || 2)) s = "0" + s; return s; }
  function nowStr(sec) {
    var d = new Date();
    return d.getFullYear() + "-" + mPad(d.getMonth() + 1) + "-" + mPad(d.getDate()) + " " +
      mPad(d.getHours()) + ":" + mPad(d.getMinutes()) + (sec ? ":" + mPad(d.getSeconds()) : "");
  }
  function genResNo(existing) {
    var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", code;
    do { code = ""; for (var i = 0; i < 12; i++) code += A[Math.floor(Math.random() * A.length)]; }
    while ((existing || []).indexOf(code) >= 0);
    return code;
  }
  function P(id, name, birth, gender, phone, email, ins, zip, addr, det, opts, site, date, time, ch, st, miss, calls, memo, created) {
    return { id: id, resNo: genResNo(), name: name, furigana: "", birth: birth, gender: gender, phone: phone, email: email,
      insuranceNo: ins, zipcode: zip, address: addr, addressDetail: det, course: COURSE, options: opts,
      site: site, date: date, time: time, channel: ch, status: st, missingFields: miss, callLogs: calls, memo: memo, createdAt: created };
  }
  function seedState() {
    var cap = {}, days = new Date(M_YEAR, M_MONTH, 0).getDate();
    M_SITES.forEach(function (site, si) {
      cap[site] = {};
      for (var d = 1; d <= days; d++) {
        var iso = M_YEAR + "-" + mPad(M_MONTH) + "-" + mPad(d);
        var wd = new Date(M_YEAR, M_MONTH - 1, d).getDay(), we = (wd === 0 || wd === 6);
        cap[site][iso] = {};
        M_TIMES.forEach(function (t, ti) {
          var total = we ? 0 : (si === 0 ? M_BASE[t] : Math.max(4, Math.round(M_BASE[t] * 0.6)));
          var used = we ? 0 : Math.min(total, (d * 3 + ti * 5) % (total + 1));
          cap[site][iso][t] = { total: total, used: used, closed: we };
        });
      }
    });
    var S = M_SITES;
    var hand = [
      P("P-260032", "佐藤 健二", "1968-03-12", "M", "090-0000-0001", "sample1@example.com", "00000000-0000-000001", "999-0001", "サンプル市 中央通", "1-2", ["gastro_scope", "colon"], S[0], "2026-09-01", "09:00", "online", "예약완료", [], [], "매번 오전 이른 시간대를 선호하심.", "2026-08-25T10:02:00"),
      P("P-260088", "小林 翔太", "1994-04-15", "M", "090-0000-0002", "sample2@example.com", "00000000-0000-000002", "999-0002", "サンプル市 中央通", "5-2", [], S[0], "2026-09-03", "11:00", "online", "예약완료", [], [], "40세 미만(만 32세) 신청 수진자 (대상외 로그 대상)", "2026-08-25T16:20:00"),
      P("P-260090", "加藤 直美", "1975-05-20", "F", "090-0000-0003", "sample3@example.com", "00000000-0000-000003", "999-0003", "サンプル市 中央通", "2-3", ["breast_us"], S[2], "2026-09-08", "10:00", "online", "취소", [], [], "본인 요청으로 예약 취소 (일정 변경, 정원 복구 완료)", "2026-08-21T09:40:00"),
      P("P-250018", "田中 由紀", "1985-07-22", "F", "090-0000-0004", "", "00000000-0000-000004", "999-0004", "サンプル市 中央町", "6-2", ["breast_mammo", "cervical"], S[1], "2026-09-02", "10:00", "mail", "예약완료", [], [], "우편 신청서에 필수항목이 모두 기재되어 있어 바로 확정 처리됨", "2026-08-22T09:00:00"),
      P("P-260055", "高橋 實", "1954-06-18", "M", "", "", "", "999-0005", "サンプル市 中央通", "12-3", ["prostate"], S[0], "2026-09-05", "09:30", "mail", "임시접수", ["phone", "insuranceNo"], [{ date: "2026-08-24 14:20", memo: "1차 통화 부재중 (가족 안내: 저녁 7시 본인 귀가 예정)" }], "우편 신청서에 전화번호 및 보험자번호가 공란으로 제출됨", "2026-08-24T11:00:00"),
      P("P-260057", "渡辺 勇", "1964-02-10", "M", "090-0000-0006", "", "00000000-0000-000006", "999-0006", "サンプル市 中央通 5丁目", "8-1", ["gastro_scope"], S[0], "2026-09-01", "09:00", "mail", "임시접수", ["희망 시간대 정원 마감 — 유선으로 재조율 필요"], [{ date: "2026-08-25 15:10", memo: "1차 통화: 9/1 09:00 마감 안내, 10:30 변경 희망하여 서류 보완 진행중" }], "우편 도착 시점 해당 슬롯 정원 마감으로 일정 변경 필요", "2026-08-25T14:15:00"),
      P("P-260092", "木村 里美", "1979-12-01", "F", "090-0000-0007", "", "00000000-0000-000007", "999-0007", "サンプル市 北町1丁目", "4-2", [], S[5], "2026-09-10", "11:30", "mail", "취소", [], [], "우편 접수 후 개인 사정으로 취소 요청, 정원 복구 완료", "2026-08-23T13:20:00"),
      P("P-260041", "鈴木 一郎", "1971-11-05", "M", "090-0000-0008", "sample8@example.com", "00000000-0000-000008", "999-0008", "サンプル市 中央町", "3-1", ["prostate"], S[0], "2026-09-01", "09:00", "phone", "예약완료", [], [], "", "2026-08-20T11:00:00"),
      P("P-260089", "中村 幸雄", "1949-01-20", "M", "090-0000-0009", "", "00000000-0000-000009", "999-0009", "サンプル市 北町1丁目", "8-4", ["abdominal_us"], S[0], "2026-09-04", "14:00", "phone", "예약완료", [], [], "74세 초과(만 77세) 신청 수진자 (대상외 로그 대상)", "2026-08-25T17:10:00"),
      P("P-260091", "山本 修", "1960-09-14", "M", "090-0000-0010", "", "00000000-0000-000010", "999-0010", "サンプル市 南町1丁目", "1-5", ["gastro_barium"], S[3], "2026-09-09", "13:30", "phone", "취소", [], [{ date: "2026-08-26 16:00", memo: "전화로 취소 요청 접수, 정원 복구 완료" }], "", "2026-08-19T15:30:00")
    ];
    hand.forEach(function (r) {
      var s = cap[r.site] && cap[r.site][r.date] && cap[r.site][r.date][r.time];
      if (r.status === "예약완료" && s && !s.closed) s.used = Math.min(s.total, s.used + 1);
    });
    // 전년도 수검 이력 (정원과 무관, 이력 조회용)
    var prior = [hand[0], hand[3], hand[4], hand[8]].map(function (h, i) {
      var r = JSON.parse(JSON.stringify(h));
      r.id = "P-25" + (9000 + i); r.resNo = genResNo(); r.options = []; r.channel = "online"; r.status = "예약완료";
      r.missingFields = []; r.callLogs = []; r.memo = ""; r.date = "2025-09-" + mPad(2 + i * 2); r.createdAt = "2025-08-20T10:00:00";
      return r;
    });
    var reservations = hand.concat(prior);
    var notices = [];
    reservations.forEach(function (r) {
      var to = r.name + " (" + (r.email || r.phone) + ")", when = r.createdAt.replace("T", " ").slice(0, 16);
      if (r.status === "예약완료") notices.push({ date: when, to: to, type: "이메일",
        content: "[サンプル健診センター] 건강검진 예약 확정 안내 (" + r.resNo + ")",
        body: "안녕하세요 " + r.name + "님,\n\n건강검진 예약이 완료되었습니다.\n\n- 예약번호: " + r.resNo + "\n- 검진일시: " + r.date + " " + r.time + "\n- 검진병원: " + r.site + "\n\n감사합니다.",
        mode: "simulation", error: null });
      else if (r.status === "취소") notices.push({ date: when, to: to, type: "이메일",
        content: "예약 취소 접수 확인 (" + r.resNo + ")",
        body: r.name + "님,\n\n예약(예약번호: " + r.resNo + ")이 취소 처리되었습니다.\n\n감사합니다.", mode: "simulation", error: null });
    });
    notices.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return {
      capacity: cap, reservations: reservations, seq: 300, notices: notices,
      options: JSON.parse(JSON.stringify(M_OPTIONS)), siteBaseCapacity: {},
      accounts: [
        { id: "ACC-001", username: "admin_sys", name: "山田 太郎 (시스템 관리자)", role: "system_admin", site: "전체", status: "활성", createdAt: "2026-08-01 09:00" },
        { id: "ACC-002", username: "admin_op", name: "鈴木 兼一 (업무 관리자)", role: "operation_admin", site: S[0], status: "활성", createdAt: "2026-08-05 10:30" },
        { id: "ACC-003", username: "staff_01", name: "高橋 花子 (일반 스태프)", role: "general_staff", site: S[1], status: "활성", createdAt: "2026-08-10 14:15" }
      ],
      auditLogs: [
        { id: "LOG-001", date: "2026-08-25 10:02:15", user: "admin_sys (시스템 관리자)", role: "system_admin", action: "예약 등록", target: "P-260032 (佐藤 健二)", details: "온라인 신청 접수 및 정원 차감 (" + S[0] + " 09:00)" },
        { id: "LOG-002", date: "2026-08-25 10:15:40", user: "admin_op (업무 관리자)", role: "operation_admin", action: "정원 수정", target: S[0] + " 2026-09-01 10:00", details: "정원 변경 (21 -> 25명)" },
        { id: "LOG-003", date: "2026-08-24 14:20:10", user: "staff_01 (일반 스태프)", role: "general_staff", action: "통화 이력 기록", target: "P-260055 (高橋 實)", details: "1차 전화통화 시도 (부재중)" }
      ]
    };
  }
  var memState = null;
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(memState)); } catch (e) {} }
  function load() {
    if (memState) return memState;
    try { var raw = localStorage.getItem(LS_KEY); if (raw) memState = JSON.parse(raw); } catch (e) {}
    if (!memState) { memState = seedState(); save(); }
    return memState;
  }
  function ensureSlot(st, site, date, time) {
    st.capacity[site] = st.capacity[site] || {};
    st.capacity[site][date] = st.capacity[site][date] || {};
    st.capacity[site][date][time] = st.capacity[site][date][time] || { total: 0, used: 0, closed: true };
    return st.capacity[site][date][time];
  }
  function slotView(st, site, date, time) {
    var s = st.capacity[site] && st.capacity[site][date] && st.capacity[site][date][time];
    if (!s) return { total: 0, used: 0, closed: true, remaining: 0 };
    return { total: s.total, used: s.used, closed: s.closed, remaining: Math.max(0, s.total - s.used) };
  }
  function fyRange(iso) {
    var d = iso ? new Date(iso) : new Date(), y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return [y + "-04-01", (y + 1) + "-03-31"];
  }
  function addLog(st, p, action, target, details) {
    st.auditLogs.unshift({ id: "LOG-" + mPad(st.auditLogs.length + 1, 3), date: nowStr(true),
      user: (p && p.user) || "관리자", role: (p && p.role) || "operation_admin", action: action, target: target, details: details });
  }
  function findRes(st, id) { return st.reservations.filter(function (x) { return x.id === id; })[0]; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function localApi(method, path, body) {
    var st = load(), q = {}, qi = path.indexOf("?"), p = qi >= 0 ? path.slice(0, qi) : path;
    if (qi >= 0) path.slice(qi + 1).split("&").forEach(function (kv) {
      var a = kv.split("="), k = decodeURIComponent(a[0]), v = decodeURIComponent(a[1] || "");
      if (q[k] === undefined) q[k] = v; else q[k] = [].concat(q[k], v);
    });
    var seg = p.split("/").filter(Boolean), out, d, iso;
    body = body || {};

    if (p === "/config") return { sites: M_SITES, times: M_TIMES, slotBaseCapacity: M_BASE, courses: M_COURSES,
      options: clone(st.options), requiredFields: M_REQUIRED, fieldLabels: M_LABELS, seedYear: M_YEAR, seedMonth: M_MONTH };

    if (seg[0] === "options" && method === "PATCH") {
      var opt = st.options.filter(function (o) { return o.key === seg[1]; })[0];
      if (!opt) return null;
      ["gender", "minAge", "maxAge", "visible"].forEach(function (k) { if (k in body) opt[k] = body[k]; });
      save(); return { ok: true, option: clone(opt) };
    }

    // ----- 정원 -----
    if (p === "/capacity" && method === "GET") return slotView(st, q.site, q.date, q.time);
    if (p === "/capacity/times") {
      out = {}; M_TIMES.forEach(function (t) { out[t] = slotView(st, q.site, q.date, t); }); return out;
    }
    if (p === "/capacity/grid") {
      out = {};
      for (d = 1; d <= new Date(M_YEAR, M_MONTH, 0).getDate(); d++) {
        var wd = new Date(M_YEAR, M_MONTH - 1, d).getDay(); if (wd === 0 || wd === 6) continue;
        iso = M_YEAR + "-" + mPad(M_MONTH) + "-" + mPad(d); out[iso] = {};
        M_TIMES.forEach(function (t) { out[iso][t] = slotView(st, q.site, iso, t); });
      }
      return out;
    }
    if (p === "/capacity/site-base" && method === "GET") return clone(st.siteBaseCapacity[q.site] || M_BASE);
    if (p === "/capacity/site-base" && method === "POST") {
      var base = body.baseCapacity || {}, sc = st.capacity[body.site] || {};
      st.siteBaseCapacity[body.site] = base;
      // 이미 확정된 예약 수 밑으로는 내리지 않고, 휴진일은 건드리지 않는다
      Object.keys(sc).forEach(function (di) { Object.keys(base).forEach(function (t) {
        var s = sc[di][t]; if (!s || s.closed) return;
        s.total = Math.max(0, parseInt(base[t], 10) || 0, s.used || 0);
      }); });
      addLog(st, body, "정원 변경", body.site + " 시간대별 기본정원", "시간대별 기본 정원 변경 일괄 적용 완료");
      save(); return { ok: true };
    }
    if (p === "/capacity/holiday") {
      var closed = body.closed !== false;
      M_TIMES.forEach(function (t) {
        st.capacity[body.site] = st.capacity[body.site] || {};
        st.capacity[body.site][body.date] = st.capacity[body.site][body.date] || {};
        var day = st.capacity[body.site][body.date];
        day[t] = day[t] || { total: M_BASE[t] || 20, used: 0, closed: false };
        day[t].closed = closed;
      });
      addLog(st, body, "휴진/마감 설정", body.site + " · " + body.date, (closed ? "휴진/전체마감" : "마감 해제") + " (" + (body.reason || "임시 휴진") + ")");
      save(); return { ok: true };
    }
    if (p === "/capacity" && method === "PATCH") {
      var sl = ensureSlot(st, body.site, body.date, body.time);
      if (body.total != null) sl.total = Math.max(0, Math.floor(Number(body.total)));
      if (body.used != null) sl.used = Math.max(0, Math.floor(Number(body.used)));
      if (body.closed != null) sl.closed = !!body.closed;
      save(); return slotView(st, body.site, body.date, body.time);
    }

    // ----- 예약 -----
    if (p === "/reservations" && method === "GET") {
      var stArr = q.status === undefined ? [] : [].concat(q.status);
      var rows = st.reservations.filter(function (r) {
        if (q.id && (r.id || "").toLowerCase().indexOf(q.id.toLowerCase()) < 0) return false;
        if (q.resNo && (r.resNo || "").toLowerCase().indexOf(q.resNo.toLowerCase()) < 0) return false;
        if (q.name && (r.name || "").indexOf(q.name) < 0) return false;
        if (q.birth && (r.birth || "").indexOf(q.birth) < 0) return false;
        if (q.created && (r.createdAt || "").indexOf(q.created) < 0) return false;
        if (q.date && (r.date || "").indexOf(q.date) < 0) return false;
        if (q.channel && r.channel !== q.channel) return false;
        if (q.site && r.site !== q.site) return false;
        if (q.status_val && r.status !== q.status_val) return false;
        if (stArr.length && stArr.indexOf(r.status) < 0) return false;
        return true;
      });
      rows.sort(function (a, b) {
        var x = a.createdAt || "", y = b.createdAt || "";
        return q.order === "asc" ? (x < y ? -1 : x > y ? 1 : 0) : (x < y ? 1 : x > y ? -1 : 0);
      });
      return clone(rows);
    }
    if (p === "/reservations/lookup") {
      // 원래 서버는 없으면 404 → req() 가 null 을 돌려줬다
      return clone(st.reservations.filter(function (x) { return x.resNo === q.resNo && x.birth === q.birth; })[0]) || null;
    }
    if (seg[0] === "reservations" && seg.length === 2 && method === "GET") {
      var r0 = findRes(st, seg[1]); if (!r0) return null;
      var hist = st.reservations.filter(function (x) { return x.name === r0.name && x.birth === r0.birth && x.id !== r0.id; })
        .sort(function (a, b) { return (a.date || "") < (b.date || "") ? 1 : -1; });
      return clone({ record: r0, history: hist });
    }
    if (p === "/reservations" && method === "POST") {
      var f = body, fy = fyRange(f.date);
      var dup = f.name && f.birth && f.phone && st.reservations.some(function (x) {
        return x.status !== "취소" && x.name === f.name && x.birth === f.birth && x.phone === f.phone &&
          fy[0] <= (x.date || "") && (x.date || "") <= fy[1];
      });
      if (dup) return { ok: false, error: "DUPLICATE" };
      var will = f.status === "예약완료" && f.site && f.date && f.time;
      if (will) {
        var v = slotView(st, f.site, f.date, f.time);
        if (v.closed) return { ok: false, error: "CLOSED" };
        if (v.remaining <= 0) return { ok: false, error: "FULL" };
      }
      st.seq += 1;
      var rec = { id: "P-26" + mPad(1000 + st.seq, 4), resNo: genResNo(st.reservations.map(function (x) { return x.resNo; })),
        name: f.name || "", furigana: f.furigana || "", birth: f.birth || "", gender: f.gender || "",
        phone: f.phone || "", email: f.email || "", insuranceNo: f.insuranceNo || "", zipcode: f.zipcode || "",
        address: f.address || "", addressDetail: f.addressDetail || "", course: f.course || COURSE, options: f.options || [],
        site: f.site || "", date: f.date || "", time: f.time || "", channel: f.channel, status: f.status,
        missingFields: f.missingFields || [], callLogs: [], memo: "", createdAt: new Date().toISOString().slice(0, 19) };
      if (will) ensureSlot(st, f.site, f.date, f.time).used += 1;
      st.reservations.push(rec); save(); return { ok: true, record: clone(rec) };
    }
    if (seg[0] === "reservations" && seg.length === 2 && method === "PATCH") {
      var r1 = findRes(st, seg[1]); if (!r1) return { ok: false, error: "NOT_FOUND" };
      Object.keys(body).forEach(function (k) { r1[k] = body[k]; });
      save(); return { ok: true, record: clone(r1) };
    }
    if (seg[0] === "reservations" && seg[2] === "confirm") {
      var r2 = findRes(st, seg[1]); if (!r2) return { ok: false, error: "NOT_FOUND" };
      var miss = M_REQUIRED.filter(function (k) { return !r2[k]; });
      if (miss.length) return { ok: false, error: "MISSING", missing: miss };
      var v2 = slotView(st, r2.site, r2.date, r2.time);
      if (v2.closed) return { ok: false, error: "CLOSED" };
      if (v2.remaining <= 0) return { ok: false, error: "FULL" };
      ensureSlot(st, r2.site, r2.date, r2.time).used += 1;
      r2.status = "예약완료"; r2.missingFields = []; if (!r2.resNo) r2.resNo = genResNo();
      save(); return { ok: true, record: clone(r2) };
    }
    if (seg[0] === "reservations" && seg[2] === "cancel") {
      var r3 = findRes(st, seg[1]); if (!r3) return { ok: false, error: "NOT_FOUND" };
      if ((r3.status === "예약완료" || r3.status === "확인대기") && r3.site && r3.date && r3.time) {
        var s3 = ensureSlot(st, r3.site, r3.date, r3.time); s3.used = Math.max(0, s3.used - 1);
      }
      r3.status = "취소"; save(); return { ok: true, record: clone(r3) };
    }
    if (seg[0] === "reservations" && seg[2] === "call-log") {
      var r4 = findRes(st, seg[1]); if (!r4) return { ok: false, error: "NOT_FOUND" };
      r4.callLogs = r4.callLogs || [];
      if (r4.callLogs.length >= 3) return { ok: false, error: "MAX_REACHED" };
      var e4 = { date: nowStr(true), memo: body.memo || "" }; if (body.by) e4.by = body.by;
      r4.callLogs.push(e4); save(); return { ok: true, record: clone(r4) };
    }

    // ----- 발송 이력 · 계정 · 조작 로그 -----
    if (p === "/notices" && method === "GET") return clone(st.notices);
    if (p === "/notices" && method === "POST") { st.notices.unshift(body); save(); return { ok: true }; }
    if (p === "/accounts" && method === "GET") return clone(st.accounts);
    if (p === "/accounts" && method === "POST") {
      var acc = { id: "ACC-" + mPad(st.accounts.length + 1, 3), username: body.username || ("user_" + (st.accounts.length + 1)),
        name: body.name || "관리자", role: body.role || "operation_admin", site: body.site || "전체", status: "활성", createdAt: nowStr(false) };
      st.accounts.push(acc);
      addLog(st, { user: "admin_sys (시스템 관리자)", role: "system_admin" }, "계정 등록", acc.username + " (" + acc.name + ")", "권한: " + acc.role + ", 소속: " + acc.site);
      save(); return { ok: true, record: clone(acc) };
    }
    if (seg[0] === "accounts" && seg.length === 2 && method === "PATCH") {
      var a5 = st.accounts.filter(function (a) { return a.id === seg[1]; })[0]; if (!a5) return null;
      Object.keys(body).forEach(function (k) { a5[k] = body[k]; });
      save(); return { ok: true, record: clone(a5) };
    }
    if (p === "/audit-logs" && method === "GET") return clone(st.auditLogs);
    if (p === "/audit-logs" && method === "POST") {
      addLog(st, body, body.action || "기타", body.target || "-", body.details || "-");
      save(); return { ok: true, record: clone(st.auditLogs[0]) };
    }
    if (p === "/reset") { memState = seedState(); save(); return { ok: true }; }
    return null;
  }

  // CSV 내보내기 — 서버 대신 브라우저에서 파일을 만들어 내려받게 한다
  function exportCsv(kind) {
    var rows = load().reservations, lines, name;
    function q(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }
    if (kind === "weekly") {
      var map = {};
      M_SITES.forEach(function (s) { map[s] = [0, 0, 0, 0]; });
      rows.forEach(function (r) {
        var m = map[r.site] = map[r.site] || [0, 0, 0, 0]; m[0]++;
        if (r.status === "예약완료" || r.status === "확인대기") m[1]++;
        else if (r.status === "임시접수") m[2]++;
        else if (r.status === "취소") m[3]++;
      });
      lines = ["会場名,総受付件数,確定件数,仮受付(NG)件数,取消件数"].concat(Object.keys(map).map(function (s) {
        return [q(s)].concat(map[s]).join(",");
      }));
      name = "weekly_report_sample.csv";
    } else if (kind === "tak") {
      lines = ["ID,PATIENT_NAME,PATIENT_DOB,GENDER_CODE,INSURANCE_ID,CHECKUP_SITE,CHECKUP_DATE,CHECKUP_TIME,STATUS_CODE"].concat(rows.map(function (r) {
        return [r.id, r.name, (r.birth || "").replace(/-/g, ""), r.gender, r.insuranceNo, r.site, (r.date || "").replace(/-/g, ""), r.time, r.status].map(q).join(",");
      }));
      name = "emr_export_sample.csv";
    } else {
      lines = ["患者番号,予約番号,氏名,生年月日,性別,連絡先,保険者番号,会場,健診日,時間,受付チャネル,状態"].concat(rows.map(function (r) {
        return [r.id, r.resNo, r.name, r.birth, r.gender === "F" ? "女性" : "男性", r.phone, r.insuranceNo, r.site, r.date, r.time,
          r.channel === "online" ? "Web" : (r.channel === "phone" ? "電話" : "郵送"), r.status].map(q).join(",");
      }));
      name = "reservations_sample.csv";
    }
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function req(method, path, body) {
    var res = localApi(method, path, body !== undefined ? clone(body) : undefined);
    return res === undefined ? null : res;
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === "") return;
      if (Array.isArray(v)) {
        v.forEach(function (item) { parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(item)); });
      } else {
        parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
      }
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function makeEligible(o) {
    return function (gender, age) {
      if (o.gender && gender !== o.gender) return false;
      if (o.minAge != null && (age == null || age < o.minAge)) return false;
      if (o.maxAge != null && (age == null || age > o.maxAge)) return false;
      return true;
    };
  }

  async function init() {
    var cfg = await req("GET", "/config");
    state.SITES = cfg.sites;
    state.TIMES = cfg.times;
    state.SLOT_BASE_CAPACITY = cfg.slotBaseCapacity;
    state.COURSES = cfg.courses;
    state.OPTIONS = cfg.options.map(function (o) {
      o.eligible = makeEligible(o);
      return o;
    });
    state.REQUIRED_FIELDS = cfg.requiredFields;
    state.FIELD_LABELS = cfg.fieldLabels;
    state.SEED_YEAR = cfg.seedYear;
    state.SEED_MONTH = cfg.seedMonth;
    return cfg;
  }

  // ---------- 순수 헬퍼 (서버 왕복 불필요) ----------
  function pad(n, len) {
    len = len || 2;
    var s = String(n);
    while (s.length < len) s = "0" + s;
    return s;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function calcAge(birthISO, atISO) {
    if (!birthISO) return null;
    var b = new Date(birthISO);
    var at = new Date(atISO || todayISO());
    var age = at.getFullYear() - b.getFullYear();
    var m = at.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
    return age;
  }

  function fiscalYearRange(dateISO) {
    var d = new Date(dateISO || todayISO());
    var y = d.getFullYear();
    var startYear = d.getMonth() >= 3 ? y : y - 1;
    return [startYear + "-04-01", (startYear + 1) + "-03-31"];
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- 정원 ----------
  async function getSlot(site, date, time) {
    return req("GET", "/capacity" + qs({ site: site, date: date, time: time }));
  }

  async function getTimesForDate(site, date) {
    return req("GET", "/capacity/times" + qs({ site: site, date: date }));
  }

  async function getCapacityGrid(site) {
    return req("GET", "/capacity/grid" + qs({ site: site }));
  }

  // 날짜 단위 상태(o=여유/a=얼마안됨/x=마감) — capacity/grid 결과 한 날짜분을 넘기면 계산
  function dayStatusFromSlots(slotsByTime) {
    var vals = Object.keys(slotsByTime || {}).map(function (t) { return slotsByTime[t]; });
    if (!vals.length) return "x";
    var allUnavailable = vals.every(function (s) { return s.closed || s.remaining <= 0; });
    if (allUnavailable) return "x";
    var hasPlenty = vals.some(function (s) { return !s.closed && s.remaining >= 5; });
    return hasPlenty ? "o" : "a";
  }

  async function dayStatus(site, date) {
    var slots = await getTimesForDate(site, date);
    return dayStatusFromSlots(slots);
  }

  async function setTotal(site, date, time, total) {
    return req("PATCH", "/capacity", { site: site, date: date, time: time, total: total });
  }

  async function setUsed(site, date, time, used) {
    return req("PATCH", "/capacity", { site: site, date: date, time: time, used: used });
  }

  async function setClosed(site, date, time, closed) {
    return req("PATCH", "/capacity", { site: site, date: date, time: time, closed: closed });
  }

  async function getSiteBaseCapacity(site) {
    return req("GET", "/capacity/site-base" + qs({ site: site }));
  }

  async function updateSiteBaseCapacity(site, baseCapacity, user, role) {
    return req("POST", "/capacity/site-base", { site: site, baseCapacity: baseCapacity, user: user, role: role });
  }

  async function toggleHoliday(site, date, closed, reason, user, role) {
    return req("POST", "/capacity/holiday", { site: site, date: date, closed: closed, reason: reason, user: user, role: role });
  }

  // ---------- 예약 ----------
  async function listReservations(filters) {
    return req("GET", "/reservations" + qs(filters));
  }

  async function lookupReservation(resNo, birth) {
    try {
      return await req("GET", "/reservations/lookup?resNo=" + encodeURIComponent(resNo) + "&birth=" + encodeURIComponent(birth));
    } catch (e) {
      return null;
    }
  }

  async function getReservation(id) {
    return req("GET", "/reservations/" + encodeURIComponent(id));
  }

  async function lookupReservation(resNo, birth) {
    return req("GET", "/reservations/lookup" + qs({ resNo: resNo, birth: birth }));
  }

  async function addReservation(fields) {
    return req("POST", "/reservations", fields);
  }

  async function updateReservation(id, patch) {
    return req("PATCH", "/reservations/" + encodeURIComponent(id), patch);
  }

  async function confirmTemp(id) {
    return req("POST", "/reservations/" + encodeURIComponent(id) + "/confirm", {});
  }

  async function cancelReservation(id) {
    return req("POST", "/reservations/" + encodeURIComponent(id) + "/cancel", {});
  }

  async function addCallLog(id, memo, by) {
    return req("POST", "/reservations/" + encodeURIComponent(id) + "/call-log", { memo: memo, by: by });
  }

  // ---------- 발송 이력 ----------
  async function listNotices() {
    return req("GET", "/notices");
  }

  async function addNotice(notice) {
    return req("POST", "/notices", notice);
  }

  // ---------- 계정 및 조작 로그 ----------
  async function listAccounts() {
    return req("GET", "/accounts");
  }

  async function addAccount(acc) {
    return req("POST", "/accounts", acc);
  }

  async function updateAccount(id, patch) {
    return req("PATCH", "/accounts/" + encodeURIComponent(id), patch);
  }

  async function listAuditLogs() {
    return req("GET", "/audit-logs");
  }

  async function addAuditLog(entry) {
    return req("POST", "/audit-logs", entry);
  }

  async function reset() {
    return req("POST", "/reset", {});
  }

  async function updateOptionConfig(key, payload) {
    var res = await req("PATCH", "/options/" + encodeURIComponent(key), payload);
    if (res && res.option) {
      var opt = state.OPTIONS.find(function (o) { return o.key === key; });
      if (opt) {
        Object.assign(opt, res.option);
        opt.eligible = makeEligible(opt);
      }
    }
    return res;
  }

  function lookupZipcode(zip) {
    if (!zip) return null;
    var clean = zip.replace(/[^0-9]/g, "");
    var mockZipMap = {
      "9990001": "サンプル県 サンプル市 中央通",
      "9990002": "サンプル県 サンプル市 中央通",
      "9990003": "サンプル県 サンプル市 中央通",
      "9990004": "サンプル県 サンプル市 中央町",
      "9990005": "サンプル県 サンプル市 中央通",
      "9990006": "サンプル県 サンプル市 中央通",
      "9990007": "サンプル県 サンプル市 中央通 5丁目",
      "9990008": "サンプル県 サンプル市 中央町",
      "9990009": "サンプル県 サンプル市 北町1丁目",
      "9990010": "サンプル県 サンプル市 南町1丁目"
    };
    if (mockZipMap[clean]) {
      return mockZipMap[clean];
    }
    if (clean.length >= 3) {
      var prefix = clean.substring(0, 3);
      if (prefix === "070" || prefix === "078") return "サンプル県 サンプル市 中央区";
      if (prefix === "060" || prefix === "064") return "サンプル県 サンプル市 中央区";
      if (prefix === "040") return "サンプル県 サンプル市";
      return "サンプル県 サンプル市 (〒" + zip + ")";
    }
    return null;
  }

  return {
    init: init,
    get SITES() { return state.SITES; },
    get TIMES() { return state.TIMES; },
    get SLOT_BASE_CAPACITY() { return state.SLOT_BASE_CAPACITY; },
    get COURSES() { return state.COURSES; },
    get OPTIONS() { return state.OPTIONS; },
    get REQUIRED_FIELDS() { return state.REQUIRED_FIELDS; },
    get FIELD_LABELS() { return state.FIELD_LABELS; },
    get SEED_YEAR() { return state.SEED_YEAR; },
    get SEED_MONTH() { return state.SEED_MONTH; },

    getSlot: getSlot, getTimesForDate: getTimesForDate, getCapacityGrid: getCapacityGrid,
    dayStatus: dayStatus, dayStatusFromSlots: dayStatusFromSlots,
    setTotal: setTotal, setUsed: setUsed, setClosed: setClosed,
    getSiteBaseCapacity: getSiteBaseCapacity, updateSiteBaseCapacity: updateSiteBaseCapacity, toggleHoliday: toggleHoliday,

    listReservations: listReservations, getReservation: getReservation, lookupReservation: lookupReservation,
    addReservation: addReservation, updateReservation: updateReservation,
    confirmTemp: confirmTemp, cancelReservation: cancelReservation, addCallLog: addCallLog,
    updateOptionConfig: updateOptionConfig, lookupZipcode: lookupZipcode,

    listAccounts: listAccounts, addAccount: addAccount, updateAccount: updateAccount,
    listAuditLogs: listAuditLogs, addAuditLog: addAuditLog,

    listNotices: listNotices, addNotice: addNotice, reset: reset, exportCsv: exportCsv,


    calcAge: calcAge, fiscalYearRange: fiscalYearRange, todayISO: todayISO,
    escapeHtml: escapeHtml, pad: pad,
  };
})();

