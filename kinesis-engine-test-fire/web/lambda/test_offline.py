"""Offline check of app.py with a fake Kinesis client: burn -> poll -> rows, latency, expiry fallback, routes."""
import json, os, time
os.environ.setdefault("STREAM", "rocket-test-fire")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
import app


class FakeKinesis:
    class exceptions:
        class ExpiredIteratorException(Exception): pass

    def __init__(self):
        self.records, self.pos, self.expired = [], {}, set()

    def put_records(self, StreamName, Records):
        self.records += [r["Data"] for r in Records]

    def list_shards(self, StreamName):
        return {"Shards": [{"ShardId": "shardId-0"}, {"ShardId": "shardId-1"}]}

    def get_shard_iterator(self, StreamName, ShardId, ShardIteratorType):
        self.n = getattr(self, "n", 0) + 1
        it = f"{ShardId}:{len(self.records)}:{self.n}"
        return {"ShardIterator": it}

    def get_records(self, ShardIterator, Limit):
        if ShardIterator in self.expired:
            raise self.exceptions.ExpiredIteratorException()
        shard, start = ShardIterator.split(":")[:2]
        recs = self.records[int(start):] if shard == "shardId-0" else []
        return {"Records": [{"Data": d} for d in recs], "NextShardIterator": f"{shard}:{len(self.records)}"}


class FakeLambda:
    def __init__(self): self.calls = []
    def invoke(self, **kw): self.calls.append(json.loads(kw["Payload"]))


class Ctx: function_name = "rocket-demo-api"


app.kin, app.lam = FakeKinesis(), FakeLambda()
app.BURN_TIME, app.COOLDOWN, app.HZ = 1.0, 0.5, 20
orig_sleep, time.sleep = time.sleep, lambda s: None

first = app.poll(None)
assert first["rows"] == [] and len(first["iterators"]) == 2, first

r = app.handler({"rawPath": "/burn", "body": "{}"}, Ctx())
assert r["statusCode"] == 202 and app.lam.calls[0]["action"] == "burn", r
app.handler(app.lam.calls[0], Ctx())
expected = int((app.BURN_TIME + app.COOLDOWN) * app.HZ)
assert len(app.kin.records) == expected, len(app.kin.records)

r = app.handler({"rawPath": "/poll", "body": json.dumps({"iterators": first["iterators"]})}, Ctx())
body = json.loads(r["body"])
assert len(body["rows"]) == expected and body["latency_ms"] >= 0, (len(body["rows"]), body["latency_ms"])
assert [x["t"] for x in body["rows"]] == sorted(x["t"] for x in body["rows"])
assert max(x["thrust_n"] for x in body["rows"]) > 1500
assert r["headers"]["Access-Control-Allow-Origin"] == "*"

app.kin.expired.add(body["iterators"]["shardId-0"])
again = app.poll(body["iterators"])
assert again["rows"] == [] and len(again["iterators"]) == 2, "expired iterator fallback failed"

assert app.handler({"rawPath": "/x", "body": None}, Ctx())["statusCode"] == 404
time.sleep = orig_sleep
print(f"PASS: {expected} rows produced and read back, latency {body['latency_ms']} ms, expiry fallback ok")
