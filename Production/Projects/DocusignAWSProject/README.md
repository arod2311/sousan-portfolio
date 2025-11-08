# DocusignAWSProject

DocuSign + AWS + Google Sheets integration for Service Agreements and Service Slips.

This README documents the current production flow, environment configuration, Google Sheet schema, Apps Script usage, and how to test end‑to‑end.

## Quick Start

Run after a restart to prep your environment and open the project in VS Code:

```powershell
powershell -ExecutionPolicy Bypass -File .\sousan\Production\Projects\DocusignAWSProject\scripts\bootstrap.ps1 -AwsProfile <your-profile> -AwsRegion <region> -GoogleCredsPath <path-to-service-account.json>
```

- Edit defaults inside the script or pass parameters as shown above.
- The script sets `AWS_PROFILE`, `AWS_DEFAULT_REGION`, and optionally `GOOGLE_APPLICATION_CREDENTIALS`, then cd’s to the project and opens VS Code.

### Parameters
- `-AwsProfile`: Your AWS named profile (e.g., `default`, `work-sso`).
- `-AwsRegion`: Default AWS region (e.g., `us-east-1`).
- `-GoogleCredsPath`: Absolute or relative path to your Google service account JSON. Leave empty to skip.

## DocuSign Templates (Current)

- Front‑Load Contract – New Contract
- Front‑Load Contract – New Contract – In Person
- Roll‑Off Contract – New Contract
- Roll‑Off Contract – New Contract – In Person

All contracts use identical roles/signing order:
1. SS Sales Rep
2. New Client (or New Client – In Person with Host)
3. Generate Trux Account Number
4. Trux input – Account # Verification
5. New Client (Receives a copy)

In‑person only: set Host Name = Southern Sanitation, Host Email = ss.docu@southernsanitation.com.

Required envelope custom fields on all contracts:
- EnvelopeType = ServiceAgreements
- ContractType = FrontLoad | RollOff

Allowed Template IDs (ENV, comma separated):
- 1eda2cbe-0073-4340-9bfe-d3aac29591b7
- 1d3f0ae3-0fc8-4fe9-b774-55c5d0f08736
- b0cbe65c-21dd-4979-a8a1-63cfc5d017dc
- 3ed29197-71b7-499e-ac70-09627413f701

DocuSign Connect accepts either the allow‑list or EnvelopeType to process envelopes.

## Lambda Environment (Key Vars)

- CONTRACT_ALLOWED_TEMPLATE_IDS: CSV of the 4 template IDs above
- CONTRACT_CLIENT_ROLE: New Client
- DOCUSIGN_*: Integration key, account/user IDs, base URLs, private key secret
- SHEET_ID, SHEET_NAME: Google sheet target (SHEET_NAME=ServiceSlips)
- STORE_CONTRACT_PDF=true: Save PDFs to S3 (contracts and/or slips)
- WELCOME_LAMBDA_ARN: Invoked after all slips complete (optional)
- WELCOME_ATTACHMENTS=false: Attach contract/slips to welcome email (optional)

Behavior changes (current):
- ContractType is always sent on service slip envelopes (required by template). If not provided, inferred: 15/20/30/40yd → RollOff, else FrontLoad.
- Service slip supports size checkboxes: 2/4/6/8/10/15/20/30/40yd and OnCall.
- New text tabs supported on slip: ContactName, ServicePhone.
- When a contract completes, the handler writes to the sheet by header name and includes ContractType and pricing fields when present.
- When a slip completes, the handler archives the row and updates SlipLink/DocS3Key (and ContactName/ServicePhone if provided).

## Google Sheet Schema (Current)

Header names are matched by name (not position). Recent changes:
- Removed: ServiceRep
- Moved: StaffApproverName → AH, StaffApproverEmail → AI, SlipLink → end (AM)
- Added: ContractType, ContactName, ServicePhone, ServiceChargePerMonth, LandfillCharge, ExtraPickUpCharge, FuelSurcharge, DeliveryFee

Column A should always be populated (e.g., ContractEnvelopeId) for reliable row append.

Completed tab: if schema changes, delete/clear its header row; the next archive will recreate headers to match.

## Apps Script (ServiceSlips)

Path: `sousan/Production/Projects/DocusignAWSProject/google/gs-service-slips`

- Triggers: run menu ServiceSlip → Install/repair onEdit trigger
- Setup: menu ServiceSlip → Run setup (dropdowns + protection)
- Driver auto‑fill: Selecting DeliveryDriverName auto‑fills DeliveryDriverEmail from Lookups (C:Name, D:Email)
- Approver auto‑fill: StaffApproverName/Email from Lookups (E:Name, F:Email)
- Debounce: Only the InitiateSlip checkbox is debounced (8s window); normal edits are immediate

Push GAS via clasp:
```powershell
cd sousan/Production/Projects/DocusignAWSProject/google/gs-service-slips
npm i -g @google/clasp
clasp login
clasp status
clasp push -f
```

## Test Plan

1) Contract completion → Sheet row
   - Send each contract template (in‑person/remote OK)
   - Expect: new row with Status=Pending Slip, ContractType set, pricing columns if present

2) Initiate service slip from sheet
   - Fill required fields (ContractEnvelopeId, ClientName/Email, ServiceAddress, ContainerSize, Frequency, StaffApprover, DeliveryDriver)
   - Set Status=Ready for Service Slip, then check InitiateSlip
   - Expect: DocuSign envelope with size checkbox (incl. 15/20/30/40yd) and OnCall when Frequency=OnCall

