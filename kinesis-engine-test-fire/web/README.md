# Rocket engine test stand: live telemetry over Amazon Kinesis

A web page shows a rocket engine on a test stand. Press **Initiate Burn**: a producer starts
writing 20 telemetry rows per second into a Kinesis data stream, a reader pulls them back off the
stream, and the page animates the plume and charts thrust, chamber temperature, burn rate and
pressure as the test runs. End-to-end latency (producer write to reader read) shows as one number.

```
[Initiate Burn] -> API Gateway -> Lambda (producer) -> Kinesis Data Streams -> Lambda (reader) -> page
```

## Files

| File | Job |
|---|---|
| `template.yaml` | SAM: HTTP API (`POST /burn`, `POST /poll`), one Lambda, least-privilege role, throttling |
| `lambda/app.py` | Producer (async self-invoke, 10 s burn) and reader (shard iterators, latency) |
| `lambda/test_offline.py` | Fake-Kinesis test: `python test_offline.py` |
| `lambda/test_live.py` | Real-stream test; needs `aws login` |
| `site/` | Static page: SVG engine, canvas charts, polling client. `config.js` holds the API URL |
| `deploy.sh` | Deploys the API, writes `config.js`, uploads the site to Amplify, locks CORS |

## Run it

Rehearse with no AWS: open `site/index.html` in a browser. With an empty `config.js` the page
runs a simulated burn.

Deploy (needs `aws login`, `sam`, `zip`; stream `rocket-test-fire` must exist in us-east-1):

    ./deploy.sh

It prints the site URL. Teardown commands print at the end.

## Talking points

- Kinesis decouples the test stand from every consumer. The page is one reader; a recorder, an
  abort monitor and a data-lake archive can read the same stream at the same time.
- Latency of a few hundred ms is the round trip through the stream, not network lag to the stand.
- Swap the reader Lambda for Amazon Managed Service for Apache Flink to compute 1 s windows,
  running total impulse, and redline alarms in-stream, then publish the results to a second stream
  that this page reads. The page code does not change.

## Security notes

- The page and API are public; the audience is anonymous students. `POST /burn` is throttled
  (5 rps, burst 10), the Lambda has reserved concurrency 4, and each burn costs about 200 PUTs.
- The Lambda role can only read and write the one stream and invoke itself.
- CORS is locked to the Amplify origin after the first deploy.
