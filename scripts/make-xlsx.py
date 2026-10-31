"""Builds public/samples/new-joiners.xlsx from new-joiners.csv (needs: pip install openpyxl)."""
import csv
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font

root = Path(__file__).resolve().parent.parent / "public" / "samples"
wb = Workbook()
ws = wb.active
ws.title = "New joiners"
with open(root / "new-joiners.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.reader(f))
ws.append(rows[0])
for c in ws[1]:
    c.font = Font(bold=True)
date_cols = {rows[0].index("start_date"), rows[0].index("dob")}
for r in rows[1:]:
    ws.append([datetime.strptime(v, "%Y-%m-%d") if i in date_cols and v else v for i, v in enumerate(r)])
for i in date_cols:
    for cell in ws.iter_rows(min_row=2, min_col=i + 1, max_col=i + 1):
        cell[0].number_format = "DD/MM/YYYY"  # real Excel dates, shown day-first like the data
wb.save(root / "new-joiners.xlsx")
print("wrote", root / "new-joiners.xlsx")
