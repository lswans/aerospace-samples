"""Read the test-fire stream, show live rows, flag anomalies, print a summary."""
import argparse, json, sys, time


def rows_from_stream(stream, region):
    import boto3
    k = boto3.client("kinesis", region_name=region)
    shards = k.list_shards(StreamName=stream)["Shards"]
    its = [k.get_shard_iterator(StreamName=stream, ShardId=s["ShardId"],
                                ShardIteratorType="LATEST")["ShardIterator"] for s in shards]
    while True:
        for i, it in enumerate(its):
            r = k.get_records(ShardIterator=it, Limit=100)
            its[i] = r["NextShardIterator"]
            for rec in r["Records"]:
                yield json.loads(rec["Data"])
        time.sleep(0.5)


def rows_from_stdin():
    for line in sys.stdin:
        yield json.loads(line)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--stream", default="rocket-test-fire")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--stdin", action="store_true", help="read producer --offline output")
    p.add_argument("--max-temp", type=float, default=3000)
    a = p.parse_args()

    src = rows_from_stdin() if a.stdin else rows_from_stream(a.stream, a.region)
    peak = impulse = used = 0.0
    prev_t = None
    print(f"{'t(s)':>6} {'thrust N':>9} {'pred N':>8} {'kg/s':>6} {'temp C':>7}  bar")
    for r in src:
        dt = 0 if prev_t is None else r["t"] - prev_t
        prev_t = r["t"]
        peak = max(peak, r["thrust_n"])
        impulse += r["thrust_n"] * dt
        used += r["burn_rate_kg_s"] * dt
        alert = "  !! OVER TEMP" if r["chamber_temp_c"] > a.max_temp else ""
        if int(r["t"] * 20) % 10 == 0:
            print(f"{r['t']:6.2f} {r['thrust_n']:9.1f} {r['predicted_thrust_n']:8.1f} "
                  f"{r['burn_rate_kg_s']:6.3f} {r['chamber_temp_c']:7.1f} {r['chamber_pressure_bar']:5.1f}{alert}")
        if r["t"] >= 9.9 and a.stdin or r["t"] >= 9.95:
            break
    print(f"\nPeak thrust {peak:.0f} N | Total impulse {impulse:.0f} N*s | Propellant {used:.2f} kg")
    if used:
        print(f"Measured Isp {impulse / used / 9.80665:.0f} s")


if __name__ == "__main__":
    main()
