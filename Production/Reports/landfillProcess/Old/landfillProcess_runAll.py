import subprocess
import os
import sys

# Define the correct Python interpreter from the virtual environment
python_executable = os.path.join(os.getcwd(), "Scripts", "python.exe")

# Define the new script directory
scripts_directory = os.path.join(os.getcwd(), "pyScripts")

# Define script paths correctly
script1 = os.path.join(scripts_directory, "landfillTicketsTruxCleanUp.py")
script2 = os.path.join(scripts_directory, "comparisonTicketsWSummary.py")

# Ensure paths exist
if not os.path.exists(script1):
    print(f"\n❌ Error: Script not found: {script1}")
    sys.exit(1)

if not os.path.exists(script2):
    print(f"\n❌ Error: Script not found: {script2}")
    sys.exit(1)

try:
    print(f"Using Python interpreter: {python_executable}")

    print("\nRunning landfillTicketsTruxCleanUp.py...")
    subprocess.run([python_executable, script1], check=True)
    print("\n✅ landfillTicketsTruxCleanUp.py completed successfully.\n")

    print("Running comparisonTicketsWSummary.py...")
    subprocess.run([python_executable, script2], check=True)
    print("\n✅ comparisonTicketsWSummary.py completed successfully.\n")

except subprocess.CalledProcessError as e:
    print(f"\n❌ Error: Script execution failed: {e}")
except FileNotFoundError as e:
    print(f"\n❌ Error: File not found: {e}")
