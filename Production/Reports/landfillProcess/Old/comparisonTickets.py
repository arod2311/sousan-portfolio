import pandas as pd

# File paths
reference_file = r"C:\Users\arodriguez\Documents\Projects\landfillProcess\Files\rollOffCityOfLaredoTickets.csv"
trux_file = r"C:\Users\arodriguez\Documents\Projects\landfillProcess\Files\Cleaned\Cleaned_Trux_DisposalTicketReport_2025-02-03.csv"

# Load data
reference_data = pd.read_csv(reference_file)  # Load the reference file
trux_data = pd.read_csv(trux_file)  # Load the Trux report

# Clean column names (strip leading/trailing spaces)
reference_data.columns = reference_data.columns.str.strip()  # Reference file columns
trux_data.columns = trux_data.columns.str.strip()  # Trux file columns

# Column names
reference_ticket_col = "Ticket"  # Ticket column in reference file
trux_ticket_col = "Ticket"  # Ticket column in Trux file

# Ensure all ticket values are strings and remove leading zeros for consistency
reference_data[reference_ticket_col] = reference_data[reference_ticket_col].astype(str).str.lstrip('0').str.strip()
trux_data[trux_ticket_col] = trux_data[trux_ticket_col].astype(str).str.lstrip('0').str.strip()

# Debugging: Print sample values to verify formatting
print("Reference Tickets (Cleaned):\n", reference_data[reference_ticket_col].head())
print("Trux Tickets (Cleaned):\n", trux_data[trux_ticket_col].head())

# Add "Found in Trux" column
reference_data["Found in Trux"] = reference_data[reference_ticket_col].isin(trux_data[trux_ticket_col]).map({True: "Yes", False: "No"})

# Debugging: Check match results
print("Match Results:\n", reference_data[["Ticket", "Found in Trux"]].head())

# Save the updated reference data to a new file
output_file = r"C:\Users\arodriguez\Documents\Projects\landfillProcess\Files\Processed\Updated_rollOffCityOfLaredoTickets.csv"
reference_data.to_csv(output_file, index=False)

print(f"Updated file saved as {output_file}")
