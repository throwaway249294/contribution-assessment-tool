import time
import subprocess
import os
from settings import PYTHON, TESTS_DIR

TESTS = ["accuracy_test.py", "parallel_test.py", "load_test.py"]

results = []

for number, script in enumerate(TESTS, start=1):
    print("=" * 70)
    print(f"[{number}/{len(TESTS)}] {script}")
    print("=" * 70, flush=True)
    print("")

    start = time.perf_counter()

    code = subprocess.run([PYTHON, "-u", os.path.join(TESTS_DIR, script)]).returncode
    seconds = time.perf_counter() - start

    results.append((script, code == 0, seconds))
    print()

passed = sum(ok for script, ok, seconds in results)
print(f"\n{passed}/{len(results)} test scripts passed")
