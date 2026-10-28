import json
import subprocess
import sys
import os
from pydriller import Repository
from datetime import datetime

def prepare_repo(source):
    #arg is a link
    if source.startswith("https://"):
        #string cleanup
        link = source.rstrip("/")
        parts = link.split("/")
        owner = parts[-2]
        name = parts[-1].removesuffix(".git")
        folder = os.path.join("repos", f"{owner}-{name}")

        #checks if repo exists already
        if os.path.isdir(folder):
            print("Updating existing clone...")
            result = subprocess.run(["git", "-C", folder, "fetch", "--all", "--prune"], capture_output=True, text=True)
        else:
            print("Cloning repo...")
            result = subprocess.run(["git", "clone", link, folder], capture_output=True, text=True)

        if result.returncode != 0:
            raise SystemExit(f"Git command failed: {result.stderr}")

        return folder

    #arg is a folder
    if not os.path.isdir(source):
        raise SystemExit("Repo folder not found. Exiting...")

    return source

def extract_commits(folder):
    folder = os.path.normpath(folder)
    repo = Repository(folder, include_refs=True, only_no_merge=True)
    repo_name = os.path.basename(os.path.abspath(folder))

    contributors = {}
    repository = {"repo": repo_name, "contributors": contributors}

    result = subprocess.run(["git", "-C", folder, "rev-parse", "--abbrev-ref", "origin/HEAD"], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit("Couldn’t find the default branch (origin/HEAD). Try a fresh clone")
    main_ref = "remotes/" + result.stdout.strip()

    for commit in repo.traverse_commits():
        student = commit.author
        branches = commit.branches

        email = student.email.lower()
        if email not in contributors:
            contributors[email] = {"name": student.name, "commits": []}

        commit_files = [] # this commit's files

        for file in commit.modified_files:
            file_info = {
                "path": file.new_path or file.old_path,
                "change_type": file.change_type.name,
                "lines_added": file.added_lines,
                "lines_deleted": file.deleted_lines,
                "diff": file.diff
            }
            commit_files.append(file_info)

        contributors[email]["commits"].append({
            "hash": commit.hash,
            "date": commit.author_date.isoformat(),
            "message": commit.msg,
            "in_main": main_ref in branches,
            "files": commit_files
        })

    for c in contributors:
        contributors[c]["commits"].sort(key=lambda c: datetime.fromisoformat(c["date"]))

    return repository

def write_json(data):
    os.makedirs("data", exist_ok=True)
    with open(f"data/{data["repo"]}.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Successfully extracted repository data to {data["repo"]}.json")

if __name__ == "__main__":
    # error handling
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python extract.py <repo_folder or GitHub link>")

    folder = prepare_repo(sys.argv[1])

    data = extract_commits(folder)
    write_json(data)

    