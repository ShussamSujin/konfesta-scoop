/* ─────────────────────────────────────────────────────────────
   플레이버 워크숍 · 3스쿱 자리 배정 앱 (중등 B구역 · 초등 C구역 공용)
   선착순 셀프 등록 · 1스쿱은 선택, 2·3스쿱은 자동 · 자리 고정

   맛: 라운드용 7개, 자리 1~7 고정 (예산 1~2 · 보고서 3~6 · 네트워킹 7)
   1번은 빨강·주황 통합 부스. 연보라는 상시 오픈 상담 부스로 배정 제외.

   데이터: Firebase RTDB REST (상시 연결 없음 → 무료 요금제의
   동시 연결 100개 제한과 무관, 수백 명 동시 접속 안전 · 비용 0원)
   ───────────────────────────────────────────────────────────── */

const { useState, useEffect, useMemo, useRef } = React;

/* ── 행사별 설정 — index.html의 window.__EVENT_ID 로 선택 ── */
const EVENTS = {
  mid: {
    badge: "플레이버 워크숍 · B구역 · 중등",
    titlePre: "디선 31 · 골라 담는 ",
    titleAccent: "운영 꿀팁 3스쿱",
    desc: "예산 규모와 꼭 담고 싶은 주제를 고르면 3스쿱이 즉시 확정됩니다. 배정된 자리는 고정이에요.",
    dbPath: "konfesta31/mid",
    hosts: ["임슬기", "김송희", "김태연", "박준열", "이희수", "김두일", "김채은"],
    purpleTables: 3,
    dangHost: "이수진",
    tierDefault: "1등 기계식 키보드,20\n2등 노트북 파우치,20\n3등 보조배터리,20\n4등 베라 트리플 주니어,138",
  },
  el: {
    badge: "2026학년도 AI·디지털 활용 선도학교(초등) 공유회 · C구역",
    titlePre: "디지털 러닝 하프타임 · 운영의 ",
    titleAccent: "Flav-er",
    desc: "예산 규모와 꼭 담고 싶은 주제를 고르면 3스쿱이 즉시 확정됩니다. 배정된 자리는 고정이에요.",
    dbPath: "konfesta31/el",
    hosts: ["정준용", "김여미", "홍성용", "김경상", "백인규", "김승현", "이소영"],
    purpleTables: 2,
    dangHost: "천석경",
    tierDefault: "1등 기계식 키보드,18\n2등 노트북 파우치,18\n3등 보조배터리,18\n4등 베라 트리플 주니어,128",
  },
};
const EVID = window.__EVENT_ID || "mid";
const EV = EVENTS[EVID];
const LS_ME = `konfesta31_${EVID}_me`;
const LS_ADMIN = `konfesta31_${EVID}_admin`;

/* ── REST 데이터 계층 ── */
const DB = `https://dobble-game-by-sujin-default-rtdb.asia-southeast1.firebasedatabase.app/${EV.dbPath}`;

async function dbGet(path) {
  const r = await fetch(`${DB}/${path}.json`);
  if (!r.ok) throw new Error("read " + r.status);
  return r.json();
}
async function dbGetEtag(path) {
  const r = await fetch(`${DB}/${path}.json`, { headers: { "X-Firebase-ETag": "true" } });
  if (!r.ok) throw new Error("read " + r.status);
  return { etag: r.headers.get("ETag"), data: await r.json() };
}
async function dbPutIfMatch(path, etag, data) {
  const r = await fetch(`${DB}/${path}.json`, {
    method: "PUT", headers: { "if-match": etag }, body: JSON.stringify(data),
  });
  return r.status; // 200 성공, 412 충돌
}
async function dbPush(path, data) {
  const r = await fetch(`${DB}/${path}.json`, { method: "POST", body: JSON.stringify(data) });
  if (!r.ok) throw new Error("push " + r.status);
  return (await r.json()).name;
}
async function dbPatch(path, data) {
  const r = await fetch(`${DB}/${path}.json`, { method: "PATCH", body: JSON.stringify(data) });
  if (!r.ok) throw new Error("patch " + r.status);
}
async function dbDelete(path) {
  await fetch(`${DB}/${path}.json`, { method: "DELETE" });
}

/* 주기적 폴링 (화면이 보일 때만) — 상시 연결 대신 쓰는 실시간 대용 */
function usePolled(path, ms, enabled, fallback) {
  const [val, setVal] = useState(fallback);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, timer = null;
    const tick = async () => {
      if (document.visibilityState === "visible") {
        try { const v = await dbGet(path); if (alive) setVal(v === null ? fallback : v); } catch {}
      }
      if (alive) timer = setTimeout(tick, ms);
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [path, ms, enabled]);
  return val;
}

/* ── 맛 데이터 — 자리 1~7 고정 (색·맛·주제 공통, 발표자만 행사별) ── */
const FLAVOR_BASE = [
  { color: "#F26D6D", color2: "#F79A57", cname: "빨강·주황", name: "알뜰 딸기 스무디 · 새콤 망고 탱고", topic: "예산 소액~중간 (1,000만원 이내)", zone: "예산", tables: 2 },
  { color: "#F5C445", cname: "노랑", name: "화끈 파인 번개", topic: "예산 대규모 (1,000만원 초과)", zone: "예산", tables: 2 },
  { color: "#7CC98E", cname: "초록", name: "멜론 소다", topic: "Gemini · 교학공 운영", zone: "보고서", tables: 2 },
  { color: "#7CC5EE", cname: "하늘", name: "블루 하와이", topic: "ChatGPT · 사전·사후 조사", zone: "보고서", tables: 2 },
  { color: "#5D6FA8", cname: "남색", name: "미드나잇 소르베", topic: "Claude · 성과공유 보고회", zone: "보고서", tables: 2 },
  { color: "#6ED3C2", cname: "민트", name: "시원 소다", topic: "senGPT · 성과보고서", zone: "보고서", tables: 2 },
  { color: "#A07FD0", cname: "보라", name: "포도 알알이", topic: "네트워킹 · 성과 총정리", zone: "네트워킹&성과", tables: 3 },
];
const FLAVORS = FLAVOR_BASE.map((f, i) => ({
  ...f, host: EV.hosts[i], tables: i === 6 ? EV.purpleTables : f.tables,
}));
const N = FLAVORS.length; // 7
const DANG = { color: "#C6ADE8", cname: "연보라", name: "라벤더 허니", host: EV.dangHost, topic: "용한 디선당 · FAQ 상담 (상시 오픈)" };
const BUDGET = [0, 1];
const REPORT = [2, 3, 4, 5];
const NONBUDGET = [2, 3, 4, 5, 6];
const scaleFlavor = (scale) => (scale === "high" ? 1 : 0);

