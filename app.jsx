/* ─────────────────────────────────────────────────────────────
   디선 31 · 골라 담는 운영 꿀팁 3스쿱 — 자리 배정 앱
   선착순 셀프 등록 · 1스쿱은 선택, 2·3스쿱은 자동 · 자리 고정
   데이터는 Firebase Realtime Database 하나를 전원이 공유한다.
   ───────────────────────────────────────────────────────────── */

const { useState, useEffect, useMemo, useRef } = React;

/* ── Firebase ── */
const firebaseConfig = window.__FIREBASE_CONFIG;
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const ROOT = "konfesta31"; // 이 행사 데이터가 모이는 경로

/* ── 맛 데이터 (문서 1장 고정) ── */
const FLAVORS = [
  { color: "#D93A3A", cname: "빨강",   name: "알뜰 딸기 스무디", host: "임슬기", topic: "소액 예산 (1,000만원 이내)", zone: "예산", tables: 2 },
  { color: "#F08A24", cname: "주황",   name: "새콤 망고 탱고",   host: "임슬기", topic: "중간 예산 (1,000~3,000만원대)", zone: "예산", tables: 2 },
  { color: "#EFBE2A", cname: "노랑",   name: "화끈 파인 번개",   host: "김송희", topic: "대규모 예산", zone: "예산", tables: 2 },
  { color: "#3FA45B", cname: "초록",   name: "멜론 소다",       host: "김태연", topic: "Gemini · 교학공 운영", zone: "보고서", tables: 2 },
  { color: "#4FB6E8", cname: "하늘",   name: "블루 하와이",     host: "박준열", topic: "ChatGPT · 사전·사후 조사", zone: "보고서", tables: 2 },
  { color: "#2E3D6B", cname: "남색",   name: "미드나잇 소르베", host: "이희수", topic: "Claude · 성과공유 보고회", zone: "보고서", tables: 2 },
  { color: "#45BFAE", cname: "민트",   name: "시원 소다",       host: "김두일", topic: "senGPT · 성과보고서", zone: "보고서", tables: 2 },
  { color: "#7A4C9E", cname: "보라",   name: "포도 알알이",     host: "김채은", topic: "네트워킹 · 성과 총정리", zone: "네트워킹&성과", tables: 3 },
];
const DANG = { color: "#9B85C4", cname: "연보라", name: "라벤더 허니", host: "이수진", topic: "용한 디선당 · FAQ 상담 (상시 오픈)" };
const REPORT = [3, 4, 5, 6]; // 보고서 스쿱

const INK = "#3A2A24", PAPER = "#FFFDF7", RULE = "#E6DCCB", MUTED = "#7A6A5E", FAINT = "#A9998B";
const CREAM = "#F7F1E6";

/* 정원: 기본 20 → 8색 모두 마감이면 +2 자동 상향, 상한 25 (문서 2-4) */
function capacityFor(counts, settings) {
  const base = (settings && settings.baseCap) || 20;
  const max = (settings && settings.maxCap) || 25;
  let cap = base;
  while (cap < max && FLAVORS.every((_, f) => (counts[0][f] || 0) >= cap)) cap = Math.min(max, cap + 2);
  return cap;
}

