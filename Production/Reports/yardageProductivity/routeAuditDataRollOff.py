import pandas as pd
import re
import os

# Define file path (update filename accordingly)
file_path = r'C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity\files\Working\routeProductivityReportAug2025.xlsx'

# Optional override via environment (for automation)
file_path = os.environ.get('RO_INPUT_XLSX', file_path)

# Load Excel data
excel_data = pd.ExcelFile(file_path)

# Define regex patterns
route_pattern = re.compile(r"Route:\s*(\d{4})")
date_pattern = re.compile(r"Date:\s*(.+)")

# Initialize list for final data records
cleaned_records = []

# Keywords to remove rows
remove_keywords = [
    "subtotals:",
    "totals:",
    "# = scheduled not equal max.  c = compacted",
    "alejandro",
    "southern sanitation"
]

# Process Excel data
for sheet_name in excel_data.sheet_names:
    df = excel_data.parse(sheet_name, header=None)

    current_route = None
    current_date  = None

    for index, row in df.iterrows():
        # Extract Route and Date from header rows
        if pd.notna(row[1]) and isinstance(row[1], str):
            m = route_pattern.search(row[1])
            if m:
                current_route = m.group(1)

        if pd.notna(row[4]) and isinstance(row[4], str):
            m = date_pattern.search(row[4])
            if m:
                current_date = m.group(1)

        # Skip unwanted footer/summary rows
        if any(keyword in str(row[0]).lower() for keyword in remove_keywords):
            continue

        # Only capture rows with numeric Size & Quantity
        if pd.notna(row[5]) and pd.notna(row[7]):
            try:
                size     = float(row[5])
                qty      = float(row[7])
                yardage  = size * qty
                site     = row[2]
                act_code = row[3]

                cleaned_records.append({
                    "Route":           current_route,
                    "Date":            current_date,
                    "CustomerSiteName": site,
                    "ActivityCode":    act_code,
                    "Size":            size,
                    "Quantity":        qty,
                    "Yardage":         yardage
                })
            except ValueError:
                continue

# Create final DataFrame
final_df = pd.DataFrame(cleaned_records)

# Derive additional columns
final_df['Day'] = final_df['Route'].apply(
    lambda x: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][int(x[0]) - 1]
)
final_df['ServiceType'] = final_df['Route'].apply(
    lambda x: 'Front Load' if x[1]=='1'
              else ('Roll Off' if x[1]=='2'
                    else 'Delivery')
)
final_df['RouteName'] = final_df['Route'].apply(
    lambda x: f"Delivery {int(x[2:])}" if x[1]=='3'
              else f"Route {int(x[2:])}"
)

# *** NEW: keep only Roll Off records ***
final_df = final_df[ final_df['ServiceType'] == 'Roll Off' ].reset_index(drop=True)

# Rearrange columns
final_df = final_df[
    ['RouteName','Day','ServiceType','Route','Date',
     'CustomerSiteName','ActivityCode','Size','Quantity','Yardage']
]

# Save all data
output_file_path = (
    r'C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports'
    r'\yardageProductivity\files\Processed\Yardage_Report_RollOff_Aug2025.xlsx'
)
output_file_path = os.environ.get('RO_OUTPUT_XLSX', output_file_path)
os.makedirs(os.path.dirname(output_file_path), exist_ok=True)

with pd.ExcelWriter(output_file_path) as writer:
    final_df.to_excel(writer, sheet_name="All Data", index=False)

    # Yardage Summary by Route
    route_summary = (
        final_df.groupby('RouteName')['Yardage']
                .sum()
                .reset_index()
    )
    route_summary['RouteNum'] = (
        route_summary['RouteName']
        .str.extract(r'(\d+)')
        .astype(int)
    )
    route_summary = (
        route_summary
        .sort_values('RouteNum')
        .drop('RouteNum', axis=1)
    )

    # Yardage Summary by Day
    day_order   = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
    day_summary = (
        final_df.groupby('Day')['Yardage']
                .sum()
                .reindex(day_order)
                .reset_index()
    )

    # Combine and write
    summary_df = pd.concat([
        route_summary,
        pd.DataFrame({"RouteName": [""], "Yardage": [""]}),
        day_summary.rename(columns={"Day":"RouteName"})
    ], ignore_index=True)
    summary_df.to_excel(writer, sheet_name="Yardage Summary", index=False)

    # Summary by Route-Day
    route_day = (
        final_df.groupby(['RouteName','Day','Size'])
                .agg(Count=('Quantity','sum'),
                     Yardage=('Yardage','sum'))
                .reset_index()
    )
    route_day['IsDelivery'] = route_day['RouteName'].str.startswith("Delivery").map({True:0,False:1})
    route_day['RouteNum']    = route_day['RouteName'].str.extract(r'(\d+)').astype(int)
    route_day['DayNum']      = route_day['Day'].map({d:i for i,d in enumerate(day_order)})

    route_day = (
        route_day
        .sort_values(['IsDelivery','RouteNum','DayNum','Size'])
        .drop(['IsDelivery','RouteNum','DayNum'], axis=1)
    )
    route_day.to_excel(writer, sheet_name="Summary by Route-Day", index=False)

print(f"Roll‐Off report saved to:\n  {output_file_path}")
