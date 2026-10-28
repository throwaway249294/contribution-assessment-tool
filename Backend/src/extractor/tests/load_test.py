import sys
import time
import subprocess
import os
import shutil
import glob
from settings import EXTRACT, PYTHON, REPO_LINK, TMP_DIR, TIMEOUT

# settings
RUNS = 10
PAUSE = 0
TEST_FOLDER = os.path.join(TMP_DIR, "load_test")

print(f"Runs extract.py {RUNS} times in a row.")
print(f"Repo: {REPO_LINK}\n")

if os.path.isdir(TEST_FOLDER):
    shutil.rmtree(TEST_FOLDER)

times = []
failures = 0

for i in range(1, RUNS + 1):
    # fresh folder each run
    folder = os.path.join(TEST_FOLDER, f"run_{i:02d}")
    os.makedirs(folder)

    start = time.perf_counter()
    try:
        result = subprocess.run([PYTHON, EXTRACT, REPO_LINK], cwd=folder, capture_output=True, text=True, timeout=TIMEOUT)
        code = result.returncode
        error = result.stderr.strip()
    except subprocess.TimeoutExpired:
        code = None
        error = "Timed out"
    seconds = time.perf_counter() - start

    # only a pass if it exited cleanly AND wrote the json file
    made_json = len(glob.glob(os.path.join(folder, "data", "*.json"))) == 1

    if code == 0 and made_json:
        times.append(seconds)
        print(f"  Run {i:02d}/{RUNS}  PASS  {seconds:.2f}s")
    else:
        failures += 1
        reason = error.splitlines()[-1] if error else f"exit code {code}"
        print(f"  Run {i:02d}/{RUNS}  FAIL  {seconds:.2f}s  {reason[:90]}")

    shutil.rmtree(folder)
    if i < RUNS:
        time.sleep(PAUSE)

shutil.rmtree(TEST_FOLDER)

print()
print(f"Succeeded: {len(times)}/{RUNS}")
if times:
    print(f"Time per clone: average {sum(times) / len(times):.2f}s, fastest {min(times):.2f}s, slowest {max(times):.2f}s")
