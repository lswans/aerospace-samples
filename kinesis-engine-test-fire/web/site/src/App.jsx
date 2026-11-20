import { useCallback, useEffect, useRef, useState } from "react";

const API = window.ROCKET_API_URL || "";
const SIMULATED = !API;
const DURATION = 10;
const POLL_MS = 400;

const CONSOLE_LINKS = [
  ["Kinesis Data Viewer", "https://us-east-1.console.aws.amazon.com/kinesis/home?region=us-east-1#/streams/details/rocket-test-fire/dataViewer"],
  ["Producer and reader Lambda", "https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/rocket-demo-api?tab=code"],
  ["HTTP API routes", "https://us-east-1.console.aws.amazon.com/apigateway/main/apis/jmfy3h30b9/routes?api=jmfy3h30b9&region=us-east-1"],
  ["Amplify hosting", "https://us-east-1.console.aws.amazon.com/amplify/apps/d1q58sgi4m7r41/overview"],
];

const CHARTS = [
  { title: "Thrust (N)", max: 2200, series: [["thrust_n", "#ffb347"], ["predicted_thrust_n", "#5aa0ff"]], legend: true },
  { title: "Chamber temperature (°C)", max: 3200, series: [["chamber_temp_c", "#ff5a36"]] },
  { title: "Propellant burn rate (kg/s)", max: 1, series: [["burn_rate_kg_s", "#7ee787"]] },
  { title: "Chamber pressure (bar)", max: 40, series: [["chamber_pressure_bar", "#d2a8ff"]] },
];

const formatAxis = (value) => value >= 100 ? Math.round(value) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
const gaussian = (deviation) => deviation * (Math.random() + Math.random() + Math.random() - 1.5) * 1.63;

async function post(path, body) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) throw new Error(`${path} ${response.status}`);
  return response.json();
}

function Chart({ title, max, series, legend, rows }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * scale || canvas.height !== height * scale) {
        canvas.width = width * scale;
        canvas.height = height * scale;
      }
      const context = canvas.getContext("2d");
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      const left = 44;
      const plotWidth = width - left - 8;
      const plotHeight = height - 26;
      context.strokeStyle = "#232a37";
      context.fillStyle = "#8a94a6";
      context.font = "11px Inter";
      context.lineWidth = 1;

      for (let index = 0; index <= 4; index += 1) {
        const y = 8 + plotHeight - plotHeight * index / 4;
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(left + plotWidth, y);
        context.stroke();
        context.fillText(formatAxis(max * index / 4), 4, y + 4);
      }
      for (let second = 0; second <= DURATION; second += 2) {
        const x = left + plotWidth * second / DURATION;
        context.fillText(`${second}s`, x - 6, height - 4);
      }
      for (const [key, color] of series) {
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.beginPath();
        rows.forEach((row, index) => {
          const x = left + plotWidth * Math.min(row.t, DURATION) / DURATION;
          const y = 8 + plotHeight - plotHeight * Math.min(row[key], max) / max;
          if (index) context.lineTo(x, y);
          else context.moveTo(x, y);
        });
        context.stroke();
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [max, rows, series]);

  return (
    <div className="chart">
      <h3>
        {title}
        {legend && <span className="legend"><i className="k1" />measured <i className="k2" />predicted from burn rate</span>}
      </h3>
      <canvas ref={canvasRef} aria-label={`${title} chart`} />
    </div>
  );
}

