# THROWAWAY: run `python analyze.py` and paste the output back. Not part of the final repo.
import asyncio
import json
from main import load_all, analyze, MISSING


def rnd(x):  # round floats so the output stays compact
    if isinstance(x, dict): return {str(k): rnd(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)): return [rnd(v) for v in x]
    return round(float(x), 3) if isinstance(x, (float, np_float)) else x


import numpy as np
np_float = np.floating
rows, failed = asyncio.run(load_all())
print("rows:", len(rows), "| failed days:", failed)
print("days with missing points:", {str(d): m for d, m in sorted(MISSING.items()) if any(m.values())})
for k, v in analyze(rows).items():
    print(k, json.dumps(rnd(v)))