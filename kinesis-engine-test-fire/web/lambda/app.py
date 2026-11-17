"""Test-stand API: POST /burn starts a burn (async self-invoke), POST /poll reads new rows from Kinesis."""
import json, math, os, random, time, uuid
import boto3

STREAM = os.environ["STREAM"]
HZ, BURN_TIME, COOLDOWN = 20, 8.0, 2.0
ISP, G0 = 220.0, 9.80665
kin = boto3.client("kinesis")
lam = boto3.client("lambda")


def sample(t, burn_id):
    """One telemetry row at t seconds after ignition."""
    level = max(0.0, min(t / 0.4, (BURN_TIME - t) / 0.6, 1.0))
    thrust = 1800 * level * (1 + 0.03 * math.sin(t * 40)) + random.gauss(0, 15)
    burn_rate = max(0.0, 0.83 * level + random.gauss(0, 0.01))
    temp = 25 + 2900 * (1 - math.exp(-t / 1.2)) * (0.4 + 0.6 * level) + random.gauss(0, 8)
    pressure = max(0.0, 35 * level + random.gauss(0, 0.3))
    return {"burn_id": burn_id, "engine_id": "GSU-RX-1", "t": round(t, 3), "ts": time.time(),
            "thrust_n": round(max(thrust, 0), 1), "predicted_thrust_n": round(burn_rate * ISP * G0, 1),
            "burn_rate_kg_s": round(burn_rate, 4), "chamber_temp_c": round(temp, 1),
            "chamber_pressure_bar": round(pressure, 2)}


def run_burn(burn_id):
    """Stream a full test fire into Kinesis in real time."""
    total, batch = int((BURN_TIME + COOLDOWN) * HZ), []
    start = time.time()
    for i in range(total):
        row = sample(i / HZ, burn_id)
        batch.append({"Data": json.dumps(row).encode(), "PartitionKey": row["engine_id"]})
        if len(batch) == HZ // 4 or i == total - 1:
            kin.put_records(StreamName=STREAM, Records=batch)
            batch = []
        time.sleep(max(0.0, start + (i + 1) / HZ - time.time()))


def fresh_iterators():
    shards = kin.list_shards(StreamName=STREAM)["Shards"]
    return {s["ShardId"]: kin.get_shard_iterator(StreamName=STREAM, ShardId=s["ShardId"],
            ShardIteratorType="LATEST")["ShardIterator"] for s in shards}


def poll(iterators):
    """Read new rows from every shard; return rows, next iterators, and end-to-end latency."""
    fresh = not iterators
    if fresh:
        iterators = fresh_iterators()
    rows, nxt = [], {}
    for shard, it in iterators.items():
        try:
            r = kin.get_records(ShardIterator=it, Limit=200)
        except kin.exceptions.ExpiredIteratorException:
            if fresh:
                raise
            return poll(None)
        nxt[shard] = r["NextShardIterator"]
        rows += [json.loads(rec["Data"]) for rec in r["Records"]]
    rows.sort(key=lambda r: r["ts"])
    latency = round((time.time() - rows[-1]["ts"]) * 1000) if rows else None
    return {"rows": rows, "iterators": nxt, "latency_ms": latency, "server_time": time.time()}


def respond(code, body):
    return {"statusCode": code, "headers": {"Content-Type": "application/json",
            "Access-Control-Allow-Origin": os.environ.get("ALLOW_ORIGIN", "*")}, "body": json.dumps(body)}


def handler(event, context):
    if event.get("action") == "burn":
        run_burn(event["burn_id"])
        return {"ok": True}
    path = event.get("rawPath", "")
    body = json.loads(event.get("body") or "{}")
    if path.endswith("/burn"):
        burn_id = str(uuid.uuid4())[:8]
        lam.invoke(FunctionName=context.function_name, InvocationType="Event",
                   Payload=json.dumps({"action": "burn", "burn_id": burn_id}))
        return respond(202, {"burn_id": burn_id, "duration_s": BURN_TIME + COOLDOWN})
    if path.endswith("/poll"):
        return respond(200, poll(body.get("iterators")))
    return respond(404, {"error": "not found"})
