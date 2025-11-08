import pandas as pd
from pathlib import Path

NEW_PATH = Path(r"C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity\files\MasterFile\Master_Monthly_FL_Yardage_Report_Updated.xlsx")
OLD_PATH = Path(r"C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Reports\yardageProductivity\files\MasterFile\oldTest\Master_Monthly_FL_Yardage_Report_Updated_Aug2025.xlsx")

def find_aug_sheet(xl: pd.ExcelFile) -> str | None:
    for s in xl.sheet_names:
        if s.lower().startswith('aug-2025') or s.lower() == 'aug-2025':
            return s
    return None

def load_aug_df(path: Path) -> pd.DataFrame:
    xl = pd.ExcelFile(path)
    sheet = find_aug_sheet(xl)
    if not sheet:
        raise RuntimeError(f"Aug-2025 sheet not found in {path} (sheets={xl.sheet_names})")
    return xl.parse(sheet)

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    # lower-case & strip, but keep original names mapping
    mapper = {c: str(c).strip() for c in df.columns}
    df = df.rename(columns=mapper)
    return df

def main():
    new_df = normalize_columns(load_aug_df(NEW_PATH))
    old_df = normalize_columns(load_aug_df(OLD_PATH))

    if 'Size-10' not in new_df.columns and 'size-10' in new_df.columns:
        new_df.rename(columns={'size-10': 'Size-10'}, inplace=True)
    if 'Total Yardage' not in new_df.columns and 'total yardage' in new_df.columns:
        new_df.rename(columns={'total yardage': 'Total Yardage'}, inplace=True)
    if 'RouteName' not in new_df.columns and 'routename' in new_df.columns:
        new_df.rename(columns={'routename': 'RouteName'}, inplace=True)
    if 'Day' not in new_df.columns and 'day' in new_df.columns:
        new_df.rename(columns={'day': 'Day'}, inplace=True)

    if 'Size-10' not in old_df.columns and 'size-10' in old_df.columns:
        old_df.rename(columns={'size-10': 'Size-10'}, inplace=True)
    if 'Total Yardage' not in old_df.columns and 'total yardage' in old_df.columns:
        old_df.rename(columns={'total yardage': 'Total Yardage'}, inplace=True)
    if 'RouteName' not in old_df.columns and 'routename' in old_df.columns:
        old_df.rename(columns={'routename': 'RouteName'}, inplace=True)
    if 'Day' not in old_df.columns and 'day' in old_df.columns:
        old_df.rename(columns={'day': 'Day'}, inplace=True)

    # Ensure numeric
    for df in (new_df, old_df):
        if 'Size-10' in df.columns:
            df['Size-10'] = pd.to_numeric(df['Size-10'], errors='coerce').fillna(0)
        if 'Total Yardage' in df.columns:
            df['Total Yardage'] = pd.to_numeric(df['Total Yardage'], errors='coerce').fillna(0)

    # Totals
    new_cnt10 = int(new_df.get('Size-10', pd.Series(dtype=float)).sum())
    old_cnt10 = int(old_df.get('Size-10', pd.Series(dtype=float)).sum())
    new_rowcount_with_10 = int((new_df.get('Size-10', 0) > 0).sum())
    old_rowcount_with_10 = int((old_df.get('Size-10', 0) > 0).sum())
    new_sum_total_on_rows_with_10 = int(new_df.loc[new_df.get('Size-10', 0) > 0, 'Total Yardage'].sum()) if 'Total Yardage' in new_df.columns else None
    old_sum_total_on_rows_with_10 = int(old_df.loc[old_df.get('Size-10', 0) > 0, 'Total Yardage'].sum()) if 'Total Yardage' in old_df.columns else None

    print(f"NEW: Size-10 sum(values)={new_cnt10}, rows_with_Size-10>0={new_rowcount_with_10}, sum(Total Yardage where Size-10>0)={new_sum_total_on_rows_with_10}")
    print(f"OLD: Size-10 sum(values)={old_cnt10}, rows_with_Size-10>0={old_rowcount_with_10}, sum(Total Yardage where Size-10>0)={old_sum_total_on_rows_with_10}")

    # Row-level diffs by (RouteName, Day)
    key_cols = [c for c in ['RouteName', 'Day'] if c in new_df.columns and c in old_df.columns]
    if len(key_cols) == 2 and 'Size-10' in new_df.columns and 'Size-10' in old_df.columns:
        merged = new_df[key_cols + ['Size-10']].merge(
            old_df[key_cols + ['Size-10']],
            on=key_cols,
            suffixes=('_new','_old'),
            how='outer'
        )
        merged[['Size-10_new','Size-10_old']] = merged[['Size-10_new','Size-10_old']].fillna(0)
        merged['delta_10'] = merged['Size-10_new'] - merged['Size-10_old']
        deltas = merged[merged['delta_10'] != 0]
        print(f"Rows with Size-10 deltas: {len(deltas)}")
        # Show a small sample of differences
        asc = [False] + [True] * len(key_cols)
        print(deltas.sort_values(['delta_10'] + key_cols, ascending=asc).head(20).to_string(index=False))
    else:
        print("Skipping row-level diff (missing keys or Size-10)")

if __name__ == '__main__':
    main()
