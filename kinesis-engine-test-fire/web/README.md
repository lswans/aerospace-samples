# Rocket engine test stand: live telemetry over Amazon Kinesis

A React page shows a rocket engine on a test stand. Press **Initiate Burn**: a producer starts
writing 20 telemetry rows per second into a Kinesis data stream, a reader pulls them back off the
stream, and the page animates the plume and charts thrust, chamber temperature, burn rate and
pressure. End-to-end latency shows as one number.

```
[Initiate Burn] -> API Gateway -> Lambda (producer) -> Kinesis Data Streams -> Lambda (reader) -> React page
```

## Files

| File | Job |
|---|---|
| `template.yaml` | SAM: HTTP API (`POST /burn`, `POST /poll`), one Lambda, least-privilege role, throttling |
| `lambda/app.py` | Producer (async self-invoke, 10 s burn) and reader (shard iterators, latency) |
| `lambda/test_offline.py` | Fake-Kinesis test: `python test_offline.py` |
| `lambda/test_live.py` | Real-stream test; needs `aws login` |
| `site/src/App.jsx` | React UI, engine SVG, charts, live record panel and polling client |
| `site/public/config.json` | API URL placeholder; `deploy.sh` replaces the built copy |
| `deploy.sh` | Builds Vite, deploys the API, uploads `dist/` to Amplify, then locks CORS |

## Run it

Local simulated mode:

    cd site
    npm ci
    npm run dev

Open the local URL. An empty `public/config.js` enables simulated data.

Build only:

    cd site
    npm run build

Deploy (needs `aws login`, `sam`, Node.js, npm, and zip):

    ./deploy.sh

The stream `rocket-test-fire` must exist in us-east-1. The script prints the site URL and teardown commands.

## Talking points

- Kinesis decouples the test stand from every consumer. The React page is one reader; a recorder,
  abort monitor and data-lake archive can read the same stream.
- Latency is the round trip through the stream, not stand network lag.
- Amazon Managed Service for Apache Flink can compute 1 s windows, running total impulse and
  redline alarms in-stream, then publish results to another stream.

## Security notes

- The page and API are public for anonymous students. `POST /burn` is throttled to 5 requests/s
  with burst 10. Lambda reserved concurrency is 4. Each burn writes about 200 records.
- The Lambda role can only read and write one stream and invoke itself.
- CORS is locked to the Amplify origin after deployment.