3) Slip completion → Archive + Welcome
   - Expect: SlipLink/DocS3Key updated, row moved to Completed, optional Welcome Lambda invoked

CloudWatch logs exported under `aws/CloudWatch` (combined-*.log). Look for:
- “Prepared slips count: …”
- “DocuSign resolved base path …”
- “Saved PDF to S3 key …”
- “Archived & removed … row(s) …”

## Diagrams

- See docs/flow-diagrams.md for Mermaid diagrams:
  - Technical sequence with functions/services
  - Staff overview of the process

## GitHub Setup

### Benefits
- Backup and versioning; easier collaboration via PRs/reviews.
- CI/CD with GitHub Actions (lint/test/deploy).
- Issue tracking, branch protections, and audit history.

### SSH Setup (recommended)
1) Generate a key:
   ```sh
   ssh-keygen -t ed25519 -C "you@example.com"
   ```
2) Start the agent and add the key (Windows OpenSSH):
   ```powershell
   Get-Service ssh-agent | Set-Service -StartupType Automatic; Start-Service ssh-agent
   ssh-add $env:USERPROFILE\.ssh\id_ed25519
   ```
3) Copy your public key and add it to GitHub → Settings → SSH and GPG keys:
   ```powershell
   type $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
4) Point your repo to GitHub and push:
   ```sh
   git remote add origin git@github.com:<user>/<repo>.git
   git push -u origin main
   ```

### HTTPS + Personal Access Token (alternative)
1) Create a token (fine-grained or classic) in GitHub → Settings → Developer settings → Tokens.
2) Set the remote and push:
   ```sh
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
   Use your PAT as the password when prompted.

### Branching & Protections
- Develop in short-lived branches: `feature/<topic>`.
- Protect `main`: require PR + review; add status checks if/when you set up Actions.

## Which Git Setup Should I Choose?

You have two options for where the Git repository “root” lives. Pick the one that matches how you plan to organize work.

### Option A — Initialize Git in `DocusignAWSProject`
“Initialize Git in DocusignAWSProject, add the .gitignore, and prepare the remote” means:
- Make this folder its own standalone Git repository.
- Add a `.gitignore` (see `PROJECT_NOTES.md` for a template) so you don’t commit build artifacts or secrets.
- Connect this repo directly to GitHub and push.

When to choose A:
- This project is self-contained (AWS + Google code for DocuSign only).
- You want clean, focused history and per-project permissions.

How to do it:
```powershell
cd C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Projects\DocusignAWSProject
# Add a .gitignore (use template in PROJECT_NOTES.md)
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin <ssh-or-https-remote>
git push -u origin main
```

Pros:
- Clean separation from other work; independent lifecycle.
- Easier permissions and CI specific to this project.

Tradeoffs:
- More repos to manage if you split every project.

### Option B — Integrate into a Higher-Level Repo
“Integrate these notes and scripts into your existing higher-level repo instead” means:
- Keep this folder as part of a larger, already-initialized repo (e.g., `repoProjects` or `sousan`).
- Commit and push changes from the top-level repo.
- Maintain a single remote and CI pipeline for multiple related projects.

When to choose B:
- You prefer one repository for a suite of related work.
- Cross-cutting changes often span multiple subprojects.

How to do it (example if `sousan` is the repo root):
```powershell
cd C:\Users\arodriguez\Documents\repoProjects\sousan
git status  # ensure this is already a git repo; if not, run git init here instead
# Add/adjust .gitignore at the top level (include the ignores from PROJECT_NOTES.md)
git add .
git commit -m "chore(docusign): add README and bootstrap script"
git push
```

Pros:
- Single place to push/pull, issues, and CI settings.
- Easier to coordinate changes across subprojects.

Tradeoffs:
- History and permissions are broader; less isolation.

## Recommendations & Safety
- Decide on Option A or B based on how you collaborate and deploy.
- Never commit secrets (Google/AWS credentials). Use environment variables, AWS SSO, OIDC for GitHub Actions, or AWS Secrets Manager.
- If you choose Option A later, you can still split this folder out into its own repo via `git subtree` or `git filter-repo`.

## Troubleshooting
- Execution policy: if PowerShell blocks the script, use `-ExecutionPolicy Bypass` (as shown) or sign your script.
- Verify CLI auth: run `aws sts get-caller-identity` to confirm your AWS profile; for Google, ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid JSON.
- Check remotes: `git remote -v` to confirm your origin URL.
- DocuSign errors: “A required envelope custom field is missing … ContractType” → verify ContractType is present on the sheet or let the Lambda infer via ContainerSize.
- Driver email not auto‑filling: ensure Lookups sheet has C: Driver Name, D: Driver Email and rerun setup.

## After Restart
- Run the bootstrap:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\sousan\Production\Projects\DocusignAWSProject\scripts\bootstrap.ps1 -AwsProfile lambda-admin -AwsRegion us-east-1 -GoogleCredsPath <path-to-service-account.json>
  ```
- SSH quick check (if using SSH):
  - `ssh -T git@github.com` should greet your username.
  - `git remote -v` should show `git@github.com:<user>/<repo>.git`.
  - `git fetch` / `git push` to verify sync.
- If you use ssh-agent and it isn't running:
  - Start it once as admin: `Set-Service ssh-agent -StartupType Automatic; Start-Service ssh-agent`
  - Then in your user session: `ssh-add $env:USERPROFILE\.ssh\id_ed25519`
  - With `~/.ssh/config` set to `IdentityFile ~/.ssh/id_ed25519`, you typically won't be prompted for the wrong key.
