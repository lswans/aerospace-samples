const API = window.ROCKET_API_URL || "";
const SIM = !API;
const DURATION = 10, POLL_MS = 400;
const $ = (id) => document.getElementById(id);

let rows = [], iterators = null, burning = false, impulse = 0, lastT = 0, pollTimer = null, quietPolls = 0;

// ---------- charts ----------
const charts = {
  thrust: { el: $("cThrust"), max: 2200, series: [["thrust_n", "#ffb347"], ["predicted_thrust_n", "#5aa0ff"]] },
  temp:   { el: $("cTemp"),   max: 3200, series: [["chamber_temp_c", "#ff5a36"]] },
  burn:   { el: $("cBurn"),   max: 1.0,  series: [["burn_rate_kg_s", "#7ee787"]] },
  press:  { el: $("cPress"),  max: 40,   series: [["chamber_pressure_bar", "#d2a8ff"]] },
};

function drawChart(c) {
  const cv = c.el, dpr = devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const L = 44, B = 18, pw = w - L - 8, ph = h - B - 8;
  g.strokeStyle = "#232a37"; g.fillStyle = "#8a94a6"; g.font = "11px Inter"; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 8 + ph - (ph * i) / 4;
    g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
    g.fillText(fmt(c.max * i / 4), 4, y + 4);
  }
  for (let s = 0; s <= DURATION; s += 2) {
    const x = L + (pw * s) / DURATION;
    g.fillText(s + "s", x - 6, h - 4);
  }
  for (const [key, color] of c.series) {
    g.strokeStyle = color; g.lineWidth = 2; g.beginPath();
    rows.forEach((r, i) => {
      const x = L + (pw * Math.min(r.t, DURATION)) / DURATION;
      const y = 8 + ph - (ph * Math.min(r[key], c.max)) / c.max;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
  }
}
const fmt = (v) => v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
function drawAll() { Object.values(charts).forEach(drawChart); }

// ---------- engine animation ----------
function setFlame(thrust) {
  const k = Math.max(0, Math.min(thrust / 1800, 1.1));
  const plume = $("plume"), flick = 1 + (Math.random() - 0.5) * 0.12;
  plume.setAttribute("opacity", k > 0.02 ? Math.min(1, k * 1.2) : 0);
  plume.setAttribute("transform", `translate(200 480) scale(${(0.6 + 0.5 * k) * flick} ${(0.3 + 0.9 * k) * flick}) translate(-200 -480)`);
  $("engine").classList.toggle("burning", k > 0.1);
}

// ---------- state ----------
function appendStreamRows(newRows) {
  const body = $("streamRows"), fragment = document.createDocumentFragment();
  for (const r of newRows) {
    const tr = document.createElement("tr");
    for (const value of [
      `${r.t.toFixed(2)} s`, `${Math.round(r.thrust_n)} N`, `${Math.round(r.predicted_thrust_n)} N`,
      `${Math.round(r.chamber_temp_c)} °C`, `${r.burn_rate_kg_s.toFixed(3)} kg/s`,
      `${r.chamber_pressure_bar.toFixed(1)} bar`
    ]) {
      const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
    }
    fragment.prepend(tr);
  }
  body.prepend(fragment);
  $("streamCount").textContent = body.rows.length;
}

function ingest(newRows, latency) {
  appendStreamRows(newRows);
  for (const r of newRows) {
    if (rows.length && r.t <= rows[rows.length - 1].t && r.burn_id !== rows[rows.length - 1].burn_id) continue;
    impulse += r.thrust_n * Math.max(0, r.t - lastT); lastT = r.t;
    rows.push(r);
  }
  if (!newRows.length) return;
  const r = rows[rows.length - 1];
  $("rThrust").textContent = `${Math.round(r.thrust_n)} N`;
  $("rTemp").textContent = `${Math.round(r.chamber_temp_c)} °C`;
  $("rBurn").textContent = `${r.burn_rate_kg_s.toFixed(3)} kg/s`;
  $("rPress").textContent = `${r.chamber_pressure_bar.toFixed(1)} bar`;
  $("rImpulse").textContent = `${Math.round(impulse)} N·s`;
  $("rTime").textContent = `${r.t.toFixed(1)} s`;
  $("rowcount").textContent = `${rows.length} records`;
  if (latency != null) $("latency").textContent = `${latency} ms`;
  setFlame(r.thrust_n);
  drawAll();
}

function reset() {
  rows = []; impulse = 0; lastT = 0; quietPolls = 0;
  $("streamRows").replaceChildren(); $("streamCount").textContent = "0";
  $("rowcount").textContent = "0 records"; $("latency").textContent = "--";
  setFlame(0); drawAll();
}

function finish() {
  burning = false; clearInterval(pollTimer);
  document.querySelector(".path").classList.remove("live");
  $("status").textContent = "Burn complete"; $("burn").disabled = false; $("burn").classList.add("armed");
  setFlame(0);
}

// ---------- API ----------
async function post(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function pollOnce() {
  const data = await post("/poll", { iterators });
  iterators = data.iterators;
  ingest(data.rows, data.latency_ms);
  quietPolls = data.rows.length ? 0 : quietPolls + 1;
  if (rows.length && lastT >= DURATION - 0.1 && quietPolls >= 3) finish();
  if (quietPolls > 40) finish();
}

async function initiateBurn() {
  $("burn").disabled = true; $("burn").classList.remove("armed");
  $("status").textContent = "Igniting"; reset(); burning = true;
  document.querySelector(".path").classList.add("live");
  try {
    if (SIM) { simulate(); return; }
    if (!iterators) await pollOnce();
    await post("/burn");
    $("status").textContent = "Burning";
    pollTimer = setInterval(() => pollOnce().catch((e) => { console.error(e); $("status").textContent = "Poll error"; }), POLL_MS);
  } catch (e) {
    console.error(e); $("status").textContent = "API error"; finish();
  }
}

// ---------- simulated mode (no AWS) ----------
function simulate() {
  $("status").textContent = "Burning (simulated)";
  let i = 0; const hz = 20, t0 = performance.now();
  pollTimer = setInterval(() => {
    const batch = [];
    while (i / hz <= (performance.now() - t0) / 1000 && i < DURATION * hz) {
      const t = i / hz, level = Math.max(0, Math.min(t / 0.4, (8 - t) / 0.6, 1));
      const burn = Math.max(0, 0.83 * level + gauss(0.01));
      batch.push({ burn_id: "sim", t, thrust_n: Math.max(0, 1800 * level * (1 + 0.03 * Math.sin(t * 40)) + gauss(15)),
        predicted_thrust_n: burn * 220 * 9.80665, burn_rate_kg_s: burn,
        chamber_temp_c: 25 + 2900 * (1 - Math.exp(-t / 1.2)) * (0.4 + 0.6 * level) + gauss(8),
        chamber_pressure_bar: Math.max(0, 35 * level + gauss(0.3)) });
      i++;
    }
    ingest(batch, 180 + Math.round(gauss(30)));
    if (i >= DURATION * hz) finish();
  }, POLL_MS);
}
const gauss = (sd) => sd * (Math.random() + Math.random() + Math.random() - 1.5) * 1.63;

$("burn").addEventListener("click", initiateBurn);
$("burn").classList.add("armed");
if (SIM) $("status").textContent = "Idle (simulated mode)";
window.addEventListener("resize", drawAll);
drawAll();
