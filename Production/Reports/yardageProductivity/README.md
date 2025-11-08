# Yardage Productivity Monthly Pipeline

This folder automates the monthly yardage productivity workflow for Southern Sanitation. The orchestrator
script (`run_monthly.py`) cleans the Front Load and Roll-Off exports, writes monthly reports, updates master
comparison workbooks, and can optionally push results to Google Sheets.

## Prerequisites
- Windows with Python 3.13.x (matches the bundled virtual environment under `Scripts/`)
- Access to the Soft-Pak Yardage Productivity report export in Excel format
- Microsoft Excel (recommended for spot-checking outputs)
- Optional: Google service account JSON and target Sheet if you plan to publish results

### Python environment
The repository already contains a virtual environment. Run everything through the included interpreter so
dependencies such as `pandas` and `openpyxl` are available:

```powershell
# From this directory
.\Scripts\python.exe -m pip list
```

If you need to recreate the environment on a new machine:

```powershell
py -3.13 -m venv .
.\Scripts\python.exe -m pip install --upgrade pip
.\Scripts\python.exe -m pip install pandas openpyxl
# Optional Google Sheets upload support
.\Scripts\python.exe -m pip install gspread gspread_dataframe google-auth
```

## Directory layout
- `run_monthly.py` - entry point that orchestrates the full monthly run
- `routeAuditDataProcess.py` - Front Load (FL) data cleanup
- `routeAuditDataRollOff.py` - Roll-Off (RO) data cleanup
- `Master_Monthly_Comparison_Report.py` - rebuilds the FL master workbook
- `monthlyComparisonRollOff.py` - rebuilds the RO master workbook
- `upload_to_sheets.py` - optional Google Sheets publisher
- `files/Working/` - drop the raw Soft-Pak export(s) here
- `files/Processed/` - script output files land here
- `files/Archive/<year>/MonthlyReports[/RollOff]/` - auto-created archival copies
- `files/MasterFile/` - source templates for the master comparison workbooks

## Preparing the input file(s)
1. Export the Yardage Productivity report from Soft-Pak for the month you are closing.
2. Save the Excel file in `files\Working` named `routeProductivityReport<MonYear>.xlsx` (example:
   `routeProductivityReportSep2025.xlsx`). The `<MonYear>` token is the three-letter month plus four-digit
   year, matching what you will pass to `--period`.
3. If you receive separate Front Load and Roll-Off exports, save both in `files\Working` and use the `--fl`
   and `--ro` flags when running (see below). Otherwise, one combined file is enough for both passes.
4. Close the Excel file before starting the script (open files can block pandas from writing output).

## Running the monthly pipeline
1. Open PowerShell and change to `C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity`.
2. (Optional) Do a dry run to confirm the script can see your inputs:

   ```powershell
   .\Scripts\python.exe run_monthly.py --period Sep2025 --dry-run
   ```

   The script prints the resolved input/output paths and then stops.

3. Run the full process (combined file case):

   ```powershell
   .\Scripts\python.exe run_monthly.py --period Sep2025
   ```

   The pipeline performs the following steps:
   - Cleans the Front Load data (writes `Yardage_Report_with_summary_<period>.xlsx`)
   - Cleans the Roll-Off data (writes `Yardage_Report_RollOff_<period>.xlsx`)
   - Copies both reports into the year-specific archive folders
   - Rebuilds the two master comparison workbooks
   - Optionally triggers a Google Sheets upload if you supplied the flags below

4. If you have separate source files, specify them explicitly:

   ```powershell
   .\Scripts\python.exe run_monthly.py --period Sep2025 `
       --fl files\Working\FrontLoad_Sep2025.xlsx `
       --ro files\Working\RollOff_Sep2025.xlsx
   ```

5. Use `--year` only when the `<MonYear>` token does not contain the correct year (rare cases such as
   fiscal cross-overs).

### Command-line reference
- `--period <MonYear>` (required) - token that matches your input filename (e.g., `Aug2025`, `Sep2025`).
- `--fl <path>` - custom Front Load source file. Defaults to `files/Working/routeProductivityReport<period>.xlsx`.
- `--ro <path>` - custom Roll-Off source file. Defaults to the same file as `--fl`.
- `--year <YYYY>` - override the year portion used when building archive folder paths.
- `--sheet-id <id>` or `--sheet-url <url>` - enable Google Sheets upload (requires `--creds`).
- `--creds <path>` - service account JSON for Google Sheets uploads.
- `--dry-run` - print configuration only; skip processing.

## Output
- Processed files: `files\Processed\Yardage_Report_with_summary_<period>.xlsx` and
  `files\Processed\Yardage_Report_RollOff_<period>.xlsx`.
- Archive copies: `files\Archive\<year>\MonthlyReports\` for FL and the `RollOff` subfolder for RO.
- Master workbooks refreshed in place (see `files\MasterFile\`).
- Console output logs each script invocation so you can track progress.

## Optional: publish to Google Sheets
1. Ensure the environment has `gspread`, `gspread_dataframe`, and `google-auth` installed.
2. Obtain a service account key JSON with access to the target Google Sheet.
3. Run the pipeline with the upload flags:

   ```powershell
   .\Scripts\python.exe run_monthly.py --period Sep2025 `
       --sheet-url https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0 `
       --creds C:\Path\to\service_account.json
   ```

   The uploader writes or replaces these worksheets: `FL_All_Data`, `FL_Summary_by_Route_Day`,
   `RO_All_Data`, `RO_Summary_by_Route_Day`, `Monthly_Summary_FL`, and `Monthly_Summary_RO`.

## Troubleshooting
- **File not found** - confirm the `<MonYear>` portion of your filename and `--period` argument match exactly.
- **Permission denied / file in use** - close any of the Excel workbooks before rerunning.
- **Python complains about missing modules** - recreate the venv and reinstall the packages listed above.
- **Wrong archive destination** - pass `--year` to force a specific archive folder.
- **Google Sheets upload fails** - verify the service account has edit permissions and that the Sheet ID/URL is
  correct.

With these steps, any teammate can drop in the monthly export, run `run_monthly.py`, review the generated
reports, and publish them as needed.