/* 색 점 표시 (빨강·주황 통합 부스는 반반 그라데이션) */
const dotBg = (f) => f.color2
  ? { background: `linear-gradient(135deg, ${f.color} 50%, ${f.color2} 50%)` }
  : { background: f.color };

/* ── 파스텔 캔디 디자인 토큰 ── */
const BG = "#FFF7EC";
const CARD = "#FFFFFF";
const CORAL = "#F0776B";
const LINE = "#F6B39B";
const LINE_SOFT = "#FBDCC8";
const INK = "#4A3B34";
const MUTED = "#8A776C";
const FAINT = "#B5A296";
const CHIP = "#FFF1E2";
const DANGER = "#E2574C";
const OK_BG = "#E9F7E9", OK_FG = "#3E7C4B";
const SHADOW = "0 10px 24px rgba(240,119,107,.14)";
const card = (extra) => ({ background: CARD, border: `2.5px solid ${LINE}`, borderRadius: 28, boxShadow: SHADOW, ...extra });
const input = { background: "#FFF9F1", border: `2px solid ${LINE_SOFT}`, borderRadius: 18, color: INK };

/* 자리별 총원(세 라운드 합) */
const totalOf = (counts, f) => (counts[0][f] || 0) + (counts[1][f] || 0) + (counts[2][f] || 0);

/* 정원: 라운드당 기본 20 → 7개 자리(총원 기준) 모두 마감이면 +2 자동 상향, 상한 25 */
function capacityFor(counts, settings) {
  const base = (settings && settings.baseCap) || 20;
  const max = (settings && settings.maxCap) || 25;
  let cap = base;
  while (cap < max && FLAVORS.every((_, f) => totalOf(counts, f) >= 3 * cap)) cap = Math.min(max, cap + 2);
  return cap;
}

const emptyCounts = () => [Array(N).fill(0), Array(N).fill(0), Array(N).fill(0)];

function tally(regs) {
  const c = emptyCounts();
  regs.forEach((r) => r.stops.forEach((f, i) => { if (f < N) c[i][f] += 1; }));
  return c;
}

/* 3스쿱 자동 배정 (규칙)
   ① 같은 맛 중복 방문 금지
   ② 고른 주제는 세 라운드 중 한 번 꼭 포함 — 라운드(순서)는 자동
   ③ 예산 스쿱 정확히 1개 — 등록 시 고른 예산 규모대로
      (1,000만원 이내 → 1번 빨강·주황 / 초과 → 2번 노랑)
   ④ 보고서 스쿱 1개 이상
   ⑤ 모든 라운드에 정원 상한 적용 — 정원 미만인 자리 중
      인원이 가장 적은 곳부터 채워 어느 한쪽도 넘치지 않게 분산 */
function autoStops(choice, scale, counts, cap) {
  const bf = scaleFlavor(scale);
  const stops = [null, null, null];
  // 필수 맛(고른 주제·예산 스쿱)을 각각 가장 여유 있는 라운드에 배치
  const placeReq = (f) => {
    const rounds = [0, 1, 2].filter((r) => stops[r] === null);
    const under = rounds.filter((r) => counts[r][f] < cap);
    const use = under.length ? under : rounds;
    use.sort((a, b) => (counts[a][f] - counts[b][f]) || (a - b));
    stops[use[0]] = f;
  };
  placeReq(choice);
  if (choice !== bf) placeReq(bf);
  // 남은 라운드 채우기: 정원 미만 우선 + 인원 적은 순 (전부 찼을 때만 최소 인원으로 초과 허용)
  const pickFill = (round, used, pool) => {
    const cands = pool.filter((f) => !used.includes(f));
    const under = cands.filter((f) => counts[round][f] < cap);
    const use = under.length ? under : cands;
    use.sort((a, b) => (counts[round][a] - counts[round][b]) || (a - b));
    return use[0];
  };
  for (let r = 0; r < 3; r++) {
    if (stops[r] !== null) continue;
    const used = stops.filter((x) => x !== null);
    const hasReport = used.some((f) => REPORT.includes(f));
    const emptyLeft = stops.filter((x) => x === null).length;
    // 마지막 빈 라운드까지 보고서가 없으면 보고서에서 뽑아 ④를 보장
    const pool = hasReport || emptyLeft > 1 ? NONBUDGET : REPORT;
    stops[r] = pickFill(r, used, pool);
  }
  return stops;
}

function regsToList(regsObj) {
  return Object.entries(regsObj || {})
    .map(([id, r]) => ({ id, ...r }))
    .filter((r) => r && r.stops && r.stops.length === 3)
    .sort((a, b) => a.seq - b.seq);
}

/* ── 배경 블롭 장식 ── */
function Blobs() {
  return (
    <svg className="pointer-events-none fixed inset-0 -z-10 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
      <ellipse cx="8%" cy="10%" rx="180" ry="140" fill="#FDE4D5" opacity="0.6" />
      <ellipse cx="94%" cy="18%" rx="160" ry="130" fill="#FBEBD2" opacity="0.7" />
      <ellipse cx="90%" cy="88%" rx="200" ry="150" fill="#F9E0E8" opacity="0.5" />
      <ellipse cx="6%" cy="92%" rx="170" ry="130" fill="#E8F1E2" opacity="0.6" />
    </svg>
  );
}

