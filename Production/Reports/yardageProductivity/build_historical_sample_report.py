"""
Generate the Historical Front Load Yardage Report workbook where:
    - Column headers are months (e.g., Aug2025, Sep2025, …).
    - Rows (column A) are week buckets: w1, w2, w3, w4, w5, …
    - Each cell contains the total Front Load yardage summed across every route
      for that month/week combination.

Data source:
    - Front Load "All Data" worksheets from every archived monthly workbook
      under `files/Archive/<year>/MonthlyReports/`
    - The current month's processed workbook under `files/Processed/`
      (only canonical `<Mon><Year>` filenames are included to avoid old
      snapshots being counted twice)

Usage (from repository root, preferably via the bundled interpreter):

    .\\Scripts\\python.exe build_historical_sample_report.py \\
        --output files\\Processed\\Historical_Front_Load_Yardage_Report.xlsx
"""

from __future__ import annotations

import argparse
import re
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Sequence

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
ARCHIVE_ROOT = BASE_DIR / "files" / "Archive"
PROCESSED_DIR = BASE_DIR / "files" / "Processed"
DEFAULT_OUTPUT = (
    BASE_DIR / "files" / "Processed" / "Historical_Front_Load_Yardage_Report.xlsx"
)

# Compiled regex to detect the month token embedded in filenames such as
# "Yardage_Report_with_summary_Aug2025.xlsx"
PERIOD_TOKEN_RE = re.compile(r"Yardage_Report_with_summary_(.+)\.xlsx$", re.IGNORECASE)
MONTH_TOKEN_RE = re.compile(r"^([A-Za-z]+)(\d{4})$")
MONTH_NAME_MAP = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a historical Front Load weekly yardage workbook (months across, w1..w5 down)."
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Destination .xlsx file (default: files/Processed/Historical_Front_Load_Yardage_Report.xlsx)",
    )
    return parser.parse_args()


def _normalized_period_key(token: str) -> tuple[int, int] | None:
    """
    Validate and normalize a `<Mon><Year>` token into a (year, month) tuple.
    Returns None if the token does not match the canonical pattern.
    """
    m = MONTH_TOKEN_RE.match(token)
    if not m:
        return None
    month_name, year_str = m.groups()
    month_num = MONTH_NAME_MAP.get(month_name.lower())
    if not month_num:
        return None
    return int(year_str), month_num


def discover_front_load_workbooks() -> OrderedDict[tuple[int, int], Path]:
    """
    Return an ordered mapping of (year, month) -> workbook Path.

    Only canonical tokens such as `Aug2025` or `September2025` are accepted.
    Archive files win precedence to avoid double counting when the same month
    also exists in `files/Processed/`.
    """
    discovered: OrderedDict[tuple[int, int], Path] = OrderedDict()

    # 1) Historical archive first (preferred source)
    if ARCHIVE_ROOT.exists():
        for month_file in sorted(
            ARCHIVE_ROOT.glob("*/MonthlyReports/Yardage_Report_with_summary_*.xlsx")
        ):
            token = PERIOD_TOKEN_RE.search(month_file.name)
            if not token:
                continue
            key = _normalized_period_key(token.group(1))
            if not key:
                continue
            discovered.setdefault(key, month_file)

    # 2) Current processed files (fill gaps only)
    if PROCESSED_DIR.exists():
        for month_file in sorted(PROCESSED_DIR.glob("Yardage_Report_with_summary_*.xlsx")):
            token = PERIOD_TOKEN_RE.search(month_file.name)
            if not token:
                continue
            key = _normalized_period_key(token.group(1))
            if not key:
                continue
            discovered.setdefault(key, month_file)

    return discovered


def coerce_date(value: object) -> pd.Timestamp | None:
    """
    Convert the raw Date cell (string) into a pandas Timestamp.
    Expected formats resemble 'August- 4-2025'. Whitespace and dashes are normalized
    before parsing with strptime.
    """
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text:
        return None
    # Replace dashes with spaces, collapse duplicate spaces, and try multiple formats.
    normalized = " ".join(text.replace("-", " ").split())
    for fmt in ("%B %d %Y", "%b %d %Y"):
        try:
            return pd.Timestamp(datetime.strptime(normalized, fmt))
        except ValueError:
            continue
    return None