function Engine({ thrust }) {
  const strength = Math.max(0, Math.min(thrust / 1800, 1.1));
  const visible = strength > 0.02;
  const scaleX = 0.6 + 0.5 * strength;
  const scaleY = 0.3 + 0.9 * strength;

  return (
    <svg id="engine" className={strength > 0.1 ? "burning" : ""} viewBox="0 0 400 620" role="img" aria-label="Rocket engine mounted on a static test stand">
      <defs>
        <linearGradient id="metal" x1="0" x2="1"><stop offset="0" stopColor="#5b6473" /><stop offset=".5" stopColor="#c9d1dc" /><stop offset="1" stopColor="#4a525f" /></linearGradient>
        <linearGradient id="chamber" x1="0" x2="1"><stop offset="0" stopColor="#6f3b1f" /><stop offset=".5" stopColor="#d8a06a" /><stop offset="1" stopColor="#5a2e16" /></linearGradient>
        <radialGradient id="flameCore" cx=".5" cy="0" r="1"><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#ffe680" /><stop offset=".6" stopColor="#ff8a1f" /><stop offset="1" stopColor="#ff3c00" stopOpacity="0" /></radialGradient>
        <radialGradient id="flameOuter" cx=".5" cy="0" r="1"><stop offset="0" stopColor="#78b4ff" stopOpacity=".9" /><stop offset=".5" stopColor="#ff7828" stopOpacity=".5" /><stop offset="1" stopColor="#ff3c00" stopOpacity="0" /></radialGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect x="40" y="20" width="320" height="18" rx="3" fill="#2b3240" />
      <rect x="60" y="38" width="14" height="300" fill="#2b3240" />
      <rect x="326" y="38" width="14" height="300" fill="#2b3240" />
      <rect x="40" y="330" width="320" height="14" rx="3" fill="#2b3240" />
      <line x1="74" y1="60" x2="326" y2="320" stroke="#232935" strokeWidth="6" />
      <line x1="326" y1="60" x2="74" y2="320" stroke="#232935" strokeWidth="6" />
      <text x="200" y="33" textAnchor="middle" fontSize="11" fill="#8a94a6">LOAD CELL MOUNT</text>
      <path d="M90 40v80h60v40" fill="none" stroke="#5aa0ff" strokeWidth="6" />
      <path d="M310 40v80h-60v40" fill="none" stroke="#ff7a5a" strokeWidth="6" />
      <text x="92" y="135" fontSize="10" fill="#5aa0ff">LOX</text>
      <text x="282" y="135" fontSize="10" fill="#ff7a5a">RP-1</text>
      <rect x="140" y="150" width="120" height="40" rx="6" fill="url(#metal)" />
      <rect id="chamberBody" x="150" y="190" width="100" height="120" rx="14" fill="url(#chamber)" />
      <path d="M160 310Q200 330 240 310L300 480Q200 520 100 480Z" fill="url(#metal)" />
      <path d="M118 470Q200 505 282 470" fill="none" stroke="#1d222c" strokeWidth="3" />
      <g opacity={visible ? Math.min(1, strength * 1.2) : 0} transform={`translate(200 480) scale(${scaleX} ${scaleY}) translate(-200 -480)`}>
        <path d="M112 478Q200 520 288 478L250 640Q200 700 150 640Z" fill="url(#flameOuter)" filter="url(#blur)" />
        <path d="M135 482Q200 510 265 482L235 600Q200 650 165 600Z" fill="url(#flameCore)" />
        <ellipse cx="200" cy="500" rx="40" ry="10" fill="#fff" opacity=".8" />
      </g>
      <rect x="0" y="560" width="400" height="60" fill="#0f131a" />
      <text x="200" y="600" textAnchor="middle" fontSize="12" fill="#8a94a6">FLAME TRENCH</text>
    </svg>
  );
}

