#!/usr/bin/env python3
"""Build the HFT trade bot with CMake.

Usage: python scripts/build.py [--debug] [--clean] [--tests]
"""

import subprocess
import sys
import os
import argparse


def run(cmd, cwd=None):
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="Build HFT Trade Bot")
    parser.add_argument("--debug", action="store_true", help="Debug build")
    parser.add_argument("--clean", action="store_true", help="Clean build")
    parser.add_argument("--tests", action="store_true", help="Build tests")
    parser.add_argument("--jobs", type=int, default=0, help="Parallel jobs (0=auto)")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    build_dir = os.path.join(project_dir, "build")

    if args.clean and os.path.exists(build_dir):
        print("Cleaning build directory...")
        import shutil
        shutil.rmtree(build_dir)

    os.makedirs(build_dir, exist_ok=True)

    build_type = "Debug" if args.debug else "Release"
    jobs = args.jobs if args.jobs > 0 else os.cpu_count() or 4

    print(f"Building HFT Trade Bot ({build_type})...")

    cmake_cmd = ["cmake", "-B", build_dir, "-S", project_dir,
                 f"-DCMAKE_BUILD_TYPE={build_type}"]
    if not run(cmake_cmd):
        print("CMake configuration failed!")
        sys.exit(1)

    targets = ["hft_trade_bot"]
    if args.tests:
        targets.append("test_signal_engine")
        targets.append("test_signal_engine_v2")

    build_cmd = ["cmake", "--build", build_dir, "--config", build_type,
                 "-j", str(jobs)] + ["--target"] + targets
    if not run(build_cmd):
        print("Build failed!")
        sys.exit(1)

    print(f"\nBuild complete: {build_dir}/hft_trade_bot")

    if args.tests:
        print("\nRunning tests...")
        test_cmd = ["ctest", "--output-on-failure"]
        if not run(test_cmd, cwd=build_dir):
            print("Tests failed!")
            sys.exit(1)
        print("All tests passed!")


if __name__ == "__main__":
    main()
