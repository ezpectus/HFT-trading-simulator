#!/usr/bin/env python3
"""Monitor HFT trade bot via SHM heartbeat.

Usage: python scripts/monitor.py [--interval 1]
"""

import time
import sys
import os
import argparse
import struct
import mmap

def main():
    parser = argparse.ArgumentParser(description="HFT Bot Monitor")
    parser.add_argument("--interval", type=float, default=1.0, help="Update interval seconds")
    args = parser.parse_args()

    print("HFT Trade Bot Monitor")
    print("=" * 60)

    # Try to read heartbeat from shared memory
    shm_name = "/hft_heartbeat"
    try:
        if os.name == 'nt':
            # Windows: page-file-backed shared memory via mmap
            # Tag name must match the name passed to CreateFileMappingW in C++
            tag = shm_name.lstrip("/")
            mm = mmap.mmap(-1, 64, tagname=tag, access=mmap.ACCESS_READ)
        else:
            # Linux: use /dev/shm
            shm_path = f"/dev/shm{shm_name}"
            if not os.path.exists(shm_path):
                print(f"SHM heartbeat not found at {shm_path}")
                print("Is the HFT bot running?")
                sys.exit(1)

            fd = os.open(shm_path, os.O_RDONLY)
            mm = mmap.mmap(fd, 0, access=mmap.ACCESS_READ)

        try:
            while True:
                # Read heartbeat data (timestamp + counters)
                data = mm[:64]
                timestamp = struct.unpack('Q', data[:8])[0]
                counters = struct.unpack('4q', data[8:40])

                age_ms = (time.time_ns() // 1_000_000) - timestamp
                alive = age_ms < 5000

                os.system('cls' if os.name == 'nt' else 'clear')
                print("HFT Trade Bot Monitor")
                print("=" * 60)
                print(f"  Status:     {'ALIVE' if alive else 'DEAD'}")
                print(f"  Heartbeat:  {age_ms}ms ago")
                print(f"  Orders:     {counters[0]}")
                print(f"  Fills:      {counters[1]}")
                print(f"  Signals:    {counters[2]}")
                print(f"  Errors:     {counters[3]}")
                print("=" * 60)
                print("  Press Ctrl+C to stop")

                time.sleep(args.interval)
        finally:
            mm.close()
            if os.name != 'nt':
                os.close(fd)

    except FileNotFoundError:
        print("SHM heartbeat not found. Is the HFT bot running?")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nStopped.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
