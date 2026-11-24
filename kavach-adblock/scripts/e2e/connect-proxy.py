#!/usr/bin/env python3
"""A minimal HTTP proxy (CONNECT + absolute-URI GET) standing in for a free
proxy in the emulator test. Logs every target it is asked for, one per line."""
import socket
import sys
import threading

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3128


def pipe(a, b):
    try:
        while True:
            data = a.recv(65536)
            if not data:
                break
            b.sendall(data)
    except OSError:
        pass
    finally:
        try:
            b.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client):
    try:
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = client.recv(4096)
            if not chunk:
                return
            head += chunk
        line = head.split(b"\r\n", 1)[0].decode("latin-1")
        method, target, _ = line.split(" ", 2)
        if method == "CONNECT":
            host, port = target.rsplit(":", 1)
            print(f"CONNECT {host}:{port}", flush=True)
            upstream = socket.create_connection((host, int(port)), timeout=10)
            upstream.settimeout(None)
            client.sendall(b"HTTP/1.1 200 Connection established\r\n\r\n")
            rest = head.split(b"\r\n\r\n", 1)[1]
            if rest:
                upstream.sendall(rest)
        else:
            from urllib.parse import urlsplit
            u = urlsplit(target)
            print(f"{method} {u.hostname}:{u.port or 80}", flush=True)
            upstream = socket.create_connection((u.hostname, u.port or 80), timeout=10)
            upstream.settimeout(None)
            upstream.sendall(head)
        t = threading.Thread(target=pipe, args=(client, upstream), daemon=True)
        t.start()
        pipe(upstream, client)
        t.join(30)
    except Exception as e:  # noqa: BLE001 - a test helper; log and drop
        print(f"error {e}", flush=True)
    finally:
        client.close()


server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("0.0.0.0", PORT))
server.listen(128)
print(f"listening {PORT}", flush=True)
while True:
    conn, _ = server.accept()
    threading.Thread(target=handle, args=(conn,), daemon=True).start()
