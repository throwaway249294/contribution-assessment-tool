# Runs 5 accuracy tests on the extracted data against GitHub
import sys
import subprocess
import os
import shutil
import glob
import json
from datetime import datetime
from settings import EXTRACT, PYTHON, REPO_LINK, TMP_DIR, TIMEOUT

# settings
TEST_FOLDER = os.path.join(TMP_DIR, "accuracy_test")

print("Checks extract.py's output against what git itself reports.")
print(f"Repo: {REPO_LINK}\n")

if os.path.isdir(TEST_FOLDER):
    shutil.rmtree(TEST_FOLDER)
os.makedirs(TEST_FOLDER)

result = subprocess.run([PYTHON, EXTRACT, REPO_LINK], cwd=TEST_FOLDER, capture_output=True, text=True, timeout=TIMEOUT)
if result.returncode != 0:
    print(f"extract.py failed: {result.stderr.strip()}")
    print("RESULT: FAILED")
    sys.exit(1)

with open(glob.glob(os.path.join(TEST_FOLDER, "data", "*.json"))[0], encoding="utf-8") as f:
    data = json.load(f)

# the clone extract.py made, so we can ask git directly
repo_folder = os.path.join(TEST_FOLDER, "repos", data["repo"])

def git(*args):
    return subprocess.run(["git", "-C", repo_folder, *args], capture_output=True, text=True).stdout.split()

commits = []
for email in data["contributors"]:
    commits += data["contributors"][email]["commits"]

checks = []

# Test 1: Checks if number of commits extracted matches number of commits reported by GitHub
git_total = int(git("rev-list", "--all", "--no-merges", "--count")[0])
checks.append(("Total commits match git", len(commits) == git_total, f"{len(commits)} vs git's {git_total}"))

# Test 2: Checks same number of commits per person
git_counts = {}
for email in git("log", "--all", "--no-merges", "--format=%ae"):
    email = email.lower()
    git_counts[email] = git_counts.get(email, 0) + 1
our_counts = {}
for email in data["contributors"]:
    our_counts[email] = len(data["contributors"][email]["commits"])
checks.append(("Commits per person match git", our_counts == git_counts, f"{len(our_counts)} people"))

# Test 3: in_main is true for exactly the commits git says are on the main branch
git_main = set(git("rev-list", "--no-merges", "origin/HEAD"))
our_main = {c["hash"] for c in commits if c["in_main"]}
checks.append(("in_main flags match git", our_main == git_main, f"{len(our_main)} on main, {len(commits) - len(our_main)} not"))

# Test 4: each person's commits run oldest to newest
sorted_ok = True
for email in data["contributors"]:
    dates = [datetime.fromisoformat(c["date"]) for c in data["contributors"][email]["commits"]]
    if dates != sorted(dates):
        sorted_ok = False
checks.append(("Commits sorted oldest to newest", sorted_ok, ""))

# Test 5: Checks for duplicates
hashes = [c["hash"] for c in commits]
checks.append(("No duplicate commits", len(hashes) == len(set(hashes)), ""))

shutil.rmtree(TEST_FOLDER)

print("Checking the output against git:")
passed = 0
for name, ok, detail in checks:
    if ok:
        passed += 1
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<34} {detail}")

print()
print(f"Checks passed: {passed}/{len(checks)}")
