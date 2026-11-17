# Rocket engine test-stand web demo: plan

Goal: a public web page that shows a rocket engine on a test stand. "Initiate Burn" starts the
real Kinesis producer. Engine metrics (thrust, chamber temperature, burn rate, pressure) chart
live. End-to-end latency is one number.

## Parts

| Part | Service | Job |
|---|---|---|
| Page | Amplify (static) | SVG engine + canvas charts, polls the API |
| API | API Gateway HTTP API | `POST /burn`, `GET /telemetry` |
| Worker | Lambda `rocket-demo-api` | `POST /burn`: invokes itself async, async run streams 10 s of telemetry into Kinesis. `GET /telemetry`: reads the stream from a shard iterator and returns new rows |
| Stream | Kinesis `rocket-test-fire` (exists) | the pipe |
| Flink (optional, later) | Managed Service for Apache Flink | 1 s windows: avg thrust, max temp, cumulative impulse |

Data path: button -> API -> Lambda(producer) -> Kinesis -> Lambda(reader) -> page.
Latency shown = page receive time - producer `ts` (clocks: both are the page's and Lambda's, fine for a demo).

## Security decisions

- The page and API are public (anonymous students watch it). No auth is added; builder-security
  treats public demo content as legitimately unauthenticated.
- `POST /burn` is a write. Mitigation: API Gateway throttle (rate 2/s, burst 5); the Lambda refuses a
  new burn while one is in progress (409); Lambda reserved concurrency 2.
- IAM: Lambda role gets `kinesis:PutRecords`, `GetRecords`, `GetShardIterator`, `ListShards`,
  `DescribeStreamSummary` on the one stream ARN, plus `lambda:InvokeFunction` on itself.
- CORS: only the Amplify origin (set after first deploy), `*` for the first smoke test.
- Cost: stream is on-demand; Lambda runs 10 s per burn; tear down with `delete-stack` after the talk.

## Files

- `template.yaml`: API, Lambda, role, throttle.
- `lambda/app.py`: handler.
- `site/index.html`, `site/app.js`, `site/styles.css`: the page. `site/config.js` holds the API URL.
- `deploy.sh`: deploy stack, write `config.js`, zip the site for Amplify manual deploy.