function App() {
  const [rows, setRows] = useState([]);
  const [records, setRecords] = useState([]);
  const [latest, setLatest] = useState(null);
  const [latency, setLatency] = useState(null);
  const [impulse, setImpulse] = useState(0);
  const [status, setStatus] = useState(SIMULATED ? "Idle (simulated mode)" : "Idle");
  const [burning, setBurning] = useState(false);
  const rowsRef = useRef([]);
  const iteratorsRef = useRef(null);
  const impulseRef = useRef(0);
  const lastTimeRef = useRef(0);
  const quietPollsRef = useRef(0);
  const timerRef = useRef(null);
  const burningRef = useRef(false);

  const clearTimer = () => {
    window.clearTimeout(timerRef.current);
    window.clearInterval(timerRef.current);
  };

  const finish = useCallback((finalStatus = "Burn complete") => {
    burningRef.current = false;
    clearTimer();
    setBurning(false);
    setStatus(finalStatus);
  }, []);

  const reset = () => {
    clearTimer();
    rowsRef.current = [];
    impulseRef.current = 0;
    lastTimeRef.current = 0;
    quietPollsRef.current = 0;
    setRows([]);
    setRecords([]);
    setLatest(null);
    setLatency(null);
    setImpulse(0);
  };

  const ingest = useCallback((allRows, activeRows, latencyMs) => {
    if (allRows.length) setRecords((previous) => [...allRows].reverse().concat(previous));
    if (!activeRows.length) return;
    let nextImpulse = impulseRef.current;
    let lastTime = lastTimeRef.current;
    for (const row of activeRows) {
      nextImpulse += row.thrust_n * Math.max(0, row.t - lastTime);
      lastTime = row.t;
    }
    rowsRef.current = rowsRef.current.concat(activeRows);
    impulseRef.current = nextImpulse;
    lastTimeRef.current = lastTime;
    setRows(rowsRef.current);
    setLatest(activeRows[activeRows.length - 1]);
    setImpulse(nextImpulse);
    if (latencyMs != null) setLatency(latencyMs);
  }, []);

  const pollLoop = useCallback(async function run(activeBurnId) {
    if (!burningRef.current) return;
    try {
      const data = await post("/poll", { iterators: iteratorsRef.current });
      iteratorsRef.current = data.iterators;
      const activeRows = data.rows.filter((row) => row.burn_id === activeBurnId);
      ingest(data.rows, activeRows, data.latency_ms);
      quietPollsRef.current = activeRows.length ? 0 : quietPollsRef.current + 1;
      const done = rowsRef.current.length && lastTimeRef.current >= DURATION - 0.1 && quietPollsRef.current >= 3;
      if (done || quietPollsRef.current > 40) finish();
      else timerRef.current = window.setTimeout(() => run(activeBurnId), POLL_MS);
    } catch (error) {
      console.error(error);
      finish("Poll error");
    }
  }, [finish, ingest]);

  const simulate = () => {
    setStatus("Burning (simulated)");
    let index = 0;
    const frequency = 20;
    const start = performance.now();
    timerRef.current = window.setInterval(() => {
      const batch = [];
      while (index / frequency <= (performance.now() - start) / 1000 && index < DURATION * frequency) {
        const time = index / frequency;
        const level = Math.max(0, Math.min(time / 0.4, (8 - time) / 0.6, 1));
        const burnRate = Math.max(0, 0.83 * level + gaussian(0.01));
        batch.push({
          burn_id: "sim",
          t: time,
          thrust_n: Math.max(0, 1800 * level * (1 + 0.03 * Math.sin(time * 40)) + gaussian(15)),
          predicted_thrust_n: burnRate * 220 * 9.80665,
          burn_rate_kg_s: burnRate,
          chamber_temp_c: 25 + 2900 * (1 - Math.exp(-time / 1.2)) * (0.4 + 0.6 * level) + gaussian(8),
          chamber_pressure_bar: Math.max(0, 35 * level + gaussian(0.3)),
        });
        index += 1;
      }
      ingest(batch, batch, 180 + Math.round(gaussian(30)));
      if (index >= DURATION * frequency) finish();
    }, POLL_MS);
  };

  const initiateBurn = async () => {
    if (burningRef.current) return;
    reset();
    burningRef.current = true;
    setBurning(true);
    setStatus("Igniting");
    if (SIMULATED) {
      simulate();
      return;
    }
    try {
      if (!iteratorsRef.current) {
        const initial = await post("/poll", {});
        iteratorsRef.current = initial.iterators;
      }
      const burn = await post("/burn", {});
      setStatus("Burning");
      pollLoop(burn.burn_id);
    } catch (error) {
      console.error(error);
      finish("API error");
    }
  };

  useEffect(() => () => clearTimer(), []);

  const readout = latest || { thrust_n: 0, chamber_temp_c: 0, burn_rate_kg_s: 0, chamber_pressure_bar: 0, t: 0 };

  return (
    <>
      <header className="top">
        <div><h1>GSU-RX-1 static fire</h1><p className="sub">Engine telemetry streamed through Amazon Kinesis, live</p></div>
        <div className="controls">
          <div className="stat"><span className="label">End-to-end latency</span><span className="value mono">{latency == null ? "--" : `${latency} ms`}</span></div>
          <div className="stat"><span className="label">Status</span><span className="value">{status}</span></div>
          <button id="burn" className={!burning ? "armed" : ""} disabled={burning} onClick={initiateBurn}>Initiate Burn</button>
        </div>
      </header>

      <section className={`path ${burning ? "live" : ""}`}>
        <span className="node">Test stand</span><span className="arrow">→</span>
        <a className="node hot resource-node" href={CONSOLE_LINKS[0][1]} target="_blank" rel="noopener noreferrer">Amazon Kinesis Data Streams <span aria-hidden="true">↗</span></a><span className="arrow">→</span>
        <a className="node resource-node" href={CONSOLE_LINKS[1][1]} target="_blank" rel="noopener noreferrer">Reader (Lambda) <span aria-hidden="true">↗</span></a><span className="arrow">→</span>
        <span className="node">This page</span><span className="note">{rows.length} records</span>
      </section>

      <nav className="aws-resources" aria-label="AWS resources used by this demo">
        <span className="label">Open in AWS Console</span>
        {CONSOLE_LINKS.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} <span aria-hidden="true">↗</span></a>)}
      </nav>

      <details className="stream-panel">
        <summary><span>Live Kinesis records</span><span className="stream-summary">{records.length} received <span aria-hidden="true">▾</span></span></summary>
        <div className="stream-table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Thrust</th><th>Predicted</th><th>Temperature</th><th>Burn rate</th><th>Pressure</th></tr></thead>
            <tbody>{records.map((row) => <tr key={`${row.burn_id}-${row.ts ?? row.t}`}><td>{row.t.toFixed(2)} s</td><td>{Math.round(row.thrust_n)} N</td><td>{Math.round(row.predicted_thrust_n)} N</td><td>{Math.round(row.chamber_temp_c)} °C</td><td>{row.burn_rate_kg_s.toFixed(3)} kg/s</td><td>{row.chamber_pressure_bar.toFixed(1)} bar</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <main className="grid">
        <section className="stand">
          <Engine thrust={readout.thrust_n} />
          <div className="readouts">
            <div><span className="label">Thrust</span><span className="mono">{Math.round(readout.thrust_n)} N</span></div>
            <div><span className="label">Chamber temp</span><span className="mono">{Math.round(readout.chamber_temp_c)} °C</span></div>
            <div><span className="label">Burn rate</span><span className="mono">{readout.burn_rate_kg_s.toFixed(3)} kg/s</span></div>
            <div><span className="label">Pressure</span><span className="mono">{readout.chamber_pressure_bar.toFixed(1)} bar</span></div>
            <div><span className="label">Total impulse</span><span className="mono">{Math.round(impulse)} N·s</span></div>
            <div><span className="label">Burn time</span><span className="mono">{readout.t.toFixed(1)} s</span></div>
          </div>
        </section>
        <section className="charts">{CHARTS.map((chart) => <Chart key={chart.title} {...chart} rows={rows} />)}</section>
      </main>

      <footer className="foot"><p>Pressing the button starts a producer writing 20 rows each second. Kinesis carries those rows to a reader. This page charts the returned engine data. Amazon Managed Service for Apache Flink can replace the reader for windows, alarms, and total impulse.</p></footer>
    </>
  );
}

export default App;
