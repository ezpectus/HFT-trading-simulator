#!/usr/bin/env python3
"""Run HFT bot with a specific config.

Usage: python scripts/run.py [--config config/config.yaml] [--paper]
"""

import subprocess
import sys
import os
import argparse


def main():
    parser = argparse.ArgumentParser(description="Run HFT Trade Bot")
    parser.add_argument("--config", default="config/config.yaml", help="Config file")
    parser.add_argument("--paper", action="store_true", help="Paper trading mode")
    parser.add_argument("--debug", action="store_true", help="Debug build")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    build_subdir = "Debug" if args.debug else "Release"
    binary = os.path.join(project_dir, "build", build_subdir, "hft_trade_bot")
    if not os.path.exists(binary):
        binary = os.path.join(project_dir, "build", "hft_trade_bot")

    if not os.path.exists(binary):
        print(f"Binary not found: {binary}")
        print("Build first with: python scripts/build.py")
        sys.exit(1)

    config_path = os.path.join(project_dir, args.config)
    if not os.path.exists(config_path):
        print(f"Config not found: {config_path}")
        sys.exit(1)

    cmd = [binary, config_path]
    if args.paper:
        cmd.append("--paper")

    print(f"Starting HFT Trade Bot: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, cwd=project_dir)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
