Project: Docusign + AWS + Google

Location
- Root: C:\Users\arodriguez\Documents\repoProjects\sousan\Production\Projects\DocusignAWSProject

Structure
- aws: AWS-related code and ops
  - CloudWatch: Log export targets / notes
  - docusignHandler:
    - docusign-lambda: Main Lambda source (index.js) and deployable zip
    - docusignlambdanote: Notes and legacy references
  - lambda-welcome-Email: Welcome email Lambda (source and zip artifact)
- google: Google Apps Script and service configs
  - gs-service-slips: Current GAS deployment code
  - other JSONs: Service account and connectivity configs (do NOT commit secrets)

Current Behavior (2025-09)
- Contracts allowed by TemplateID list or EnvelopeType=ServiceAgreements
- Client role: `New Client`
- ContractType custom field is required by templates; Lambda sets it on service slips (infers RollOff when size is 15/20/30/40yd else FrontLoad)
- Service slip tabs supported: ContactName, ServicePhone; size checkboxes 2/4/6/8/10/15/20/30/40yd; OnCall checkbox when Frequency="OnCall"
- Google Sheet writes by header name; removed ServiceRep; moved StaffApproverName/Email and SlipLink; added pricing fields
- Apps Script auto‑fills driver and approver name/email pairs from Lookups; debounce applies only to InitiateSlip

Daily/Restart Procedure (Windows)
1) Open PowerShell as your user (non-admin is fine).
2) Run scripts\bootstrap.ps1 to set env and jump into the project:
   - It sets AWS profile (edit as needed).
   - It optionally sets GOOGLE_APPLICATION_CREDENTIALS if you provide a path.
   - It can open VS Code to this folder.

AWS Lambda: Quick Deploy Options
- Manual (current):
  1) Update code under aws\docusignHandler\docusign-lambda\index.js (or welcome email lambda source).
  2) Create zip of the handler code (exclude node_modules if Lambda layer or not needed).
  3) Upload the zip to the Lambda function via AWS Console or CLI.
- CLI example (zip + update):
  - From the function folder: powershell -c "Compress-Archive -Path * -DestinationPath function.zip -Force"
  - aws lambda update-function-code --function-name <your-func-name> --zip-file fileb://function.zip --profile <aws_profile> --region <region>

Google Apps Script (GAS)
- Keep the authoritative code in google\gs-service-slips.
- For multi-file projects or external editors, use clasp (Google Apps Script CLI) to push/pull between GAS and local code.
- Push via clasp:
  ```powershell
  cd sousan/Production/Projects/DocusignAWSProject/google/gs-service-slips
  npm i -g @google/clasp
  clasp login
  clasp status
  clasp push -f
  ```

Recommended .gitignore (add at project root if/when you init git here)
```
# Node
node_modules/
npm-debug.log*

# Build artifacts
*.zip
dist/
build/

# Env/Secrets
.env
*.pem
*.p12
*.pfx
*.key
*.crt
*.cer
*.der
*.jks
*.keystore
credentials*/
secrets*/
**/google/**/service-account*.json
**/google/**/credentials*.json

# OS/Editor
.DS_Store
Thumbs.db
.vscode/
```

GitHub Setup (recommended)
Option A — SSH (recommended for convenience)
1) Generate key: ssh-keygen -t ed25519 -C "your_email@example.com"
2) Start agent and add key: eval $(ssh-agent) then ssh-add ~/.ssh/id_ed25519 (Windows: use Pageant or OpenSSH agent)
3) Copy public key: type ~/.ssh/id_ed25519.pub (Windows: type $env:USERPROFILE\.ssh\id_ed25519.pub)
4) Add key in GitHub: Settings -> SSH and GPG keys -> New SSH key
5) Set remote in repo: git remote add origin git@github.com:<user>/<repo>.git
6) Push: git push -u origin main

Option B — HTTPS + Personal Access Token (PAT)
1) Create a PAT: GitHub -> Settings -> Developer settings -> Tokens (classic) or Fine-grained tokens
2) Set remote: git remote add origin https://github.com/<user>/<repo>.git
3) Push and use PAT as password when prompted: git push -u origin main

Branching & Protections
- Default branch: main
- Create feature branches per task: feature/<short-desc>
- Enable branch protection on main: require PRs, at least 1 review, and status checks if you add CI

CI/CD (later, optional)
- GitHub Actions: lint/test on PR
- Add AWS deploy job (e.g., serverless, SAM, or zip+update via CLI) with OIDC federation to avoid storing AWS long-lived keys

Secrets Hygiene
- Never commit service account JSON or AWS credentials.
- Use environment variables, GitHub Actions OIDC, or AWS SSM/Secrets Manager.

Next Steps (suggested)
- Confirm which folder is your git root (this folder vs higher).
- If this folder will be a repo, run: git init, add .gitignore, initial commit, connect to GitHub.
- If higher-level repo already exists, add this file path to that repo and ensure .gitignore is updated there.

DocuSign/Data Labels Reference
- Contract tab labels used by the handler:
  - ClientName, ClientEmail, BusinessName
  - ServiceAddress, BillingAddress, BillingAddress2
  - ARCode/ARNumber (either)
  - Quantity/ContainerSize/Frequency/ServiceDays for up to 3 lines (with “2”/“3” suffixes)
  - Day checkboxes: SerD-M, SerD-T, SerD-W, SerD-Thr, SerD-F, SerD-S (and 2/3 variants)
- Slip tab labels:
  - Date, Start, Freq1..Freq6, size checkboxes 2yd..40yd, OnCall
  - Container ID labels accepted: ContainerNumber, "Container ID #", "Container ID", ContainerID
  - Optional: ContactName, ServicePhone, ContractType | ClientType | "Client Type"

Troubleshooting
- “DocuSign send failed: A required envelope custom field is missing. ContractType …”
  - Ensure ContractType present on sheet, or rely on Lambda inference (size → FrontLoad/RollOff)
- Driver email not auto‑filling on sheet
  - Verify Lookups sheet columns: C=Driver Name, D=Driver Email; run setup
- Duplicates after retries
  - Each InitiateSlip click sends new envelopes; cancel extras in DocuSign
