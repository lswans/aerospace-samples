"""Local end-to-end check of app.py against the real stream: poll, burn 3 s, poll again."""
import os, threading, time
os.environ.setdefault("STREAM", "rocket-test-fire")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
import app

app.BURN_TIME, app.COOLDOWN = 2.0, 1.0
first = app.poll(None)
print("shards:", len(first["iterators"]), "rows before:", len(first["rows"]))
t = threading.Thread(target=app.run_burn, args=("test",)); t.start()
seen, its, latencies = 0, first["iterators"], []
while t.is_alive() or seen == 0:
    time.sleep(0.4)
    r = app.poll(its); its = r["iterators"]
    seen += len(r["rows"])
    if r["latency_ms"] is not None: latencies.append(r["latency_ms"])
t.join()
r = app.poll(its); seen += len(r["rows"])
print("rows seen:", seen, "expected:", int((app.BURN_TIME + app.COOLDOWN) * app.HZ))
print("latency ms min/median:", min(latencies), sorted(latencies)[len(latencies) // 2])
assert seen == int((app.BURN_TIME + app.COOLDOWN) * app.HZ), "row count mismatch"
print("PASS")