def load_all_data(workbooks: Sequence[Path]) -> pd.DataFrame:
    """
    Read the 'All Data' sheet from every workbook and concatenate into a single DataFrame.
    Adds the source period token to each row for traceability.
    """
    frames = []
    for wb_path in workbooks:
        try:
            df = pd.read_excel(wb_path, sheet_name="All Data")
        except Exception as exc:
            print(f"Warning: skipped {wb_path} ({exc})")
            continue

        df["__SourceWorkbook"] = wb_path
        frames.append(df)

    if not frames:
        raise RuntimeError("No Front Load 'All Data' worksheets were found in the expected locations.")

    combined = pd.concat(frames, ignore_index=True)
    return combined


def build_weekly_summary(df: pd.DataFrame) -> tuple[pd.DataFrame, OrderedDict[str, float]]:
    """
    Create a pivot table with week buckets as rows and month labels as columns.
    Values represent total yardage summed across all Front Load routes per
    month-week combination.
    """
    df = df.copy()

    # Ensure numeric yardage
    df["Yardage"] = pd.to_numeric(df["Yardage"], errors="coerce").fillna(0)

    # Coerce dates and drop rows without usable dates
    df["Date"] = df["Date"].map(coerce_date)
    df = df.dropna(subset=["Date"])

    # Focus on Front Load data only (should already be filtered, but double-check)
    if "ServiceType" in df.columns:
        df = df[df["ServiceType"].str.strip().str.lower() == "front load"]

    if df.empty:
        raise RuntimeError("After filtering, no Front Load yardage rows remain to summarize.")

    # Drop Delivery rows defensively (routeAuditDataProcess should have removed them already)
    if "RouteName" in df.columns:
        df = df[~df["RouteName"].str.contains("delivery", case=False, na=False)]

    df["MonthPeriod"] = df["Date"].dt.to_period("M")
    df["MonthLabel"] = df["MonthPeriod"].dt.strftime("%b%Y")
    df["WeekOfMonth"] = ((df["Date"].dt.day - 1) // 7 + 1).astype(int)
    df["WeekLabel"] = "w" + df["WeekOfMonth"].astype(int).astype(str)

    summary = (
        df.groupby(["MonthPeriod", "MonthLabel", "WeekOfMonth", "WeekLabel"])["Yardage"]
        .sum()
        .reset_index()
    )

    pivot = summary.pivot(
        index="WeekLabel",
        columns="MonthPeriod",
        values="Yardage",
    )

    # Order months from most recent to oldest, then map to formatted labels
    pivot = pivot.reindex(sorted(pivot.columns, reverse=True), axis=1)
    month_labels = (
        summary[["MonthPeriod", "MonthLabel"]]
        .drop_duplicates()
        .set_index("MonthPeriod")["MonthLabel"]
    )
    pivot = pivot.rename(columns=month_labels.to_dict())

    # Determine the full set of week labels (w1..wN) observed
    max_week = int(summary["WeekOfMonth"].max())
    week_index = [f"w{i}" for i in range(1, max_week + 1)]
    pivot = pivot.reindex(week_index)

    pivot = pivot.fillna(0).round(0).astype(int)

    # Move week labels to column A
    pivot = pivot.reset_index().rename(columns={"index": "Week", "WeekLabel": "Week"})

    month_totals_series = (
        df.groupby(["MonthPeriod", "MonthLabel"])["Yardage"].sum().sort_index(ascending=False)
    )
    month_totals = OrderedDict(
        (label, float(total)) for (_, label), total in month_totals_series.items()
    )

    return pivot, month_totals


def main() -> None:
    args = parse_args()
    workbook_map = discover_front_load_workbooks()
    workbooks = list(workbook_map.values())
    if not workbooks:
        raise RuntimeError("No matching Front Load workbooks found under Archive or Processed directories.")

    print(f"Found {len(workbooks)} workbook(s) to ingest.")
    data = load_all_data(workbooks)
    summary, month_totals = build_weekly_summary(data)

    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        summary.to_excel(writer, sheet_name="Sheet1", index=False)

    print(f"\nHistorical Front Load weekly workbook written to: {output_path}")
    print("\nVerification (monthly totals in yardage):")
    for month_label, source_total in month_totals.items():
        weekly_total = int(summary[month_label].sum()) if month_label in summary.columns else 0
        print(
            f"  {month_label}: weekly sum = {weekly_total:,} | source total = {int(round(source_total)):,}"
        )


if __name__ == "__main__":
    main()
