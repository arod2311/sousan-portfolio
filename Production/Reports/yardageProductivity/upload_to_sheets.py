r"""
Upload monthly processed FL/RO data to a Google Sheet.

Requires:
  pip install gspread gspread_dataframe google-auth

Usage example:
  .\Scripts\python.exe upload_to_sheets.py \
    --period Aug2025 \
    --creds C:\path\to\service_account.json \
    --sheet-url https://docs.google.com/spreadsheets/d/<ID>/edit#gid=0

Writes worksheets:
  - FL_All_Data
  - FL_Summary_by_Route_Day
  - RO_All_Data
  - RO_Summary_by_Route_Day
  - Monthly_Summary_FL   (from FL master "Summary" sheet)
  - Monthly_Summary_RO   (from RO master "Summary" sheet)
"""

from __future__ import annotations
import argparse
import re
from pathlib import Path
import datetime as _dt
import pandas as pd


def parse_args():
    p = argparse.ArgumentParser(description="Upload monthly FL/RO data to Google Sheets")
    p.add_argument("--period", required=True, help="Month token, e.g., Aug2025")
    p.add_argument("--creds", required=True, help="Path to Google service account JSON")
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--sheet-id", help="Target Google Sheet ID")
    group.add_argument("--sheet-url", help="Target Google Sheet URL")
    p.add_argument("--base-dir", default=None, help="Override base directory (defaults to this script's folder)")
    return p.parse_args()


def extract_sheet_id(url_or_id: str) -> str:
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url_or_id)
    if m:
        return m.group(1)
    return url_or_id


def open_sheet(sheet_id: str, creds_path: str):
    import gspread
    from gspread_dataframe import set_with_dataframe
    gc = gspread.service_account(filename=creds_path)
    sh = gc.open_by_key(sheet_id)
    return sh, set_with_dataframe


def upsert_worksheet(sh, title: str):
    try:
        ws = sh.worksheet(title)
    except Exception:
        ws = sh.add_worksheet(title=title, rows=1, cols=1)
    return ws


def write_df(sh, title: str, df: pd.DataFrame, set_with_dataframe):
    ws = upsert_worksheet(sh, title)
    # clear and write
    ws.clear()
    set_with_dataframe(ws, df, include_index=False, include_column_header=True, resize=True)


def _parse_month_date(label: str) -> _dt.date | None:
    """Parse sheet names like 'Aug-2025' or 'August-2025' into a date (YYYY-MM-01)."""
    m = re.match(r"\s*([A-Za-z]+)\s*-\s*(\d{4})\s*$", label)
    if not m:
        return None
    mon_s, year_s = m.group(1).lower(), m.group(2)
    month_map = {
        'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,
        'may':5,'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,'sep':9,'sept':9,
        'september':9,'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12
    }
    mm = month_map.get(mon_s)
    if not mm:
        return None
    return _dt.date(int(year_s), mm, 1)


