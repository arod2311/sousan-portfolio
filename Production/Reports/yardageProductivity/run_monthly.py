import argparse
import os
import re
import shutil
import subprocess
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
SCRIPTS_PY = Path(BASE_DIR, 'Scripts', 'python.exe') if (BASE_DIR / 'Scripts' / 'python.exe').exists() else None


def parse_args():
    p = argparse.ArgumentParser(description='Run monthly FL and RO processing + masters in one command')
    p.add_argument('--period', required=True, help='MonthYear token, e.g., Aug2025 or July2025')
    p.add_argument('--fl', dest='fl_input', help='Optional explicit Front Load input XLSX')
    p.add_argument('--ro', dest='ro_input', help='Optional explicit Roll-Off input XLSX')
    p.add_argument('--year', type=int, help='Override year (default from period)')
    # Optional Google Sheets upload
    p.add_argument('--sheet-id', help='Google Sheet ID to upload results')
    p.add_argument('--sheet-url', help='Google Sheet URL to upload results')
    p.add_argument('--creds', help='Path to Google service account JSON')
    p.add_argument('--dry-run', action='store_true', help='Print actions but do not execute')
    return p.parse_args()


def derive_year(period: str) -> int:
    m = re.search(r'(20\d{2})', period)
    if not m:
        raise ValueError('Period must include a 4-digit year like 2025')
    return int(m.group(1))


def build_default_input(period: str) -> Path:
    return BASE_DIR / 'files' / 'Working' / f'routeProductivityReport{period}.xlsx'


def run_py(script: Path, env: dict):
    exe = str(SCRIPTS_PY) if SCRIPTS_PY else 'python'
    cmd = [exe, str(script)]
    print(f'Running: {" ".join(cmd)}')
    subprocess.check_call(cmd, env=env)


def main():
    args = parse_args()
    period = args.period
    year = args.year or derive_year(period)

    # Inputs (allow one combined export by default)
    fl_input = Path(args.fl_input) if args.fl_input else build_default_input(period)
    ro_input = Path(args.ro_input) if args.ro_input else fl_input

    # Processed outputs
    processed_dir = BASE_DIR / 'files' / 'Processed'
    fl_out = processed_dir / f'Yardage_Report_with_summary_{period}.xlsx'
    ro_out = processed_dir / f'Yardage_Report_RollOff_{period}.xlsx'

    # Archive locations
    archive_root = BASE_DIR / 'files' / 'Archive' / str(year) / 'MonthlyReports'
    fl_archive_dir = archive_root
    ro_archive_dir = archive_root / 'RollOff'
    fl_archive = fl_archive_dir / f'Yardage_Report_with_summary_{period}.xlsx'
    ro_archive = ro_archive_dir / f'Yardage_Report_RollOff_{period}.xlsx'

    # Scripts
    fl_script = BASE_DIR / 'routeAuditDataProcess.py'
    ro_script = BASE_DIR / 'routeAuditDataRollOff.py'
    fl_master = BASE_DIR / 'Master_Monthly_Comparison_Report.py'
    ro_master = BASE_DIR / 'monthlyComparisonRollOff.py'

    print('--- Configuration ---')
    print(f'FL in : {fl_input}')
    print(f'RO in : {ro_input}')
    print(f'FL out: {fl_out}')
    print(f'RO out: {ro_out}')
    print(f'FL arc: {fl_archive}')
    print(f'RO arc: {ro_archive}')

    if args.dry_run:
        return

    processed_dir.mkdir(parents=True, exist_ok=True)
    fl_archive_dir.mkdir(parents=True, exist_ok=True)
    ro_archive_dir.mkdir(parents=True, exist_ok=True)

    # 1) Run Front Load processor with env overrides
    env = os.environ.copy()
    env['FL_INPUT_XLSX'] = str(fl_input)
    env['FL_OUTPUT_XLSX'] = str(fl_out)
    run_py(fl_script, env)

    # 2) Run Roll-Off processor with env overrides
    env = os.environ.copy()
    env['RO_INPUT_XLSX'] = str(ro_input)
    env['RO_OUTPUT_XLSX'] = str(ro_out)
    run_py(ro_script, env)

    # 3) Copy processed files to Archive
    shutil.copy2(fl_out, fl_archive)
    shutil.copy2(ro_out, ro_archive)
    print('Copied processed files to Archive.')

    # 4) Rebuild masters
    run_py(fl_master, os.environ.copy())
    run_py(ro_master, os.environ.copy())

    # 5) Optional: upload to Google Sheets
    if args.creds and (args.sheet_id or args.sheet_url):
        uploader = BASE_DIR / 'upload_to_sheets.py'
        exe = str(SCRIPTS_PY) if SCRIPTS_PY else 'python'
        sheet_arg = args.sheet_id or args.sheet_url
        cmd = [exe, str(uploader), '--period', period, '--creds', str(Path(args.creds)), '--sheet-id', sheet_arg]
        print('Uploading to Google Sheets...')
        subprocess.check_call(cmd)

    print('All done. Masters updated.')


if __name__ == '__main__':
    main()
