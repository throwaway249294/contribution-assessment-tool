# GitHub commit extractor

`extract.py` clones a GitHub repository and writes every commit from every
branch to `data/<owner>-<repo>.json`, grouped by student email and sorted by
date. Each commit includes its message, whether it reached the main branch
(`in_main`), and the diff of every file it changed. Merge commits are skipped.

```bash
python extract.py <repo_link>
```

The repo is cloned into `repos/`. Running the same link again fetches new
commits instead of cloning. `repos/` and `data/` contain student data and are
ignored by git, so always run from this directory.

Run the tests with `python tests/run_all.py`. They check the output against
git (`accuracy_test.py`), run several repos at the same time
(`parallel_test.py`), and run repeated extractions back to back
(`load_test.py`). Settings shared by the tests are in `tests/settings.py`.