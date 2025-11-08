import pandas as pd
import re
import os

# Define file path (update filename accordingly)
file_path = r'C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity\files\Working\betoFLReport.xlsx'

# Allow env var override for automation
file_path = os.environ.get('FL_INPUT_XLSX', file_path)

# Load Excel data
excel_data = pd.ExcelFile(file_path)

# Define regex patterns
route_pattern = re.compile(r"Route:\s*(\d{4})")
date_pattern = re.compile(r"Date:\s*(.+)")

# Initialize list for final data records
cleaned_records = []

# Keywords to remove rows
remove_keywords = ["subtotals:", "totals:", "# = scheduled not equal max.  c = compacted", "alejandro", "southern sanitation"]

# Process Excel data
for sheet_name in excel_data.sheet_names:
    df = excel_data.parse(sheet_name, header=None)

    current_route = None
    current_date = None

    for index, row in df.iterrows():
        # Extract Route and Date
        if pd.notna(row[1]) and isinstance(row[1], str):
            route_match = route_pattern.search(row[1])
            if route_match:
                current_route = route_match.group(1)

        if pd.notna(row[4]) and isinstance(row[4], str):
            date_match = date_pattern.search(row[4])
            if date_match:
                current_date = date_match.group(1)

        # Skip unwanted rows explicitly
        if any(keyword in str(row[0]).lower() for keyword in remove_keywords):
            continue

        # Verify numeric data for size and quantity explicitly
        if pd.notna(row[5]) and pd.notna(row[7]):
            try:
                container_size = float(row[5])
                quantity = float(row[7])
                yardage = container_size * quantity
                customer_site_name = row[2]
                activity_code = row[3]

                cleaned_records.append({
                    "Route": current_route,
                    "Date": current_date,
                    "CustomerSiteName": customer_site_name,
                    "ActivityCode": activity_code,
                    "Size": container_size,
                    "Quantity": quantity,
                    "Yardage": yardage
                })
            except ValueError:
                continue

# Create final DataFrame
final_df = pd.DataFrame(cleaned_records)

# Derive additional columns with updated logic
final_df['Day'] = final_df['Route'].apply(lambda x: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][int(x[0])-1])
final_df['ServiceType'] = final_df['Route'].apply(lambda x: 'Front Load' if x[1] == '1' else ('Roll Off' if x[1] == '2' else 'Delivery'))
final_df['RouteName'] = final_df['Route'].apply(lambda x: f"Delivery {int(x[2:])}" if x[1] == '3' else f"Route {int(x[2:])}")

# Remove all rows where ServiceType is "Roll Off"
final_df = final_df[final_df['ServiceType'] == 'Front Load'].reset_index(drop=True)

# Rearrange columns
final_df = final_df[['RouteName', 'Day', 'ServiceType', 'Route', 'Date', 'CustomerSiteName', 'ActivityCode', 'Size', 'Quantity', 'Yardage']]

# Save all data
output_file_path = r'C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity\files\Processed\Yardage_Report_with_summary_Aug2025.xlsx'
# Optional override via environment (for automation)
output_file_path = os.environ.get('FL_OUTPUT_XLSX', output_file_path)
os.makedirs(os.path.dirname(output_file_path), exist_ok=True)
with pd.ExcelWriter(output_file_path) as writer:
    final_df.to_excel(writer, sheet_name="All Data", index=False)

    # Yardage Summary by Route sorted
    route_summary = final_df.groupby('RouteName')['Yardage'].sum().reset_index()
    route_summary['RouteNum'] = route_summary['RouteName'].str.extract(r'(\d+)').astype(int)
    route_summary = route_summary.sort_values('RouteNum').drop('RouteNum', axis=1)

    # Yardage Summary by Day ordered
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    day_summary = final_df.groupby('Day')['Yardage'].sum().reindex(day_order).reset_index()

    # Combine summaries
    summary_df = pd.concat([route_summary, pd.DataFrame({"RouteName": [""], "Yardage": [""]}),
                            day_summary.rename(columns={"Day": "RouteName"})], ignore_index=True)
    summary_df.to_excel(writer, sheet_name="Yardage Summary", index=False)

    # Summary by Route-Day sorted
    route_day_summary = final_df.groupby(['RouteName', 'Day', 'Size']).agg(
        Count=('Quantity', 'sum'),
        Yardage=('Yardage', 'sum')
    ).reset_index()

    route_day_summary['IsDelivery'] = route_day_summary['RouteName'].apply(lambda x: 0 if 'Delivery' in x else 1)
    route_day_summary['RouteNum'] = route_day_summary['RouteName'].str.extract(r'(\d+)').astype(int)
    route_day_summary['DayNum'] = route_day_summary['Day'].map({day: i for i, day in enumerate(day_order)})

    route_day_summary = route_day_summary.sort_values(['IsDelivery', 'RouteNum', 'DayNum', 'Size']).drop(['IsDelivery', 'RouteNum', 'DayNum'], axis=1)

    route_day_summary.to_excel(writer, sheet_name="Summary by Route-Day", index=False)

print(f"Cleaned data and summaries saved successfully at {output_file_path}")
