# JEV decision assessment

`jevlocal.py` reads a PDF and the JSON
rubrics in `metrics/`, then sends each assessment to LM Studio at
`http://127.0.0.1:1234/v1/systemone` using the `vllm-d3-mini` model.
The local LM Studio server and LM Link connection must be running.

Install Python dependencies with `python -m pip install -r requirements.txt`,
then run `python jevlocal.py` from this directory. Paths to the PDFs and rubrics
are resolved relative to the script, so it can also run from another directory.

This script is standalone; it has not been connected to the Express API.
