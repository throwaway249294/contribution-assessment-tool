import sys
import os

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
EXTRACT = os.path.join(TESTS_DIR, "..", "extract.py")

PYTHON = sys.executable
REPO_LINK = "https://github.com/throwaway249294/contribution-assessment-tool"

# test clones and outputs go here
TMP_DIR = os.path.join(TESTS_DIR, "tmp")

TIMEOUT = 120