def _build_history_from_master(master_path: Path, is_ro: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Returns (route_day_monthly, route_day_size_monthly).
    - route_day_monthly columns: [Month, MonthDate, RouteName, Day, Services, TotalYardage]
    - route_day_size_monthly:    [Month, MonthDate, RouteName, Day, Size, Services, Yardage]
    """
    if not master_path.exists():
        return pd.DataFrame(), pd.DataFrame()
    xl = pd.ExcelFile(master_path)

    # Define size columns expected
    size_list = [10,15,20,30,40] if is_ro else [0,2,4,6,8,10]
    size_cols = [f"Size-{s}" for s in size_list]

    rd_rows = []
    rds_rows = []

    for sheet in xl.sheet_names:
        if sheet.strip().lower() == 'summary':
            continue
        mdate = _parse_month_date(sheet)
        if not mdate:
            continue
        try:
            df = xl.parse(sheet)
        except Exception:
            continue
        # retain only base columns present
        base = [c for c in ['RouteName','Day','# of Services','Total Yardage'] if c in df.columns]
        base += [c for c in size_cols if c in df.columns]
        if not base:
            continue
        df = df[base].copy()

        # route-day monthly
        df_rd = df[['RouteName','Day']].copy()
        df_rd['Services'] = pd.to_numeric(df.get('# of Services', 0), errors='coerce').fillna(0)
        df_rd['TotalYardage'] = pd.to_numeric(df.get('Total Yardage', 0), errors='coerce').fillna(0)
        df_rd['Month'] = f"{mdate.strftime('%b')}-{mdate.year}"
        df_rd['MonthDate'] = pd.to_datetime(mdate)
        rd_rows.append(df_rd)

        # route-day-size monthly (melt size columns)
        present_size_cols = [c for c in size_cols if c in df.columns]
        if present_size_cols:
            melted = df.melt(id_vars=['RouteName','Day'], value_vars=present_size_cols,
                             var_name='SizeCol', value_name='Services')
            melted['Services'] = pd.to_numeric(melted['Services'], errors='coerce').fillna(0)
            melted = melted[melted['Services'] > 0]
            melted['Size'] = pd.to_numeric(melted['SizeCol'].str.extract(r'(\d+)')[0], errors='coerce')
            melted['Yardage'] = melted['Size'] * melted['Services']
            melted['Month'] = f"{mdate.strftime('%b')}-{mdate.year}"
            melted['MonthDate'] = pd.to_datetime(mdate)
            rds_rows.append(melted[['Month','MonthDate','RouteName','Day','Size','Services','Yardage']])

    route_day = pd.concat(rd_rows, ignore_index=True) if rd_rows else pd.DataFrame(columns=['Month','MonthDate','RouteName','Day','Services','TotalYardage'])
    route_day_size = pd.concat(rds_rows, ignore_index=True) if rds_rows else pd.DataFrame(columns=['Month','MonthDate','RouteName','Day','Size','Services','Yardage'])
    return route_day, route_day_size


def main():
    args = parse_args()
    base_dir = Path(args.base_dir) if args.base_dir else Path(__file__).resolve().parent
    period = args.period
    sheet_id = extract_sheet_id(args.sheet_id or args.sheet_url)

    # Source files
    fl_proc = base_dir / 'files' / 'Processed' / f'Yardage_Report_with_summary_{period}.xlsx'
    ro_proc = base_dir / 'files' / 'Processed' / f'Yardage_Report_RollOff_{period}.xlsx'
    fl_master = base_dir / 'files' / 'MasterFile' / 'Master_Monthly_FL_Yardage_Report_Updated.xlsx'
    ro_master = base_dir / 'files' / 'MasterFile' / 'RollOff' / 'Master_Monthly_RollOff_Yardage_Report_Updated.xlsx'

    # Load data
    fl_all = pd.read_excel(fl_proc, sheet_name='All Data')
    fl_sum_rd = pd.read_excel(fl_proc, sheet_name='Summary by Route-Day')
    ro_all = pd.read_excel(ro_proc, sheet_name='All Data')
    ro_sum_rd = pd.read_excel(ro_proc, sheet_name='Summary by Route-Day')

    # Monthly summaries (handle missing 'Summary' for FL by building a fallback)
    def load_summary(path: Path) -> pd.DataFrame:
        try:
            return pd.read_excel(path, sheet_name='Summary')
        except Exception:
            # Fallback: build a quick summary by summing '# of Services' for each month sheet
            try:
                xl = pd.ExcelFile(path)
            except Exception:
                return pd.DataFrame(columns=['Month', 'TotalServices'])
            out = []
            for s in xl.sheet_names:
                if s.lower() == 'summary':
                    continue
                try:
                    df = xl.parse(s)
                    if '# of Services' in df.columns:
                        out.append({'Month': s, 'TotalServices': pd.to_numeric(df['# of Services'], errors='coerce').fillna(0).sum()})
                except Exception:
                    continue
            return pd.DataFrame(out)

    fl_month = load_summary(fl_master)
    ro_month = load_summary(ro_master)

    # Open Google Sheet
    sh, set_with_dataframe = open_sheet(sheet_id, args.creds)

    # Write datasets (current month detail)
    write_df(sh, 'FL_All_Data', fl_all, set_with_dataframe)
    write_df(sh, 'FL_Summary_by_Route_Day', fl_sum_rd, set_with_dataframe)
    write_df(sh, 'RO_All_Data', ro_all, set_with_dataframe)
    write_df(sh, 'RO_Summary_by_Route_Day', ro_sum_rd, set_with_dataframe)
    write_df(sh, 'Monthly_Summary_FL', fl_month, set_with_dataframe)
    write_df(sh, 'Monthly_Summary_RO', ro_month, set_with_dataframe)

    # Write historical per-month datasets derived from masters
    fl_rd, fl_rds = _build_history_from_master(fl_master, is_ro=False)
    ro_rd, ro_rds = _build_history_from_master(ro_master, is_ro=True)
    if not fl_rd.empty:
        write_df(sh, 'FL_RouteDay_Monthly', fl_rd, set_with_dataframe)
    if not fl_rds.empty:
        write_df(sh, 'FL_RouteDaySize_Monthly', fl_rds, set_with_dataframe)
    if not ro_rd.empty:
        write_df(sh, 'RO_RouteDay_Monthly', ro_rd, set_with_dataframe)
    if not ro_rds.empty:
        write_df(sh, 'RO_RouteDaySize_Monthly', ro_rds, set_with_dataframe)

    print('Upload complete to Google Sheets.')


if __name__ == '__main__':
    main()
