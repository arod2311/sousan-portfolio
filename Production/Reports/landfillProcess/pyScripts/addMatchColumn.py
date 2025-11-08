# pyScripts/addMatchColumn.py
#
# Creates  Files\Processed\Updated_rollOffCityOfLaredo_WithMatch_<YYYY-MM-DD>.csv
# Columns added/renamed:
#   • Amount Match          (renamed from "Match": True/False for amount equality)
#   • Entered Ticket        (ticket # from Trux row if found, else "No Match")
#   • Material Description  (mapped from Trux material code, else "No Match")

import os
from datetime import datetime
import pandas as pd

# ───────────────────────────────────────────────────────────────────────────────
# 1.  Resolve paths & today’s date
# ───────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR   = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir))  # one level up
TODAY      = datetime.today().strftime("%Y-%m-%d")                 # e.g. 2025-07-03

ROLL_OFF_CSV = os.path.join(BASE_DIR, "Files", "rollOffCityOfLaredoTickets.csv")
TRUX_CSV     = os.path.join(BASE_DIR, "Files", "Cleaned",
                            f"Cleaned_Trux_DisposalTicketReport_{TODAY}.csv")
OUTPUT_CSV   = os.path.join(BASE_DIR, "Files", "Processed", "matchCsv",
                            f"Updated_rollOffCityOfLaredo_WithMatch_{TODAY}.csv")
os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)

# ───────────────────────────────────────────────────────────────────────────────
# 2.  Load data
# ───────────────────────────────────────────────────────────────────────────────
df_ref  = pd.read_csv(ROLL_OFF_CSV)
df_trux = pd.read_csv(TRUX_CSV)

# ───────────────────────────────────────────────────────────────────────────────
# 3.  Normalise columns & ticket strings
# ───────────────────────────────────────────────────────────────────────────────
df_ref.columns  = df_ref.columns.str.strip()
df_trux.columns = df_trux.columns.str.strip()

REF_TICKET = "Ticket"
df_ref[REF_TICKET] = df_ref[REF_TICKET].astype(str).str.lstrip("0").str.strip()

# find Trux ticket & material columns dynamically
trux_ticket_col   = next(c for c in df_trux.columns if c.lower().startswith("ticket"))
trux_material_col = next(c for c in df_trux.columns if c.lower().startswith("material"))

df_trux[trux_ticket_col] = df_trux[trux_ticket_col].astype(str).str.lstrip("0").str.strip()

# ───────────────────────────────────────────────────────────────────────────────
# 4.  Amount computations
# ───────────────────────────────────────────────────────────────────────────────
to_float = lambda v: float(str(v).replace("$", "").replace(",", "").strip() or 0)

df_ref["Amt_Num"]       = df_ref["Amount"].apply(to_float)
df_trux["Amt_Num_Trux"] = df_trux["Amount"].apply(to_float)

amount_lookup = df_trux.set_index(trux_ticket_col)["Amt_Num_Trux"].to_dict()

df_ref["Trux_Amount_Num"] = df_ref[REF_TICKET].map(amount_lookup).fillna(0.0)
df_ref["Difference_Num"]  = df_ref["Amt_Num"] - df_ref["Trux_Amount_Num"]
df_ref["Amount Match"]    = df_ref["Amt_Num"] == df_ref["Trux_Amount_Num"]

# pretty money strings
money = lambda x: f"${x:,.2f}"
df_ref["Landfill_Amount"] = df_ref["Amt_Num"].apply(money)
df_ref["Trux_Amount"]     = df_ref["Trux_Amount_Num"].apply(money)
df_ref["Difference"]      = df_ref["Difference_Num"].apply(money)

# ───────────────────────────────────────────────────────────────────────────────
# 5.  Entered Ticket & Material Description via global row scan
# ───────────────────────────────────────────────────────────────────────────────
material_map = {
    1:"Landfill Fee",2:"Paper",3:"Plastic",4:"Wood",5:"Branches",6:"Concrete",
    7:"Bricks",8:"Dirt",9:"Tires",10:"Metal",11:"Sheetrock",12:"Air Filters",
    13:"Food",14:"Sludge",15:"Glass",16:"Shoes",17:"Clothing",18:"Furniture",
    19:"Oil",20:"Paint",21:"Foam",22:"Appliances",23:"Dead Animals",
    24:"Cardboard",25:"Debri",26:"Ceramic",27:"Construction Debris",28:"Trash"
}

# Build a lowercase concatenated string representation of each Trux row
trux_row_strings = df_trux.astype(str).apply(lambda r: " ".join(r.tolist()).lower(), axis=1)

entered_list, material_desc_list = [], []
for ticket in df_ref[REF_TICKET]:
    needle = ticket.lstrip("0").lower()
    # locate first Trux row containing the ticket substring
    mask = trux_row_strings.str.contains(needle, na=False)
    if mask.any():
        idx = mask.idxmax()
        entered_ticket = df_trux.at[idx, trux_ticket_col]
        code_raw       = df_trux.at[idx, trux_material_col]
        try:
            code_int = int(str(code_raw).split('.')[0])
        except ValueError:
            code_int = None
        material_desc = material_map.get(code_int, "Unknown Material")
    else:
        entered_ticket = "No Match"
        material_desc  = "No Match"
    entered_list.append(entered_ticket)
    material_desc_list.append(material_desc)

# Insert new columns right after "Difference"
diff_pos = df_ref.columns.get_loc("Difference")
df_ref.insert(diff_pos + 1, "Entered Ticket", entered_list)
df_ref.insert(diff_pos + 2, "Material Description", material_desc_list)

# ───────────────────────────────────────────────────────────────────────────────
# 6.  Clean-up helper numeric columns & save
# ───────────────────────────────────────────────────────────────────────────────
df_ref.drop(columns=["Amt_Num", "Trux_Amount_Num", "Difference_Num"], inplace=True)
df_ref.to_csv(OUTPUT_CSV, index=False)
print(f"✅  Output written → {OUTPUT_CSV}")
