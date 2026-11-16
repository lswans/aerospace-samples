"""Fake rocket engine test fire -> Kinesis Data Streams (or stdout with --offline)."""
import argparse, json, math, random, time

ISP = 220.0   # specific impulse, seconds
G0 = 9.80665


def sample(t, burn_time):
    """One telemetry row at time t (seconds since ignition)."""
    ramp = min(t / 0.4, 1.0)                      # ignition ramp
    tail = min((burn_time - t) / 0.6, 1.0)        # tail-off
    level = max(0.0, min(ramp, tail))
    thrust = 1800 * level * (1 + 0.03 * math.sin(t * 40)) + random.gauss(0, 15)
    burn_rate = max(0.0, 0.83 * level + random.gauss(0, 0.01))          # kg/s
    chamber_c = 25 + 2900 * (1 - math.exp(-t / 1.2)) * (0.4 + 0.6 * level) + random.gauss(0, 8)
    pressure = 35 * level + random.gauss(0, 0.3)                          # bar
    predicted = burn_rate * ISP * G0                                      # N, from the physics
    return {
        "engine_id": "GSU-RX-1",
        "t": round(t, 3),
        "ts": time.time(),
        "thrust_n": round(max(thrust, 0), 1),
        "predicted_thrust_n": round(predicted, 1),
        "burn_rate_kg_s": round(burn_rate, 4),
        "chamber_temp_c": round(chamber_c, 1),
        "chamber_pressure_bar": round(max(pressure, 0), 2),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--stream", default="rocket-test-fire")
    p.add_argument("--region", default="us-east-1")
    p.add_argument("--burn-time", type=float, default=8.0)
    p.add_argument("--hz", type=int, default=20)
    p.add_argument("--speed", type=float, default=1.0, help="2 = twice as fast")
    p.add_argument("--offline", action="store_true")
    a = p.parse_args()

    kin = None
    if not a.offline:
        import boto3
        kin = boto3.client("kinesis", region_name=a.region)

    total = int((a.burn_time + 2) * a.hz)     # 2 s of cooldown
    batch = []
    for i in range(total):
        row = sample(i / a.hz, a.burn_time)
        if kin:
            batch.append({"Data": (json.dumps(row) + "\n").encode(), "PartitionKey": row["engine_id"]})
            if len(batch) == a.hz // 2 or i == total - 1:
                kin.put_records(StreamName=a.stream, Records=batch)
                batch = []
        else:
            print(json.dumps(row))
        time.sleep(1 / a.hz / a.speed)


if __name__ == "__main__":
    main()
