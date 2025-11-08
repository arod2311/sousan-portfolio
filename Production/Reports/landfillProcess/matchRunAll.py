# matchRunAll.py

import subprocess, os

base = os.getcwd()
py = os.path.join(base, "Scripts", "python.exe")
steps = [
    "landfillTicketsTruxCleanUp.py",
    "comparisonTicketsWSummary.py",
    "addMatchColumn.py",
]

for s in steps:
    p = os.path.join(base, "pyScripts", s)
    print(f"\n→ Running {s} …")
    subprocess.run([py, p], check=True)
