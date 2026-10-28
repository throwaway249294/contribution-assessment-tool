import sys
import time
import subprocess
import os
import shutil
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from settings import EXTRACT, PYTHON, REPO_LINK, TMP_DIR, TIMEOUT

# settings
# one repo per teacher
REPO_LINKS = [
    REPO_LINK,
    "https://github.com/106013868/COS30018_HNRS.git",
    "https://github.com/106013868/COS30045.git",
    "https://github.com/AlexanderForster1/AppliedMachineLearning.git",
    "https://github.com/106013868/TBRGS.git",
]
TEACHERS = len(REPO_LINKS)
ROUNDS = 2
TEST_FOLDER = os.path.join(TMP_DIR, "parallel_test")

print(f"Simulates {TEACHERS} teachers using the tool at the same time.")
print(f"Runs {ROUNDS} rounds: first a fresh clone, then updating existing clones.\n")

if os.path.isdir(TEST_FOLDER):
    shutil.rmtree(TEST_FOLDER)
os.makedirs(TEST_FOLDER)

# holds every teacher at the start line until all are ready,
start_line = threading.Barrier(TEACHERS)

def teacher(link):
    start_line.wait()
    start = time.perf_counter()
    try:
        # every teacher shares one folder
        result = subprocess.run([PYTHON, EXTRACT, link], cwd=TEST_FOLDER, capture_output=True, text=True, timeout=TIMEOUT)
        code = result.returncode
        error = result.stderr.strip()
    except subprocess.TimeoutExpired:
        code = None
        error = "Timed out"
    seconds = time.perf_counter() - start

    # check this teacher's own json file exists and loads
    parts = link.rstrip("/").split("/")
    json_path = os.path.join(TEST_FOLDER, "data", f"{parts[-2]}-{parts[-1].removesuffix('.git')}.json")
    try:
        with open(json_path, encoding="utf-8") as f:
            json.load(f)
        json_ok = True
    except (OSError, json.JSONDecodeError):
        json_ok = False

    return link, code, seconds, error, json_ok

total_failed = 0

for round_number in range(1, ROUNDS + 1):
    # round 1: nobody has the repos yet (clone). round 2: they're already there (update)
    if round_number == 1:
        print(f"Round {round_number}/{ROUNDS}: clone fresh repos")
    else:
        print(f"Round {round_number}/{ROUNDS}: update existing clones")
    print(f"  Sending {TEACHERS} requests at once...", flush=True)

    round_start = time.perf_counter()
    with ThreadPoolExecutor(max_workers=TEACHERS) as pool:
        results = list(pool.map(teacher, REPO_LINKS))
    round_seconds = time.perf_counter() - round_start

    passed_times = []
    failed = []
    for link, code, seconds, error, json_ok in results:
        if code == 0 and json_ok:
            passed_times.append(seconds)
        else:
            reason = error.splitlines()[-1] if error else "no output file"
            failed.append(f"{link.split('/')[-1]}: {reason[:80]}")

    print(f"  Succeeded: {len(passed_times)}/{TEACHERS}  (all done in {round_seconds:.2f}s, slowest request {max(passed_times, default=0):.2f}s)")
    for line in failed:
        print(f"    FAIL  {line}")
    print()

    total_failed += len(failed)

shutil.rmtree(TEST_FOLDER)

total = TEACHERS * ROUNDS
print(f"Total succeeded: {total - total_failed}/{total}")
