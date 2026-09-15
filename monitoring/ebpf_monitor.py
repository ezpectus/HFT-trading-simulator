#!/usr/bin/env python3
"""
eBPF monitoring agent for ultra-low-overhead system observability.

Uses eBPF (Extended Berkeley Packet Filter) to monitor:
  - Per-process syscall count and latency (enter/exit tracepoint pair)

Overhead: <0.1% CPU (eBPF runs in kernel, no context switches)

Requirements:
  - Linux kernel 5.15+
  - BCC tools: apt install bpftrace bpfcc-tools
  - Root privileges (CAP_BPF)

Usage:
    sudo python3 ebpf_monitor.py --pid $(pgrep hft_trade_bot) --interval 1
"""

from __future__ import annotations

import argparse
import json
import logging
import signal
import struct
import sys
import time
from typing import Any  # Any: BCC event data is untyped C struct payload

logger = logging.getLogger(__name__)

try:
    from bcc import BPF
    BCC_AVAILABLE = True
except ImportError:
    BCC_AVAILABLE = False

# eBPF program for syscall tracing — sys_enter stores the start timestamp
# keyed by pid; sys_exit pairs it and submits one event per syscall with a
# real latency (a lone sys_enter probe can never observe ts_end).
SYSCALL_BPF = r"""
#include <uapi/linux/ptrace.h>
#include <uapi/linux/bpf_perf_event.h>

struct syscall_event_t {
    u64 pid;
    u64 syscall_id;
    char comm[16];
    u64 latency_ns;
};

BPF_PERF_OUTPUT(events);
BPF_HASH(start_times, u64, u64);

TRACEPOINT_PROBE(raw_syscalls, sys_enter) {
    u64 pid = bpf_get_current_pid_tgid() >> 32;
    u64 ts = bpf_ktime_get_ns();
    start_times.update(&pid, &ts);
    return 0;
}

TRACEPOINT_PROBE(raw_syscalls, sys_exit) {
    u64 pid = bpf_get_current_pid_tgid() >> 32;
    u64 *start = start_times.lookup(&pid);
    if (start == 0) {
        return 0;
    }
    u64 now = bpf_ktime_get_ns();

    struct syscall_event_t event = {};
    event.pid = pid;
    event.syscall_id = args->id;
    event.latency_ns = now - *start;
    bpf_get_current_comm(&event.comm, sizeof(event.comm));

    start_times.delete(&pid);
    events.perf_submit(args, &event, sizeof(event));
    return 0;
}
"""


class EBPFMonitor:
    """eBPF-based system monitoring agent."""

    def __init__(self, pid: int = 0, interval: float = 1.0):
        self.pid = pid
        self.interval = interval
        self._bpf: object | None = None
        self._running = False
        self._stats: dict[str, Any] = {"syscalls": {}}

    def initialize(self) -> bool:
        if not BCC_AVAILABLE:
            logger.warning("[eBPF] BCC not available — install bpfcc-tools")
            return False

        try:
            self._bpf = BPF(text=SYSCALL_BPF)
            self._bpf["events"].open_perf_buffer(self._on_syscall_event)
            logger.info(f"[eBPF] Initialized — monitoring PID {self.pid}")
            return True
        except (OSError, RuntimeError, ValueError, TypeError) as e:
            logger.error(f"[eBPF] Init failed: {e}")
            return False

    def _on_syscall_event(self, cpu: int, data: Any, size: int) -> None:
        """Handle syscall event from eBPF."""
        try:
            event = self._bpf["events"].event(data)
            if self.pid and event.pid != self.pid:
                return

            comm = event.comm.decode("utf-8", errors="replace").strip("\x00")
            key = f"{comm}:{event.syscall_id}"
            if key not in self._stats["syscalls"]:
                self._stats["syscalls"][key] = {
                    "count": 0, "total_latency_ns": 0, "max_latency_ns": 0,
                }

            s = self._stats["syscalls"][key]
            s["count"] += 1
            s["total_latency_ns"] += event.latency_ns
            if event.latency_ns > s["max_latency_ns"]:
                s["max_latency_ns"] = event.latency_ns

        except (KeyError, TypeError, ValueError, struct.error) as e:
            logger.debug(f"[eBPF] Event parse error: {e}")

    def start(self) -> None:
        if not self._bpf:
            if not self.initialize():
                return

        self._running = True
        logger.info("[eBPF] Monitoring started")

        while self._running:
            try:
                self._bpf.perf_buffer_poll(timeout=int(self.interval * 1000))
                self._report()
            except KeyboardInterrupt:
                break
            except (OSError, RuntimeError) as e:
                logger.error(f"[eBPF] Poll error: {e}")
                time.sleep(1)

    def stop(self) -> None:
        self._running = False
        logger.info("[eBPF] Monitoring stopped")

    def _report(self) -> None:
        """Log current stats as JSON (no metrics export — standalone tool)."""
        report = {
            "timestamp": time.time(),
            "pid": self.pid,
            "syscalls": {},
        }

        for comm, stats in self._stats["syscalls"].items():
            avg_ns = stats["total_latency_ns"] / max(stats["count"], 1)
            report["syscalls"][comm] = {
                "count": stats["count"],
                "avg_latency_us": round(avg_ns / 1000, 2),
                "max_latency_us": round(stats["max_latency_ns"] / 1000, 2),
            }

        logger.info(json.dumps(report, indent=2))

    def get_stats(self) -> dict[str, Any]:
        return self._stats.copy()


def main():
    parser = argparse.ArgumentParser(description="eBPF monitoring for HFT system")
    parser.add_argument("--pid", type=int, default=0, help="Process ID to monitor (0 = all)")
    parser.add_argument("--interval", type=float, default=1.0, help="Report interval (seconds)")
    args = parser.parse_args()

    monitor = EBPFMonitor(pid=args.pid, interval=args.interval)

    def signal_handler(sig: int, frame: Any) -> None:  # noqa: ARG001 — signal API requires these params
        monitor.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    monitor.start()


if __name__ == "__main__":
    main()