/* SVG용 반반 그라데이션 정의 */
function DualDefs() {
  return (
    <defs>
      <linearGradient id="dualBudget" x1="0" y1="0" x2="1" y2="1">
        <stop offset="50%" stopColor={FLAVOR_BASE[0].color} />
        <stop offset="50%" stopColor={FLAVOR_BASE[0].color2} />
      </linearGradient>
      <pattern id="wf" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#F3C489" />
        <path d="M0 0H10M0 0V10" stroke="#E0A05E" strokeWidth="1.4" />
      </pattern>
    </defs>
  );
}
const svgFill = (fi) => (FLAVORS[fi].color2 ? "url(#dualBudget)" : FLAVORS[fi].color);

/* ── 콘 카드 (캔디 광택) ── */
function Cone({ stops, size = 1 }) {
  return (
    <svg viewBox="0 0 150 214" width={150 * size} height={214 * size} role="img" aria-label="3스쿱 콘">
      <DualDefs />
      <polygon points="45,126 105,126 75,202" fill="url(#wf)" stroke={CORAL} strokeWidth="3" strokeLinejoin="round" />
      {[2, 1, 0].map((i) => {
        const cy = [120, 85, 52][i], r = [36, 34, 31][i];
        return (
          <g key={i}>
            <circle cx="75" cy={cy} r={r} fill={svgFill(stops[i])} stroke={CORAL} strokeWidth="3" />
            <ellipse cx={75 - r * 0.38} cy={cy - r * 0.42} rx={r * 0.3} ry={r * 0.18}
              fill="#fff" opacity="0.5" transform={`rotate(-24 ${75 - r * 0.38} ${cy - r * 0.42})`} />
            <text x="75" y={cy + 7} textAnchor="middle" fontSize="20" fontWeight="900" fill="#fff"
              stroke="rgba(0,0,0,.12)" strokeWidth="0.6">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── 원형 배치도 (자리 1~7 + 디선당) ── */
function Ring({ stops, size = 250 }) {
  const C = 150, R = 104;
  const pt = (p) => {
    const a = (p / (N + 1)) * 2 * Math.PI - Math.PI / 2;
    return [C + R * Math.cos(a), C + R * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 300 300" width={size} height={size} role="img" aria-label="자리 배치도">
      <DualDefs />
      <circle cx={C} cy={C} r={R} fill="none" stroke={LINE} strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
      {FLAVORS.map((f, fi) => {
        const [x, y] = pt(fi);
        const order = stops ? stops.indexOf(fi) : -1;
        const on = order > -1;
        const r = on ? 25 : 17;
        return (
          <g key={fi} opacity={stops && !on ? 0.3 : 1}>
            <circle cx={x} cy={y} r={r} fill={svgFill(fi)} stroke={on ? CORAL : LINE} strokeWidth={on ? 3.5 : 2.5} />
            <ellipse cx={x - r * 0.36} cy={y - r * 0.42} rx={r * 0.3} ry={r * 0.17} fill="#fff" opacity="0.5" />
            <text x={x} y={y + 6} textAnchor="middle" fontSize={on ? 17 : 12} fontWeight="900" fill="#fff">
              {on ? order + 1 : fi + 1}
            </text>
          </g>
        );
      })}
      {(() => {
        const [x, y] = pt(N);
        return (
          <g opacity={stops ? 0.65 : 1}>
            <circle cx={x} cy={y} r={17} fill={DANG.color} stroke={LINE} strokeWidth="2.5" />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">당</text>
          </g>
        );
      })()}
      <text x={C} y={C - 4} textAnchor="middle" fontSize="12" fontWeight="800" fill={FAINT}>자리 1~7</text>
      <text x={C} y={C + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill={FAINT}>당 = 디선당(상시)</text>
    </svg>
  );
}

/* ── 등록 화면 ── */
function Register({ settings, onDone }) {
  const [school, setSchool] = useState("");
  const [name, setName] = useState("");
  const [scale, setScale] = useState(null); // "low" 1,000만원 이내 · "high" 초과
  const [color, setColor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const state = usePolled("state", 5000, true, null);

  const counts = useMemo(() => {
    if (!state || !state.counts) return emptyCounts();
    return state.counts.map((row) => FLAVORS.map((_, f) => (row && row[f]) || 0));
  }, [state]);
  const cap = capacityFor(counts, settings);
  // 자리별 총 정원 = 라운드당 정원 × 3라운드 (고른 주제는 세 라운드 중 한 번 들어가므로)
  const leftOf = (f) => Math.max(0, 3 * cap - totalOf(counts, f));
  const scaleLeft = (key) => leftOf(scaleFlavor(key));
  const schools = useMemo(
    () => String((settings && settings.schools) || "").split("\n").map((s) => s.trim()).filter(Boolean),
    [settings]
  );

  function pickScale(s) {
    setScale(s); setErr("");
    // 반대 규모의 예산 맛을 골라 뒀다면 해제
    if (color !== null && BUDGET.includes(color) && color !== scaleFlavor(s)) setColor(null);
  }

  async function submit() {
    const s = school.trim(), n = name.trim();
    if (!n) { setErr("이름을 입력해 주세요."); return; }
    if (!scale) { setErr("우리 학교 예산 규모를 먼저 골라 주세요."); return; }
    if (color === null) { setErr("꼭 담고 싶은 주제를 골라 주세요."); return; }
    if (BUDGET.includes(color) && color !== scaleFlavor(scale)) {
      setErr("고른 예산 규모와 다른 예산 부스입니다. 다시 선택해 주세요."); return;
    }
    setBusy(true); setErr("");
    try {
      let assigned = null;
      for (let attempt = 0; attempt < 7 && !assigned; attempt++) {
        const { etag, data: st } = await dbGetEtag("state");
        const c = st && st.counts
          ? st.counts.map((row) => FLAVORS.map((_, f) => (row && row[f]) || 0))
          : emptyCounts();
        const capNow = capacityFor(c, settings);
        if (totalOf(c, scaleFlavor(scale)) >= 3 * capNow) {
          setErr("해당 예산 규모가 마감되었습니다. 운영진에게 문의해 주세요.");
          setBusy(false); setScale(null); return;
        }
        if (totalOf(c, color) >= 3 * capNow) {
          setErr("방금 그 주제가 마감되었습니다. 다른 주제를 골라 주세요.");
          setBusy(false); setColor(null); return;
        }
        const stops = autoStops(color, scale, c, capNow);
        stops.forEach((f, i) => { c[i][f] += 1; });
        const seq = ((st && st.seq) || 0) + 1;
        const status = await dbPutIfMatch("state", etag, { seq, counts: c });
        if (status === 200) assigned = { stops, seq };
        else if (status === 412) await new Promise((r) => setTimeout(r, 150 + Math.random() * 400));
        else throw new Error("save " + status);
      }
      if (!assigned) { setErr("등록이 몰리고 있어요. 잠시 후 다시 시도해 주세요."); setBusy(false); return; }
      const id = await dbPush("regs", {
        school: s, name: n, budget: scale, stops: assigned.stops, seq: assigned.seq, ts: { ".sv": "timestamp" },
      });
      localStorage.setItem(LS_ME, JSON.stringify({ id, school: s, name: n }));
      onDone();
    } catch (e) {
      setErr("저장에 실패했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  const scaleBtn = (key, label, sub) => {
    const on = scale === key;
    const left = scaleLeft(key);
    const closed = left === 0;
    return (
      <button onClick={() => pickScale(key)} disabled={closed}
        className="flex-1 px-4 py-3 text-left transition-transform active:scale-95"
        style={{
          background: on ? CORAL : closed ? "#F4ECE2" : "#FFF9F1", borderRadius: 20,
          border: on ? `2.5px solid ${CORAL}` : `2px solid ${closed ? "#E8DCCE" : LINE_SOFT}`,
          boxShadow: on ? SHADOW : "none", opacity: closed ? 0.55 : 1,
        }}>
        <span className="block text-sm font-extrabold" style={{ color: on ? "#fff" : INK }}>{label}</span>
        <span className="block text-[11px] font-bold" style={{ color: on ? "rgba(255,255,255,.85)" : FAINT }}>
          {sub} · {closed ? "마감" : `남은 자리 ${left}`}
        </span>
      </button>
    );
  };

  return (
    <section className="mx-auto max-w-lg">
      <div className="p-6" style={card()}>
        <h2 className="text-xl font-black" style={{ color: CORAL }}>셀프 등록</h2>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MUTED }}>
          <b style={{ color: INK }}>고른 주제와 예산 스쿱은 세 라운드 중 꼭 한 번씩</b> 들어가고,
          보고서 스쿱도 1개 이상 담깁니다. 순서(라운드)는 붐비지 않게 자동으로 정해져요.
        </p>

        <label className="mt-5 block text-xs font-extrabold" style={{ color: MUTED }}>학교 <span style={{ color: FAINT }}>(선택)</span></label>
        <input list="school-list" value={school} onChange={(e) => setSchool(e.target.value)}
          placeholder={schools.length ? "학교 이름 검색" : "학교 이름 입력"}
          className="mt-1.5 w-full px-4 py-3 text-base font-bold outline-none focus:ring-2"
          style={input} />
        <datalist id="school-list">{schools.map((s) => <option key={s} value={s} />)}</datalist>

        <label className="mt-4 block text-xs font-extrabold" style={{ color: MUTED }}>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 입력"
          className="mt-1.5 w-full px-4 py-3 text-base font-bold outline-none focus:ring-2"
          style={input} />

        <label className="mt-5 block text-xs font-extrabold" style={{ color: MUTED }}>
          ① 우리 학교 선도학교 예산 규모 <span style={{ color: FAINT }}>(예산 스쿱이 이걸로 정해져요)</span>
        </label>
        <div className="mt-2 flex gap-2">
          {scaleBtn("low", "1,000만원 이내", `빨강·주황 부스 · ${FLAVORS[0].host} 선생님`)}
          {scaleBtn("high", "1,000만원 초과", `노랑 부스 · ${FLAVORS[1].host} 선생님`)}
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-xs font-extrabold" style={{ color: MUTED }}>② 꼭 담고 싶은 주제 선택 <span style={{ color: FAINT }}>(순서는 자동)</span></span>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: CHIP, color: FAINT }}>라운드당 정원 {cap}명</span>
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FLAVORS.map((f, fi) => {
            const left = leftOf(fi);
            const full = left === 0;
            const wrongBudget = BUDGET.includes(fi) && scale !== null && fi !== scaleFlavor(scale);
            const needScale = BUDGET.includes(fi) && scale === null;
            const closed = full || wrongBudget || needScale;
            const on = color === fi;
            const subNote = full ? "마감" : wrongBudget ? "고른 예산 규모와 달라요" : needScale ? "예산 규모를 먼저 선택" : `남은 자리 ${left}`;
            return (
              <button key={fi} disabled={closed} onClick={() => { setColor(fi); setErr(""); }}
                className="flex items-center gap-2.5 px-3 py-3 text-left transition-transform active:scale-95"
                style={{
                  background: on ? f.color : closed ? "#F4ECE2" : "#FFF9F1",
                  border: on ? `2.5px solid ${CORAL}` : `2px solid ${closed ? "#E8DCCE" : LINE_SOFT}`,
                  borderRadius: 20, opacity: closed ? 0.55 : 1,
                  boxShadow: on ? SHADOW : "none",
                }}>
                <span className="relative h-7 w-7 shrink-0 rounded-full"
                  style={{ ...dotBg(f), border: on ? "2px solid rgba(255,255,255,.8)" : `2px solid ${LINE_SOFT}` }}>
                  <span className="absolute left-1 top-1 h-2 w-2.5 rounded-full bg-white opacity-60" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold leading-snug" style={{ color: on ? "#fff" : INK }}>{f.topic}</span>
                  <span className="block truncate text-[11px] font-bold" style={{ color: on ? "rgba(255,255,255,.85)" : FAINT }}>
                    {f.cname} · {f.host} · {subNote}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: FAINT }}>
          연보라 디선당(FAQ 상담 · {DANG.host})은 상시 오픈 부스라 선택지에 없어요. 어느 라운드든 배정 자리 대신 방문할 수 있습니다.
        </p>

        {err && <p className="mt-4 px-4 py-2.5 text-sm font-bold" style={{ background: "#FDEAE4", color: DANGER, borderRadius: 16 }}>{err}</p>}

        <button onClick={submit} disabled={busy}
          className="mt-5 w-full py-3.5 text-base font-black text-white transition-transform active:scale-95"
          style={{ background: busy ? FAINT : CORAL, borderRadius: 999, boxShadow: SHADOW }}>
          {busy ? "배정 중…" : "등록하고 3스쿱 받기 🍨"}
        </button>
        <p className="mt-3 text-center text-[11px] font-extrabold" style={{ color: DANGER }}>
          등록하면 자리가 확정되며 변경할 수 없습니다.
        </p>
      </div>
    </section>
  );
}

/* ── 내 자리 화면 ── */
function MySeat({ goRegister }) {
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = JSON.parse(localStorage.getItem(LS_ME) || "null");
        if (me && me.id) {
          const r = await dbGet(`regs/${me.id}`);
          if (r && r.stops) { setMine({ id: me.id, ...r }); setLoading(false); return; }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function search() {
    const s = q.trim();
    if (!s) return;
    setSearching(true);
    try {
      const all = regsToList(await dbGet("regs"));
      const hit = all.find((r) => r.name === s) ||
        all.find((r) => ((r.school || "") + " " + r.name).includes(s) || (r.name + " " + (r.school || "")).includes(s));
      if (hit) {
        setMine(hit);
        localStorage.setItem(LS_ME, JSON.stringify({ id: hit.id, school: hit.school, name: hit.name }));
      } else alert("등록 내역을 찾지 못했어요. 이름을 다시 확인해 주세요.");
    } catch { alert("조회에 실패했어요. 네트워크를 확인해 주세요."); }
    setSearching(false);
  }

  if (loading) {
    return <p className="mx-auto max-w-lg px-4 py-12 text-center text-sm font-bold" style={{ color: FAINT }}>불러오는 중…</p>;
  }
  if (!mine) {
    return (
      <section className="mx-auto max-w-lg">
        <div className="p-6 text-center" style={card()}>
          <p className="text-sm font-extrabold" style={{ color: INK }}>등록 정보를 찾을 수 없어요.</p>
          <div className="mt-4 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾기"
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              className="w-full px-4 py-3 text-center text-base font-bold outline-none focus:ring-2" style={input} />
            <button onClick={search} disabled={searching}
              className="shrink-0 px-5 text-sm font-black text-white" style={{ background: CORAL, borderRadius: 18 }}>
              {searching ? "…" : "찾기"}
            </button>
          </div>
          <button onClick={goRegister} className="mt-4 px-5 py-2.5 text-sm font-black"
            style={{ color: CORAL, border: `2px solid ${LINE}`, borderRadius: 999 }}>
            아직 등록 전이라면 → 등록하기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="p-6" style={card({ border: `3px solid ${CORAL}` })}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-4xl font-black tabular-nums" style={{ color: CORAL }}>
              {mine.seq}<span className="ml-1 text-base font-extrabold" style={{ color: FAINT }}>번</span>
            </div>
            <div className="mt-1 text-sm font-extrabold" style={{ color: MUTED }}>
              {(mine.school ? mine.school + " · " : "") + mine.name}
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-2" style={{ background: CHIP, border: `2px solid ${LINE_SOFT}` }}>
            {mine.stops.map((f, i) => (
              <span key={i} className="relative h-8 w-8 rounded-full text-center text-sm font-black leading-8 text-white"
                style={{ ...dotBg(FLAVORS[f]), border: `2px solid ${CORAL}` }}>
                <span className="absolute left-1 top-1 h-2 w-2.5 rounded-full bg-white opacity-50" />{i + 1}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <Cone stops={mine.stops} size={0.8} />
          <div className="min-w-0 flex-1">
            {mine.stops.map((f, i) => {
              const fl = FLAVORS[f];
              return (
                <div key={i} className="flex items-center gap-3 py-3" style={{ borderTop: `2px dashed ${LINE_SOFT}` }}>
                  <span className="w-4 text-center text-xs font-black" style={{ color: FAINT }}>{i + 1}</span>
                  <span className="relative h-9 w-9 shrink-0 rounded-full" style={{ ...dotBg(fl), border: `2.5px solid ${CORAL}` }}>
                    <span className="absolute left-1.5 top-1.5 h-2 w-3 rounded-full bg-white opacity-50" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold leading-snug" style={{ color: INK }}>{fl.topic}</div>
                    <div className="truncate text-xs" style={{ color: MUTED }}>
                      {fl.name} · {fl.cname} · {f + 1}번 자리 · {fl.host} 선생님
                    </div>
                  </div>
                  {i === 0 && <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black text-white" style={{ background: CORAL }}>착석 시작</span>}
                </div>
              );
            })}
          </div>
          <Ring stops={mine.stops} size={205} />
        </div>

        <p className="mt-5 px-4 py-3 text-xs font-extrabold leading-relaxed" style={{ background: "#FDEAE4", color: DANGER, borderRadius: 18 }}>
          배정된 자리를 지켜 주세요. 다른 발표 테이블에서는 스쿱 스티커를 받을 수 없습니다.
          단 하나의 예외 — 디선당(연보라)은 어느 라운드든 배정 자리 대신 선택할 수 있어요.
        </p>
        <p className="mt-2.5 px-4 py-3 text-xs leading-relaxed" style={{ background: CHIP, color: MUTED, borderRadius: 18 }}>
          1스쿱 자리에 앉아 시작하고, 라운드가 바뀔 때마다 이 화면을 다시 열어 다음 자리를 확인하세요.
        </p>
      </div>
    </section>
  );
}

/* ── 테이블 명단 (발표자용) — 5초 폴링 ── */
function Roster({ active }) {
  const [flavor, setFlavor] = useState(0);
  const [round, setRound] = useState(0);
  const regsObj = usePolled("regs", 5000, active, {});
  const regs = useMemo(() => regsToList(regsObj), [regsObj]);
  const list = useMemo(() => regs.filter((r) => r.stops[round] === flavor), [regs, flavor, round]);
  const f = FLAVORS[flavor];

  const pill = (on) => ({
    background: on ? CORAL : CARD, color: on ? "#fff" : MUTED,
    border: `2px solid ${on ? CORAL : LINE_SOFT}`, borderRadius: 999,
  });

  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex flex-wrap gap-1.5">
        {FLAVORS.map((fl, fi) => (
          <button key={fi} onClick={() => setFlavor(fi)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-extrabold" style={pill(flavor === fi)}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ ...dotBg(fl), border: "1.5px solid rgba(255,255,255,.7)" }} />{fl.cname}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((r) => (
          <button key={r} onClick={() => setRound(r)} className="px-4 py-2 text-xs font-extrabold" style={pill(round === r)}>
            {r + 1}스쿱
          </button>
        ))}
      </div>

      <div className="mt-4 p-5" style={card()}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-black leading-snug" style={{ color: INK }}>
            <span className="mr-2 inline-block h-4 w-4 translate-y-0.5 rounded-full" style={{ ...dotBg(f), border: `2px solid ${CORAL}` }} />
            {f.topic} · {round + 1}스쿱 명단
          </h2>
          <span className="shrink-0 rounded-full px-3 py-1 text-sm font-black text-white" style={{ background: CORAL }}>{list.length}명</span>
        </div>
        <p className="mt-1.5 text-[11px] font-bold" style={{ color: FAINT }}>
          {f.name} ({f.cname}) · {f.host} 선생님 — 5초마다 자동 갱신됩니다.
        </p>
        {list.length === 0 ? (
          <p className="mt-4 px-4 py-8 text-center text-sm font-bold" style={{ background: CHIP, color: FAINT, borderRadius: 18 }}>
            아직 배정된 참가자가 없어요.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {["순번", "이름", "학교"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-xs font-extrabold" style={{ color: FAINT, background: CHIP }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} style={{ borderTop: `2px dashed ${LINE_SOFT}` }}>
                    <td className="px-3 py-2 font-black tabular-nums" style={{ color: CORAL }}>{r.seq}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-extrabold" style={{ color: INK }}>{r.name}</td>
                    <td className="whitespace-nowrap px-3 py-2" style={{ color: MUTED }}>{r.school || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: MUTED }}>
          라운드 시작 직후 착석자와 대조하고, 명단에 없는 분께는 스티커를 배부하지 않습니다.
        </p>
      </div>
    </section>
  );
}

/* ── 럭키드로우 결과 — 8초 폴링 ── */
function DrawBoard({ active }) {
  const draws = usePolled("draws", 8000, active, {});
  const rounds = Object.entries(draws || {}).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
  if (!rounds.length) {
    return <p className="mx-auto max-w-lg px-4 py-12 text-center text-sm font-bold" style={{ background: CHIP, color: FAINT, borderRadius: 24 }}>
      아직 추첨 전이에요. 3스쿱을 모으면 자동으로 응모됩니다. 🍀
    </p>;
  }
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      {rounds.map(([id, d]) => (
        <div key={id} className="p-5" style={card()}>
          <h2 className="text-base font-black" style={{ color: CORAL }}>🎉 {d.label || "럭키 드로우"}</h2>
          {(d.tiers || []).map((t, ti) => (
            <div key={ti} className="mt-3.5">
              <div className="text-sm font-black" style={{ color: INK }}>{t.name} <span style={{ color: FAINT }}>({(t.winners || []).length}명)</span></div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(t.winners || []).map((w, wi) => (
                  <span key={wi} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold"
                    style={{ background: CHIP, border: `2px solid ${LINE_SOFT}`, borderRadius: 999, color: INK }}>
                    <span className="h-3 w-3 rounded-full" style={{ ...dotBg(FLAVORS[w.table]), border: `1.5px solid ${CORAL}` }} />
                    {w.seq}번 {w.name} {w.school ? <span style={{ color: FAINT }}>· {w.school}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-3.5 text-[11px] font-bold" style={{ color: FAINT }}>
            색 점 = 3스쿱(마지막) 테이블. 리플렛의 스티커 3장을 보여주고 경품을 받아 가세요.
          </p>
        </div>
      ))}
    </section>
  );
}

/* ── 운영 설정 (관리자) ── */
function Admin({ active }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem(LS_ADMIN) === "1");
  const [pw, setPw] = useState("");
  const settings = usePolled("settings", 15000, active && ok, {});
  const regsObj = usePolled("regs", 5000, active && ok, {});
  const draws = usePolled("draws", 8000, active && ok, {});
  const regs = useMemo(() => regsToList(regsObj), [regsObj]);

  const [schools, setSchools] = useState("");
  const [baseCap, setBaseCap] = useState(20);
  const [maxCap, setMaxCap] = useState(25);
  const [tierText, setTierText] = useState(EV.tierDefault);
  const [msg, setMsg] = useState("");
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current || !settings || !Object.keys(settings).length) return;
    loaded.current = true;
    if (settings.schools) setSchools(String(settings.schools));
    if (settings.baseCap) setBaseCap(settings.baseCap);
    if (settings.maxCap) setMaxCap(settings.maxCap);
    if (settings.tierText) setTierText(settings.tierText);
  }, [settings]);

  const ADMIN_PW = (settings && settings.adminPw) || "digital31";

  function enter() {
    if (pw === ADMIN_PW) { sessionStorage.setItem(LS_ADMIN, "1"); setOk(true); }
  }

  if (!ok) {
    return (
      <section className="mx-auto max-w-sm">
        <div className="p-6 text-center" style={card()}>
          <p className="text-sm font-extrabold" style={{ color: INK }}>운영진 전용 화면이에요. 🔑</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="운영 비밀번호"
            onKeyDown={(e) => { if (e.key === "Enter") enter(); }}
            className="mt-4 w-full px-4 py-3 text-center text-base font-bold outline-none focus:ring-2" style={input} />
          <button onClick={enter} className="mt-4 w-full py-3 text-sm font-black text-white"
            style={{ background: CORAL, borderRadius: 999, boxShadow: SHADOW }}>들어가기</button>
        </div>
      </section>
    );
  }

  const counts = tally(regs);
  const cap = capacityFor(counts, settings);
  const prevWinnerIds = new Set(
    Object.values(draws || {}).flatMap((d) => (d.tiers || []).flatMap((t) => (t.winners || []).map((w) => w.id)))
  );

  function note(t) { setMsg(t); setTimeout(() => setMsg(""), 4000); }

  async function saveSettings() {
    await dbPatch("settings", { schools, baseCap: Number(baseCap) || 20, maxCap: Number(maxCap) || 25, tierText });
    note("설정을 저장했습니다.");
  }

  async function runDraw() {
    const tiers = tierText.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, n] = l.split(",");
      return { name: (name || "").trim(), count: parseInt(n, 10) || 0 };
    }).filter((t) => t.name && t.count > 0);
    if (!tiers.length) { note("등수별 인원을 입력해 주세요. (예: 1등 키보드,20)"); return; }

    let pool = regs.filter((r) => !prevWinnerIds.has(r.id));
    if (!pool.length) { note("추첨 대상(미당첨 등록자)이 없습니다."); return; }
    const need = tiers.reduce((a, t) => a + t.count, 0);
    if (!confirm(`미당첨 등록자 ${pool.length}명 중 ${need}명을 추첨합니다. 실행할까요?`)) return;

    const byTable = FLAVORS.map(() => []);
    pool.forEach((r) => byTable[r.stops[2]].push(r));
    byTable.forEach((g) => g.sort(() => Math.random() - 0.5));

    const result = tiers.map((t) => ({ name: t.name, winners: [] }));
    tiers.forEach((t, ti) => {
      let tables = byTable.map((g, f) => ({ f, g })).filter((x) => x.g.length);
      let guard = t.count * 20;
      while (result[ti].winners.length < t.count && tables.length && guard--) {
        tables.sort((a, b) => b.g.length - a.g.length);
        const slot = tables[0];
        const w = slot.g.shift();
        result[ti].winners.push({ id: w.id, seq: w.seq, name: w.name, school: w.school || "", table: w.stops[2] });
        tables = tables.filter((x) => x.g.length);
      }
    });

    await dbPush("draws", {
      label: `추첨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`,
      tiers: result, ts: { ".sv": "timestamp" },
    });
    note("추첨 완료. ‘럭키드로우’ 탭에 결과가 공개되었습니다.");
  }

  function dlCsv(rows, filename) {
    const bom = "﻿";
    const blob = new Blob([bom + rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }
  function exportRegs() {
    dlCsv([
      ["순번", "학교", "이름", "예산규모", "1스쿱", "2스쿱", "3스쿱", "1스쿱주제", "2스쿱주제", "3스쿱주제"],
      ...regs.map((r) => [r.seq, r.school || "", r.name,
        r.budget === "high" ? "1000만원 초과" : "1000만원 이내",
        ...r.stops.map((f) => `${FLAVORS[f].name}(${FLAVORS[f].cname})`),
        ...r.stops.map((f) => FLAVORS[f].topic.replace(/,/g, " "))]),
    ], "등록명단.csv");
  }
  function exportWinners() {
    const rows = [["추첨", "등수", "순번", "이름", "학교", "3스쿱테이블"]];
    Object.values(draws || {}).forEach((d) => (d.tiers || []).forEach((t) =>
      (t.winners || []).forEach((w) => rows.push([d.label, t.name, w.seq, w.name, w.school, FLAVORS[w.table].name]))));
    dlCsv(rows, "당첨자.csv");
  }

  async function resetAll() {
    if (!confirm("등록 명단과 추첨 결과를 전부 삭제합니다. 행사 시작 전 시험 데이터 정리용입니다. 계속할까요?")) return;
    if (!confirm("정말 삭제할까요? 되돌릴 수 없습니다.")) return;
    await dbDelete("regs"); await dbDelete("draws"); await dbDelete("state");
    note("초기화했습니다.");
  }

  const btnGhost = { color: INK, border: `2px solid ${LINE_SOFT}`, borderRadius: 999, background: CARD };

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      {msg && <p className="px-4 py-2.5 text-sm font-extrabold" style={{ background: OK_BG, color: OK_FG, borderRadius: 16 }}>{msg}</p>}

      <div className="p-5" style={card()}>
        <h2 className="text-base font-black" style={{ color: CORAL }}>현황</h2>
        <p className="mt-1.5 text-sm" style={{ color: MUTED }}>
          등록 <b style={{ color: INK }}>{regs.length}명</b> · 현재 자리별 정원 <b style={{ color: INK }}>{cap}명</b>
          {cap > ((settings && settings.baseCap) || 20) && " (자동 상향 적용)"}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr>
              <th className="px-2 py-2 font-extrabold" style={{ color: FAINT, background: CHIP }}>주제</th>
              {["1스쿱", "2스쿱", "3스쿱"].map((h) => <th key={h} className="px-2 py-2 font-extrabold" style={{ color: FAINT, background: CHIP }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {FLAVORS.map((f, fi) => (
                <tr key={fi} style={{ borderTop: `2px dashed ${LINE_SOFT}` }}>
                  <td className="whitespace-nowrap px-2 py-2 font-extrabold" style={{ color: INK }}>
                    <span className="mr-1.5 inline-block h-3 w-3 translate-y-0.5 rounded-full" style={{ ...dotBg(f), border: `1.5px solid ${CORAL}` }} />{f.topic}
                  </td>
                  {[0, 1, 2].map((r) => (
                    <td key={r} className="px-2 py-2 font-black tabular-nums"
                      style={{ color: counts[r][fi] > cap ? DANGER : INK }}>{counts[r][fi]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-5" style={card()}>
        <h2 className="text-base font-black" style={{ color: CORAL }}>설정</h2>
        <label className="mt-3 block text-xs font-extrabold" style={{ color: MUTED }}>학교 목록 (한 줄에 하나 · 등록 화면 검색에 사용)</label>
        <textarea value={schools} onChange={(e) => setSchools(e.target.value)} rows={6}
          placeholder={"○○학교\n…"}
          className="mt-1.5 w-full px-4 py-3 text-sm outline-none focus:ring-2" style={input} />
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs font-extrabold" style={{ color: MUTED }}>
            기본 정원 <input type="number" value={baseCap} onChange={(e) => setBaseCap(e.target.value)}
              className="w-16 px-2 py-1.5 text-sm font-bold" style={input} />
          </label>
          <label className="flex items-center gap-2 text-xs font-extrabold" style={{ color: MUTED }}>
            정원 상한 <input type="number" value={maxCap} onChange={(e) => setMaxCap(e.target.value)}
              className="w-16 px-2 py-1.5 text-sm font-bold" style={input} />
          </label>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: FAINT }}>7개 자리가 모두 마감되면 정원이 +2씩 자동 상향됩니다 (상한까지).</p>
        <label className="mt-3 block text-xs font-extrabold" style={{ color: MUTED }}>등수별 경품·인원 (한 줄에 “이름,인원”)</label>
        <textarea value={tierText} onChange={(e) => setTierText(e.target.value)} rows={4}
          className="mt-1.5 w-full px-4 py-3 text-sm outline-none focus:ring-2" style={input} />
        <button onClick={saveSettings} className="mt-3.5 px-5 py-2.5 text-sm font-black text-white"
          style={{ background: CORAL, borderRadius: 999, boxShadow: SHADOW }}>설정 저장</button>
      </div>

      <div className="p-5" style={card()}>
        <h2 className="text-base font-black" style={{ color: CORAL }}>럭키 드로우</h2>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MUTED }}>
          등록자 전체(기존 당첨자 제외)를 대상으로 일괄 추첨하고, 당첨자를 3스쿱 테이블별로 고르게 배당합니다.
          재추첨하면 이전 당첨자는 자동 제외돼요. 미당첨 등록자 {regs.length - prevWinnerIds.size}명.
        </p>
        <button onClick={runDraw} className="mt-3.5 px-5 py-2.5 text-sm font-black text-white"
          style={{ background: "#A07FD0", borderRadius: 999, boxShadow: "0 10px 24px rgba(160,127,208,.25)" }}>
          🎁 추첨 실행
        </button>
      </div>

      <div className="p-5" style={card()}>
        <h2 className="text-base font-black" style={{ color: CORAL }}>데이터</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={exportRegs} className="px-4 py-2.5 text-sm font-extrabold" style={btnGhost}>등록 명단 CSV</button>
          <button onClick={exportWinners} className="px-4 py-2.5 text-sm font-extrabold" style={btnGhost}>당첨자 CSV</button>
          <button onClick={resetAll} className="px-4 py-2.5 text-sm font-extrabold"
            style={{ background: "#FDEAE4", color: DANGER, borderRadius: 999, border: "2px solid #F6C4BB" }}>전체 초기화</button>
        </div>
        <p className="mt-2.5 text-[11px]" style={{ color: FAINT }}>행사 전 시험 등록분은 ‘전체 초기화’로 반드시 비워 주세요.</p>
      </div>
    </section>
  );
}

/* ── 앱 본체 ── */
function App() {
  const [tab, setTab] = useState(() =>
    localStorage.getItem(LS_ME) ? "seat" : "register");
  const settings = usePolled("settings", 15000, true, {});

  const TABS = [
    { id: "register", label: "등록" },
    { id: "seat", label: "내 자리" },
    { id: "roster", label: "테이블 명단" },
    { id: "draw", label: "럭키드로우" },
    { id: "admin", label: "운영" },
  ];

  return (
    <div className="min-h-screen w-full px-4 py-7 sm:px-8"
      style={{ background: BG, color: INK, fontFamily: "'Pretendard Variable','Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif" }}>
      <Blobs />
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 text-center">
          <p className="text-xs font-extrabold tracking-[0.15em]" style={{ color: FAINT }}>
            {EV.badge}
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight sm:text-3xl" style={{ color: INK }}>
            {EV.titlePre}<span style={{ color: CORAL, whiteSpace: "nowrap" }}>{EV.titleAccent}</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed sm:text-sm" style={{ color: MUTED }}>
            {EV.desc}
          </p>
        </header>

        <nav className="mb-7 flex flex-wrap justify-center gap-1.5">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-4 py-2 text-sm font-extrabold transition-transform active:scale-95"
              style={{
                background: tab === t.id ? CORAL : CARD,
                color: tab === t.id ? "#fff" : MUTED,
                border: `2px solid ${tab === t.id ? CORAL : LINE_SOFT}`,
                borderRadius: 999,
                boxShadow: tab === t.id ? SHADOW : "none",
              }}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "register" && <Register settings={settings} onDone={() => setTab("seat")} />}
        {tab === "seat" && <MySeat goRegister={() => setTab("register")} />}
        {tab === "roster" && <Roster active={tab === "roster"} />}
        {tab === "draw" && <DrawBoard active={tab === "draw"} />}
        {tab === "admin" && <Admin active={tab === "admin"} />}

        <footer className="mt-12 pt-5 text-center text-xs leading-relaxed" style={{ borderTop: `2px dashed ${LINE_SOFT}`, color: FAINT }}>
          출석 체크와 질문·꿀팁 업로드는 콘페스타 플랫폼에서, 자리 배정·조회는 이 앱에서 합니다.
          <br />연보라 라벤더 허니(디선당 · {DANG.host})는 세 라운드 내내 상시 오픈 — 언제든 배정 자리 대신 방문할 수 있어요.
          <br /><span className="mt-1 inline-block font-bold" style={{ color: MUTED }}>
            © 2026 Google Certified Trainer &amp; Innovator Sujin Lee · 문의: gajungssamzzang@gmail.com
          </span>
        </footer>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