/* 라운드별 인원 집계: counts[round][flavor] */
function tally(regs) {
  const c = [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
  regs.forEach((r) => r.stops.forEach((f, i) => { c[i][f] += 1; }));
  return c;
}

/* 2·3스쿱 자동 배정 (문서 7장 배정 규칙)
   ① 같은 맛 중복 없음 ② 보고서 스쿱 1개 이상 ③ 라운드별로 덜 찬 맛부터 */
function autoStops(first, counts) {
  const isReport = REPORT.includes(first);
  const pick = (round, used, pool) => {
    const cands = pool.filter((f) => !used.includes(f));
    cands.sort((a, b) => (counts[round][a] - counts[round][b]) || (a - b));
    return cands[0];
  };
  const all = [0, 1, 2, 3, 4, 5, 6, 7];
  if (isReport) {
    const s2 = pick(1, [first], all);
    const s3 = pick(2, [first, s2], all);
    return [first, s2, s3];
  }
  // 보고서가 아직 없으면: 두 후보 조합 중 균형이 나은 쪽에 보고서를 넣는다
  const r2 = pick(1, [first], REPORT);
  const o3 = pick(2, [first, r2], all);
  const planA = [first, r2, o3];
  const o2 = pick(1, [first], all);
  const r3 = pick(2, [first, o2], REPORT.includes(o2) ? all : REPORT);
  const planB = [first, o2, r3];
  const loadOf = (p) => counts[1][p[1]] + counts[2][p[2]];
  return loadOf(planB) < loadOf(planA) ? planB : planA;
}

/* ── 공유 데이터 훅 ── */
function useShared(path, fallback) {
  const [val, setVal] = useState(fallback);
  useEffect(() => {
    const ref = db.ref(`${ROOT}/${path}`);
    const cb = ref.on("value", (snap) => setVal(snap.val() === null ? fallback : snap.val()),
      () => setVal(fallback));
    return () => ref.off("value", cb);
  }, [path]);
  return val;
}

function regsToList(regsObj) {
  return Object.entries(regsObj || {})
    .map(([id, r]) => ({ id, ...r }))
    .filter((r) => r && r.stops && r.stops.length === 3)
    .sort((a, b) => a.seq - b.seq);
}

/* ── 콘 카드 ── */
function Cone({ stops, size = 1 }) {
  return (
    <svg viewBox="0 0 150 210" width={150 * size} height={210 * size} role="img" aria-label="3스쿱 콘">
      <defs>
        <pattern id="wf" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="9" height="9" fill="#D9A566" />
          <path d="M0 0H9M0 0V9" stroke="#B9803F" strokeWidth="1.2" />
        </pattern>
      </defs>
      <polygon points="46,124 104,124 75,200" fill="url(#wf)" stroke="#B9803F" strokeWidth="2" />
      {[2, 1, 0].map((i) => {
        const cy = [118, 84, 52][i], r = [35, 33, 30][i];
        return (
          <g key={i}>
            <circle cx="75" cy={cy} r={r} fill={FLAVORS[stops[i]].color} stroke="rgba(0,0,0,.18)" strokeWidth="2" />
            <text x="75" y={cy + 7} textAnchor="middle" fontSize="20" fontWeight="900" fill="#fff">{i + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ── 원형 배치도 (자리 1~8 + 디선당) ── */
function Ring({ stops, size = 260 }) {
  const C = 150, R = 105;
  const pt = (p) => {
    const a = (p / 9) * 2 * Math.PI - Math.PI / 2;
    return [C + R * Math.cos(a), C + R * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 300 300" width={size} height={size} role="img" aria-label="자리 배치도">
      <circle cx={C} cy={C} r={R} fill="none" stroke={RULE} strokeWidth="2" strokeDasharray="4 6" />
      {FLAVORS.map((f, fi) => {
        const [x, y] = pt(fi);
        const order = stops ? stops.indexOf(fi) : -1;
        const on = order > -1;
        return (
          <g key={fi}>
            <circle cx={x} cy={y} r={on ? 24 : 16} fill={f.color}
              stroke={on ? INK : "rgba(0,0,0,.12)"} strokeWidth={on ? 3 : 2}
              opacity={stops && !on ? 0.25 : 1} />
            <text x={x} y={y + 6} textAnchor="middle" fontSize={on ? 17 : 12} fontWeight="900" fill="#fff"
              opacity={stops && !on ? 0.5 : 1}>{on ? order + 1 : fi + 1}</text>
          </g>
        );
      })}
      {(() => {
        const [x, y] = pt(8);
        return (
          <g>
            <circle cx={x} cy={y} r={16} fill={DANG.color} stroke="rgba(0,0,0,.12)" strokeWidth="2"
              opacity={stops ? 0.6 : 1} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize="11" fontWeight="900" fill="#fff">당</text>
          </g>
        );
      })()}
      <text x={C} y={C - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={FAINT}>자리 1~8</text>
      <text x={C} y={C + 14} textAnchor="middle" fontSize="11" fontWeight="700" fill={FAINT}>당 = 디선당(상시)</text>
    </svg>
  );
}

/* ── 등록 화면 ── */
function Register({ regs, settings, onDone }) {
  const [school, setSchool] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const counts = useMemo(() => tally(regs), [regs]);
  const cap = capacityFor(counts, settings);
  const schools = useMemo(
    () => String(settings.schools || "").split("\n").map((s) => s.trim()).filter(Boolean),
    [settings.schools]
  );

  const dup = useMemo(() => {
    const n = name.trim(), s = school.trim();
    return n && regs.find((r) => r.name === n && r.school === s);
  }, [regs, name, school]);

  async function submit() {
    const s = school.trim(), n = name.trim();
    if (!s || !n) { setErr("학교와 이름을 입력해 주세요."); return; }
    if (color === null) { setErr("1스쿱으로 시작할 색을 골라 주세요."); return; }
    if (dup) { setErr("이미 등록되어 있습니다. ‘내 자리’에서 확인하세요."); return; }
    setBusy(true); setErr("");
    try {
      // 트랜잭션: 등록 순번·라운드별 인원을 원자적으로 갱신해 동시 등록 유실을 막는다 (문서 7장 유의사항)
      const stRef = db.ref(`${ROOT}/state`);
      let assigned = null;
      const res = await stRef.transaction((st) => {
        st = st || { seq: 0, counts: null };
        const c = st.counts
          ? st.counts.map((row) => FLAVORS.map((_, f) => (row && row[f]) || 0))
          : [Array(8).fill(0), Array(8).fill(0), Array(8).fill(0)];
        const capNow = capacityFor(c, settings);
        if ((c[0][color] || 0) >= capNow) return; // 마감 → 트랜잭션 중단
        const stops = autoStops(color, c);
        stops.forEach((f, i) => { c[i][f] += 1; });
        assigned = { stops, seq: (st.seq || 0) + 1 };
        return { seq: assigned.seq, counts: c };
      });
      if (!res.committed || !assigned) {
        setErr("방금 그 색이 마감되었습니다. 다른 색을 골라 주세요.");
        setBusy(false); setColor(null);
        return;
      }
      const rec = { school: s, name: n, stops: assigned.stops, seq: assigned.seq,
        ts: firebase.database.ServerValue.TIMESTAMP };
      const ref = await db.ref(`${ROOT}/regs`).push(rec);
      localStorage.setItem("konfesta31_me", JSON.stringify({ id: ref.key, school: s, name: n }));
      onDone(ref.key);
    } catch (e) {
      setErr("저장에 실패했습니다. 네트워크를 확인하고 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  return (
    <section className="mx-auto max-w-lg">
      <div className="rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <h2 className="text-lg font-black">셀프 등록</h2>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          고른 색이 <b>1스쿱 고정 자리</b>가 됩니다. 2·3스쿱은 겹치지 않게 자동으로 정해집니다.
        </p>

        <label className="mt-4 block text-xs font-bold" style={{ color: MUTED }}>학교</label>
        <input list="school-list" value={school} onChange={(e) => setSchool(e.target.value)}
          placeholder={schools.length ? "학교 이름 검색" : "학교 이름 입력"}
          className="mt-1 w-full rounded-xl px-3 py-2.5 text-base font-bold outline-none focus:ring-2"
          style={{ background: PAPER, border: `1px solid ${RULE}` }} />
        <datalist id="school-list">{schools.map((s) => <option key={s} value={s} />)}</datalist>

        <label className="mt-3 block text-xs font-bold" style={{ color: MUTED }}>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 입력"
          className="mt-1 w-full rounded-xl px-3 py-2.5 text-base font-bold outline-none focus:ring-2"
          style={{ background: PAPER, border: `1px solid ${RULE}` }} />

        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-xs font-bold" style={{ color: MUTED }}>1스쿱 색 선택</span>
          <span className="text-[11px]" style={{ color: FAINT }}>색상별 정원 {cap}명</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {FLAVORS.map((f, fi) => {
            const used = counts[0][fi] || 0;
            const left = Math.max(0, cap - used);
            const closed = left === 0;
            const on = color === fi;
            return (
              <button key={fi} disabled={closed} onClick={() => { setColor(fi); setErr(""); }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left"
                style={{
                  background: on ? INK : closed ? "#EFEAE0" : PAPER,
                  border: on ? `2px solid ${INK}` : `1px solid ${RULE}`,
                  opacity: closed ? 0.55 : 1,
                }}>
                <span className="h-6 w-6 shrink-0 rounded-full" style={{ background: f.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold" style={{ color: on ? "#fff" : INK }}>{f.name}</span>
                  <span className="block truncate text-[11px]" style={{ color: on ? "rgba(255,255,255,.7)" : FAINT }}>
                    {f.cname} · {f.host} · {closed ? "마감" : `남은 자리 ${left}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: FAINT }}>
          연보라(디선당)는 상시 오픈 상담 부스라 선택지에 없습니다. 어느 라운드든 배정 자리 대신 방문할 수 있어요.
        </p>

        {err && <p className="mt-3 rounded-lg px-3 py-2 text-sm font-bold" style={{ background: "#FBE9E7", color: "#B3261E" }}>{err}</p>}
        {dup && !err && (
          <p className="mt-3 rounded-lg px-3 py-2 text-xs font-bold" style={{ background: CREAM, color: MUTED }}>
            같은 학교·이름으로 이미 등록되어 있습니다. ‘내 자리’ 탭에서 확인하세요.
          </p>
        )}

        <button onClick={submit} disabled={busy}
          className="mt-4 w-full rounded-xl py-3 text-base font-black text-white"
          style={{ background: busy ? FAINT : INK }}>
          {busy ? "배정 중…" : "등록하고 3스쿱 받기"}
        </button>
        <p className="mt-3 text-center text-[11px] font-bold" style={{ color: "#B3261E" }}>
          등록하면 자리가 확정되며 변경할 수 없습니다.
        </p>
      </div>
    </section>
  );
}

/* ── 내 자리 화면 ── */
function MySeat({ regs, goRegister }) {
  const [q, setQ] = useState("");
  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("konfesta31_me") || "null"); } catch { return null; }
  }, [regs.length]);
  const mine = useMemo(() => {
    if (me && regs.find((r) => r.id === me.id)) return regs.find((r) => r.id === me.id);
    const s = q.trim();
    if (!s) return null;
    return regs.find((r) => r.name === s) ||
      regs.find((r) => (r.school + " " + r.name).includes(s) || (r.name + " " + r.school).includes(s));
  }, [me, regs, q]);

  if (!mine) {
    return (
      <section className="mx-auto max-w-lg">
        <div className="rounded-2xl p-5 text-center" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
          <p className="text-sm font-bold">등록 정보를 찾을 수 없습니다.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름으로 찾기 (예: 김철수)"
            className="mt-3 w-full rounded-xl px-3 py-2.5 text-center text-base font-bold outline-none focus:ring-2"
            style={{ background: PAPER, border: `1px solid ${RULE}` }} />
          <button onClick={goRegister} className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-white" style={{ background: INK }}>
            아직 등록 전이라면 → 등록하기
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <div className="rounded-2xl p-5" style={{ background: "#fff", border: `2px solid ${INK}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-4xl font-black tabular-nums">{mine.seq}<span className="ml-1 text-base font-bold" style={{ color: FAINT }}>번</span></div>
            <div className="mt-1 text-sm font-bold" style={{ color: MUTED }}>{mine.school} · {mine.name}</div>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl px-4 py-2" style={{ background: INK }}>
            {mine.stops.map((f, i) => (
              <span key={i} className="h-7 w-7 rounded-full text-center text-sm font-black leading-7 text-white"
                style={{ background: FLAVORS[f].color }}>{i + 1}</span>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <Cone stops={mine.stops} size={0.8} />
          <div className="min-w-0 flex-1">
            {mine.stops.map((f, i) => {
              const fl = FLAVORS[f];
              return (
                <div key={i} className="flex items-center gap-3 py-2.5" style={{ borderTop: `1px solid ${RULE}` }}>
                  <span className="w-4 text-center text-xs font-black" style={{ color: FAINT }}>{i + 1}</span>
                  <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: fl.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-bold">{fl.name}</span>
                      <span className="text-xs" style={{ color: FAINT }}>{fl.cname} · {f + 1}번 자리</span>
                    </div>
                    <div className="truncate text-xs" style={{ color: MUTED }}>{fl.host} · {fl.topic}</div>
                  </div>
                  {i === 0 && <span className="rounded-lg px-2 py-1 text-[10px] font-black text-white" style={{ background: INK }}>착석 시작</span>}
                </div>
              );
            })}
          </div>
          <Ring stops={mine.stops} size={210} />
        </div>

        <p className="mt-4 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "#FBE9E7", color: "#B3261E" }}>
          배정된 자리를 지켜 주세요. 다른 발표 테이블에서는 스쿱 스티커를 받을 수 없습니다.
          단 하나의 예외 — 디선당(연보라)은 어느 라운드든 배정 자리 대신 선택할 수 있습니다.
        </p>
        <p className="mt-2 rounded-xl px-3 py-2 text-xs" style={{ background: CREAM, color: MUTED }}>
          1스쿱 자리에 앉아 시작하고, 라운드가 바뀔 때마다 이 화면을 다시 열어 다음 자리를 확인하세요.
        </p>
      </div>
    </section>
  );
}

/* ── 테이블 명단 (발표자용) ── */
function Roster({ regs }) {
  const [flavor, setFlavor] = useState(0);
  const [round, setRound] = useState(0);
  const list = useMemo(
    () => regs.filter((r) => r.stops[round] === flavor),
    [regs, flavor, round]
  );
  const f = FLAVORS[flavor];
  return (
    <section className="mx-auto max-w-2xl">
      <div className="flex flex-wrap gap-1.5">
        {FLAVORS.map((fl, fi) => (
          <button key={fi} onClick={() => setFlavor(fi)}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold"
            style={{
              background: flavor === fi ? INK : "#fff", color: flavor === fi ? "#fff" : INK,
              border: `1px solid ${flavor === fi ? INK : RULE}`,
            }}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: fl.color }} />{fl.cname}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {[0, 1, 2].map((r) => (
          <button key={r} onClick={() => setRound(r)}
            className="rounded-xl px-4 py-2 text-xs font-bold"
            style={{
              background: round === r ? INK : "#fff", color: round === r ? "#fff" : INK,
              border: `1px solid ${round === r ? INK : RULE}`,
            }}>{r + 1}스쿱</button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-black">
            <span className="mr-2 inline-block h-3.5 w-3.5 translate-y-0.5 rounded-full" style={{ background: f.color }} />
            {f.name} · {round + 1}스쿱 명단
          </h2>
          <span className="text-sm font-black tabular-nums">{list.length}명</span>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: FAINT }}>
          {f.host} · {f.topic} — 등록되는 대로 실시간 갱신됩니다.
        </p>
        {list.length === 0 ? (
          <p className="mt-4 rounded-xl px-3 py-6 text-center text-sm" style={{ background: CREAM, color: FAINT }}>아직 배정된 참가자가 없습니다.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ background: CREAM }}>
                  {["순번", "이름", "학교"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-1.5 text-xs font-bold" style={{ color: MUTED }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} style={{ borderTop: `1px solid ${RULE}` }}>
                    <td className="px-3 py-1.5 font-black tabular-nums">{r.seq}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-bold">{r.name}</td>
                    <td className="whitespace-nowrap px-3 py-1.5" style={{ color: MUTED }}>{r.school}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px]" style={{ color: MUTED }}>
          라운드 시작 직후 착석자와 대조하고, 명단에 없는 분께는 스티커를 배부하지 않습니다.
        </p>
      </div>
    </section>
  );
}

/* ── 럭키드로우 결과 (전체 공개) ── */
function DrawBoard({ draws }) {
  const rounds = Object.entries(draws || {}).sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
  if (!rounds.length) {
    return <p className="mx-auto max-w-lg rounded-xl px-4 py-10 text-center text-sm" style={{ background: CREAM, color: FAINT }}>
      아직 추첨 전입니다. 3스쿱을 모으면 자동으로 응모됩니다.
    </p>;
  }
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      {rounds.map(([id, d]) => (
        <div key={id} className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
          <h2 className="text-base font-black">{d.label || "럭키 드로우"}</h2>
          {(d.tiers || []).map((t, ti) => (
            <div key={ti} className="mt-3">
              <div className="text-sm font-black" style={{ color: MUTED }}>{t.name} <span style={{ color: FAINT }}>({(t.winners || []).length}명)</span></div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(t.winners || []).map((w, wi) => (
                  <span key={wi} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold"
                    style={{ background: CREAM }}>
                    <span className="h-3 w-3 rounded-full" style={{ background: FLAVORS[w.table].color }} />
                    {w.seq}번 {w.name} <span style={{ color: FAINT }}>· {w.school}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <p className="mt-3 text-[11px]" style={{ color: FAINT }}>
            색 점 = 3스쿱(마지막) 테이블. 리플렛의 스티커 3장을 보여주고 경품을 받아 가세요.
          </p>
        </div>
      ))}
    </section>
  );
}

/* ── 운영 설정 (관리자) ── */
function Admin({ regs, settings, draws }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem("konfesta31_admin") === "1");
  const [pw, setPw] = useState("");
  const [schools, setSchools] = useState(String(settings.schools || ""));
  const [baseCap, setBaseCap] = useState(settings.baseCap || 20);
  const [maxCap, setMaxCap] = useState(settings.maxCap || 25);
  const [tierText, setTierText] = useState(settings.tierText || "1등 기계식 키보드,20\n2등 노트북 파우치,20\n3등 보조배터리,20\n4등 베라 트리플 주니어,138");
  const [msg, setMsg] = useState("");
  useEffect(() => { setSchools(String(settings.schools || "")); }, [settings.schools]);
  useEffect(() => { if (settings.baseCap) setBaseCap(settings.baseCap); }, [settings.baseCap]);
  useEffect(() => { if (settings.maxCap) setMaxCap(settings.maxCap); }, [settings.maxCap]);
  useEffect(() => { if (settings.tierText) setTierText(settings.tierText); }, [settings.tierText]);

  const ADMIN_PW = settings.adminPw || "digital31";

  if (!ok) {
    return (
      <section className="mx-auto max-w-sm">
        <div className="rounded-2xl p-5 text-center" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
          <p className="text-sm font-bold">운영진 전용 화면입니다.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="운영 비밀번호"
            onKeyDown={(e) => { if (e.key === "Enter" && pw === ADMIN_PW) { sessionStorage.setItem("konfesta31_admin", "1"); setOk(true); } }}
            className="mt-3 w-full rounded-xl px-3 py-2.5 text-center text-base font-bold outline-none focus:ring-2"
            style={{ background: PAPER, border: `1px solid ${RULE}` }} />
          <button onClick={() => { if (pw === ADMIN_PW) { sessionStorage.setItem("konfesta31_admin", "1"); setOk(true); } }}
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-black text-white" style={{ background: INK }}>들어가기</button>
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
    await db.ref(`${ROOT}/settings`).update({
      schools, baseCap: Number(baseCap) || 20, maxCap: Number(maxCap) || 25, tierText,
    });
    note("설정을 저장했습니다.");
  }

  /* 중앙 일괄 추첨: 당첨자를 3스쿱 테이블별로 고르게 배당 (문서 7장 럭키드로우) */
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

    // 테이블(3스쿱 맛)별 그룹 → 각 등수를 테이블에 라운드로빈 배당
    const byTable = FLAVORS.map(() => []);
    pool.forEach((r) => byTable[r.stops[2]].push(r));
    byTable.forEach((g) => g.sort(() => Math.random() - 0.5));

    const result = tiers.map((t) => ({ name: t.name, winners: [] }));
    tiers.forEach((t, ti) => {
      let tables = byTable.map((g, f) => ({ f, g })).filter((x) => x.g.length);
      let guard = t.count * 20;
      while (result[ti].winners.length < t.count && tables.length && guard--) {
        tables.sort((a, b) => b.g.length - a.g.length); // 남은 인원 많은 테이블부터 → 고른 배당
        const slot = tables[0];
        const w = slot.g.shift();
        result[ti].winners.push({ id: w.id, seq: w.seq, name: w.name, school: w.school, table: w.stops[2] });
        tables = tables.filter((x) => x.g.length);
      }
    });

    await db.ref(`${ROOT}/draws`).push({
      label: `추첨 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`,
      tiers: result, ts: firebase.database.ServerValue.TIMESTAMP,
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
      ["순번", "학교", "이름", "1스쿱", "2스쿱", "3스쿱", "1스쿱색", "2스쿱색", "3스쿱색"],
      ...regs.map((r) => [r.seq, r.school, r.name,
        ...r.stops.map((f) => FLAVORS[f].name), ...r.stops.map((f) => FLAVORS[f].cname)]),
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
    await db.ref(`${ROOT}/regs`).remove();
    await db.ref(`${ROOT}/draws`).remove();
    await db.ref(`${ROOT}/state`).remove();
    note("초기화했습니다.");
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      {msg && <p className="rounded-xl px-3 py-2 text-sm font-bold" style={{ background: "#E8F5E9", color: "#1B5E20" }}>{msg}</p>}

      <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <h2 className="text-base font-black">현황</h2>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          등록 <b style={{ color: INK }}>{regs.length}명</b> · 현재 색상별 정원 <b style={{ color: INK }}>{cap}명</b>
          {cap > (settings.baseCap || 20) && " (자동 상향 적용)"}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr style={{ background: CREAM }}>
              <th className="px-2 py-1.5 font-bold" style={{ color: MUTED }}>맛</th>
              {["1스쿱", "2스쿱", "3스쿱"].map((h) => <th key={h} className="px-2 py-1.5 font-bold" style={{ color: MUTED }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {FLAVORS.map((f, fi) => (
                <tr key={fi} style={{ borderTop: `1px solid ${RULE}` }}>
                  <td className="whitespace-nowrap px-2 py-1.5 font-bold">
                    <span className="mr-1.5 inline-block h-3 w-3 translate-y-0.5 rounded-full" style={{ background: f.color }} />{f.cname}
                  </td>
                  {[0, 1, 2].map((r) => (
                    <td key={r} className="px-2 py-1.5 font-black tabular-nums"
                      style={{ color: counts[r][fi] > cap ? "#B3261E" : INK }}>{counts[r][fi]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <h2 className="text-base font-black">설정</h2>
        <label className="mt-3 block text-xs font-bold" style={{ color: MUTED }}>학교 목록 (한 줄에 하나 · 등록 화면 검색에 사용)</label>
        <textarea value={schools} onChange={(e) => setSchools(e.target.value)} rows={6}
          placeholder={"용강중학교\n○○중학교\n…"}
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ background: PAPER, border: `1px solid ${RULE}` }} />
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: MUTED }}>
            기본 정원 <input type="number" value={baseCap} onChange={(e) => setBaseCap(e.target.value)}
              className="w-16 rounded-lg px-2 py-1 text-sm font-bold" style={{ border: `1px solid ${RULE}` }} />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold" style={{ color: MUTED }}>
            정원 상한 <input type="number" value={maxCap} onChange={(e) => setMaxCap(e.target.value)}
              className="w-16 rounded-lg px-2 py-1 text-sm font-bold" style={{ border: `1px solid ${RULE}` }} />
          </label>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: FAINT }}>8색이 모두 마감되면 정원이 +2씩 자동 상향됩니다 (상한까지).</p>
        <label className="mt-3 block text-xs font-bold" style={{ color: MUTED }}>등수별 경품·인원 (한 줄에 “이름,인원”)</label>
        <textarea value={tierText} onChange={(e) => setTierText(e.target.value)} rows={4}
          className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2"
          style={{ background: PAPER, border: `1px solid ${RULE}` }} />
        <button onClick={saveSettings} className="mt-3 rounded-xl px-4 py-2 text-sm font-black text-white" style={{ background: INK }}>설정 저장</button>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <h2 className="text-base font-black">럭키 드로우</h2>
        <p className="mt-1 text-xs" style={{ color: MUTED }}>
          등록자 전체(기존 당첨자 제외)를 대상으로 일괄 추첨하고, 당첨자를 3스쿱 테이블별로 고르게 배당합니다.
          재추첨하면 이전 당첨자는 자동 제외됩니다. 미당첨 등록자 {regs.length - prevWinnerIds.size}명.
        </p>
        <button onClick={runDraw} className="mt-3 rounded-xl px-4 py-2 text-sm font-black text-white" style={{ background: "#7A4C9E" }}>
          추첨 실행
        </button>
      </div>

      <div className="rounded-2xl p-4" style={{ background: "#fff", border: `1px solid ${RULE}` }}>
        <h2 className="text-base font-black">데이터</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={exportRegs} className="rounded-xl px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${RULE}` }}>등록 명단 CSV</button>
          <button onClick={exportWinners} className="rounded-xl px-4 py-2 text-sm font-bold" style={{ border: `1px solid ${RULE}` }}>당첨자 CSV</button>
          <button onClick={resetAll} className="rounded-xl px-4 py-2 text-sm font-bold" style={{ background: "#FBE9E7", color: "#B3261E" }}>전체 초기화</button>
        </div>
        <p className="mt-2 text-[11px]" style={{ color: FAINT }}>행사 전 시험 등록분은 ‘전체 초기화’로 반드시 비워 주세요.</p>
      </div>
    </section>
  );
}

/* ── 앱 본체 ── */
function App() {
  const [tab, setTab] = useState(() =>
    localStorage.getItem("konfesta31_me") ? "seat" : "register");
  const regsObj = useShared("regs", {});
  const settings = useShared("settings", {});
  const draws = useShared("draws", {});
  const regs = useMemo(() => regsToList(regsObj), [regsObj]);

  const TABS = [
    { id: "register", label: "등록" },
    { id: "seat", label: "내 자리" },
    { id: "roster", label: "테이블 명단" },
    { id: "draw", label: "럭키드로우" },
    { id: "admin", label: "운영" },
  ];

  return (
    <div className="min-h-screen w-full px-4 py-6 sm:px-8"
      style={{ background: PAPER, color: INK, fontFamily: "'Pretendard Variable','Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-5 text-center">
          <p className="text-xs font-bold tracking-[0.2em]" style={{ color: "#B0A091" }}>
            플레이버 워크숍 · B구역 · 중등
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">디선 31 · 골라 담는 운영 꿀팁 3스쿱</h1>
          <p className="mx-auto mt-1.5 max-w-xl text-xs sm:text-sm" style={{ color: MUTED }}>
            선착순으로 시작 색을 고르면 3스쿱이 즉시 확정됩니다. 배정된 자리는 고정입니다.
          </p>
        </header>

        <nav className="mb-6 flex flex-wrap justify-center gap-1" style={{ borderBottom: `2px solid ${RULE}` }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="relative px-3.5 py-2 text-sm font-bold sm:px-4"
              style={{ color: tab === t.id ? INK : FAINT }}>
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 -bottom-0.5 h-1 rounded-t" style={{ background: INK }} />}
            </button>
          ))}
        </nav>

        {tab === "register" && <Register regs={regs} settings={settings} onDone={() => setTab("seat")} />}
        {tab === "seat" && <MySeat regs={regs} goRegister={() => setTab("register")} />}
        {tab === "roster" && <Roster regs={regs} />}
        {tab === "draw" && <DrawBoard draws={draws} />}
        {tab === "admin" && <Admin regs={regs} settings={settings} draws={draws} />}

        <footer className="mt-10 pt-4 text-center text-xs" style={{ borderTop: `1px solid ${RULE}`, color: "#B0A091" }}>
          출석 체크와 질문·꿀팁 업로드는 콘페스타 플랫폼에서, 자리 배정·조회는 이 앱에서 합니다.
          <br />연보라 라벤더 허니(디선당 · 이수진)는 세 라운드 내내 상시 오픈 — 언제든 배정 자리 대신 방문할 수 있습니다.
        </footer>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
