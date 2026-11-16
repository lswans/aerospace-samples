"""Virtual rocket avionics board. Publishes flight telemetry to AWS IoT Core over MQTT.
Send {"action":"abort"} to topic rocket/gsu-rocket-avionics/cmd from the console to stop it.
Use --dry-run to print messages without connecting."""
import argparse, json, math, random, time, threading

THING = "gsu-rocket-avionics"
TOPIC = f"rocket/{THING}/telemetry"
CMD = f"rocket/{THING}/cmd"


def flight(t):
    """Altitude (m), vertical accel (g), battery (V) for a simple boost-then-coast flight."""
    boost = 4.0
    if t < boost:
        a = 8.0
        alt = 0.5 * a * 9.81 * t * t / 9.81 * 1.0
        g = a / 9.81 * 9.81 / 9.81 + 1
    else:
        v = 8.0 * boost
        dt = t - boost
        alt = 0.5 * 8.0 * boost ** 2 + v * dt - 0.5 * 9.81 * dt * dt
        g = 0.0
    return max(alt, 0.0), g, 8.4 - 0.01 * t


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--hz", type=float, default=2)
    a = p.parse_args()

    conn = None
    stop = threading.Event()
    if not a.dry_run:
        from awscrt import mqtt
        from awsiot import mqtt_connection_builder
        conn = mqtt_connection_builder.mtls_from_path(
            endpoint=open("certs/endpoint.txt").read().strip(),
            cert_filepath="certs/device.pem.crt",
            pri_key_filepath="certs/private.pem.key",
            ca_filepath="certs/AmazonRootCA1.pem",
            client_id=THING)
        conn.connect().result()

        def on_cmd(topic, payload, **kw):
            print("command received:", payload.decode())
            if json.loads(payload).get("action") == "abort":
                stop.set()
        conn.subscribe(CMD, mqtt.QoS.AT_LEAST_ONCE, on_cmd)[0].result()

    t0 = time.time()
    while not stop.is_set():
        t = time.time() - t0
        alt, g, volts = flight(t)
        msg = {"thing": THING, "t": round(t, 1), "altitude_m": round(alt + random.gauss(0, 0.5), 1),
               "accel_g": round(g + random.gauss(0, 0.05), 2), "battery_v": round(volts, 2)}
        if a.dry_run:
            print(json.dumps(msg))
        else:
            conn.publish(TOPIC, json.dumps(msg), mqtt.QoS.AT_LEAST_ONCE)
        if alt == 0 and t > 6:
            break
        time.sleep(1 / a.hz)
    if conn:
        conn.disconnect().result()
    print("flight over")


if __name__ == "__main__":
    main()
