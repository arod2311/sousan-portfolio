import pandas as pd
from datetime import datetime

#Loading CSV File
file_path = r"C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\landfillProcess\Files\DisposalTicketReport.csv"
data = pd.read_csv(file_path, header=None)

#Clean

#Drop columns A-V (first 22 columns)
data = data.iloc[:, 22:]  # keeps columns from index 22 onward

#Drop columns AP-AZ (columns 40-51)
data = data.iloc[:, :-10]  # removes the last 10 columns

# Clean specific column 'N' (or other numeric columns if required)
data.columns = data.columns.astype(str)

# Drop specific column 'N' if it exists
if "35" in data.columns:  # Column N corresponds to the 36th column (0-based index 35)
    data = data.drop(columns=["35"])
    print("Column 'N' (Index 35) has been removed.", flush=True)

# Drop unnamed or blank columns dynamically
data = data.loc[:, ~data.columns.str.contains('^Unnamed')]  # Removes all unnamed columns dynamically

# Add new header names
header_names = [
    "Ticket",
    "Date",
    "Customer - Site - Service",
    "Service",
    "Container Size",
    "Material",
    "Route",
    "Truck",
    "Quantity",
    "Per",
    "Disposal Rate",
    "Per",
    "Disposal Cost",
    "Quantity Billed",
    "Per",
    "Bill Rate",
    "Per",
    "Amount"
]

# Ensure the cleaned dataset matches the number of headers
if len(data.columns) == len(header_names):
    data.columns = header_names
    print("Headers added successfully.", flush=True)
else:
    print(f"Header mismatch: {len(data.columns)} columns in data, but {len(header_names)} headers provided.", flush=True)

# Remove leading zeros from the "Ticket" column
if "Ticket" in data.columns:
    data["Ticket"] = data["Ticket"].astype(str).str.lstrip('0')
    print("Leading zeros removed from 'Ticket' column.", flush=True)

# Save cleaned data to new CSV
current_date = datetime.now().strftime("%Y-%m-%d")  # Get the current date in YYYY-MM-DD format
output_file = rf"C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\landfillProcess\Files\Cleaned\Cleaned_Trux_DisposalTicketReport_{current_date}.csv"
data.to_csv(output_file, index=False)

print(f"Cleaned file saved as {output_file}")
