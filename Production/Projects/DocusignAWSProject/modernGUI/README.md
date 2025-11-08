# Modern DocuSign Service Slip Portal

This document captures the current understanding of the DocuSign + AWS + Google integration and outlines the requirements for the centralized GUI that will live in `modernGUI`.

## Existing Automation (Read-Only Reference)

- **DocuSign**
  - Service agreements are sent via a DocuSign template (ID configured in Lambda env).
  - DocuSign Connect webhooks post envelope status updates to the Lambda.
  - The same Lambda can initiate DocuSign envelopes for service slips via the `/send-service-slip` route.
- **AWS**
  - **API Gateway** exposes the Lambda that powers both the DocuSign Connect webhook and the service-slip initiation API.
  - **Lambda (`aws/docusignHandler/docusign-lambda/index.js`)**
    - Validates DocuSign Connect signatures and API keys.
    - Generates container IDs and stores counters in **DynamoDB**.
    - Pushes and updates rows in the `ServiceSlips` Google Sheet, archives completed slips, and saves PDFs to **S3** (optionally returning signed links).
    - Tracks expected slip counts per contract and triggers the welcome email Lambda when all slips complete.
  - **Lambda (`aws/lambda-welcome-Email/src/lambda_function.py`)**
    - Builds a branded HTML welcome email, attaches PDFs pulled from S3 (if enabled), and sends via **SES**.
  - **SNS** is used to alert the team with contract details when envelopes complete, and optional CC lists can be configured.
- **Google**
  - **Apps Script (`google/gs-service-slips/Code.js`)**
    - Provides admin tools (menus) for the `ServiceSlips` sheet: data validation, protection, dropdowns, and on-edit triggers.
    - Validates rows prior to initiation and allows operators to initiate service slips from Google Sheets.
    - Archives completed rows, grants service account access to protected ranges, and keeps status columns consistent.
  - **Google Sheet** remains the system of record for slip rows; drivers, approvers, and billing actors are tracked there today.

The production automation is working as-is and should remain unchanged. The GUI will layer on top of these components.

## Portal Vision & User Roles

- **Sales Agents**
  - Track contract progress, see where envelopes are pending, launch new service slips.
  - Attach supporting documents (quotes, site photos) when coordinating with dispatch.
- **Clients**
  - View their agreement status, outstanding signatures, scheduled delivery window, drop-site instructions, and key contacts.
  - Sign contracts directly from the portal (deep link into DocuSign).
- **Dispatchers / Operations**
  - Monitor service slip lifecycle from initiation through delivery.
  - Assign drivers, update status (`Driver Out`, `Completed`, etc.), and confirm container IDs.
  - Upload proof-of-delivery photos (stored in S3) and flag exceptions for sales or billing.
- **Drivers (Android tablets)**
  - Receive assigned slips with delivery address, container details, and customer notes.
  - Tap-to-launch navigation (Google Maps intent or in-app iframe) and capture signatures/notes upon completion.
  - Optionally work offline with queued sync when connectivity returns.

## Functional Requirements

- **Unified Status Timeline**
  - Aggregate data from DocuSign (envelope status), Google Sheets (operational status), and DynamoDB/S3 (container IDs, PDFs).
  - Provide per-role views with filters (e.g., driver route for the day, sales rep queue).
- **Action Launcher**
  - Launch DocuSign signing URLs for pending recipients.
  - Initiate new service slips using existing Lambda `/send-service-slip` API.
  - Trigger welcome email resend if a customer needs another copy.
- **Mapping & Routing**
  - Display delivery locations on a map.
  - Provide one-tap navigation for drivers (external Google Maps on Android; fallback instructions on desktop).
- **Document Access**
  - View or download the generated service slip PDF (S3 signed URL).
  - Show welcome email content and attachments history.
- **Notifications**
  - Optional integration with SNS or email for status changes (e.g., slip completed, signature pending > 24 hrs).

## Technical Approach

- **Frontend**
  - Build a responsive web application (React + TanStack Router or Next.js) packaged via Vite for fast iteration.
  - Adopt a component library with enterprise styling flexibility (e.g., MUI or Chakra) and customize with Southern Sanitation branding assets in `modernGUI/logos`.
  - Implement role-based layouts with PWA support so Android tablets can install it to their home screen and cache critical assets offline.
- **Backend Integration**
  - Introduce a thin API Gateway + Lambda (or AppSync) façade that exposes:
    - Read access to slip records (pull from Google Sheets via Sheets API or a cached DynamoDB mirror).
    - Live envelope status lookups through the DocuSign API (JWT flow already present in Lambda).
    - Mutations for status updates, proof uploads, and slip initiation (reuse existing logic where possible).
  - Consider replicating frequently accessed sheet data into DynamoDB to minimize Sheets API latency and enable complex queries.
- **Authentication & Authorization**
  - Leverage AWS Cognito for user pools integrating with Google Workspace SSO for staff and magic-link or invite flows for clients.
  - Enforce per-role permissions on the API layer; the frontend consumes scoped endpoints.
- **Hosting**
  - Deploy the SPA to Amazon S3 + CloudFront or AWS Amplify Hosting.
  - Lambda/API Gateway remains within existing AWS account; integrate with Route 53 for a branded domain (e.g., `portal.southernsanitation.com`).

## Web vs. Native App Discussion

- **Responsive Web App / PWA (Recommended First Step)**
  - Single codebase accessible on desktop, tablets, and mobile browsers.
  - Works well for Android tablets in the trucks; can be installed as a full-screen PWA.
  - Easier maintenance, aligns with current fleet tablets using Chrome, and can be embedded in kiosk/MDM solutions.
- **Native Wrapper Later (Optional)**
  - If offline-first, GPS telemetry, or push notifications become critical, wrap the PWA with Capacitor or React Native for Android/iOS.
  - Requires additional distribution, app store compliance, and dedicated maintenance.

## Next Deliverables

1. Define API schemas (REST/GraphQL) for slip summaries, contract timelines, and driver task lists.
2. Scaffold the frontend in `modernGUI` with environment-driven API clients and mock data.
3. Build role dashboards incrementally, starting with dispatcher operations (highest internal impact).
4. Add DocuSign deep links and Google Maps integrations once routing data flows through the new API layer.

> The remainder of this folder will hold the web app source once the stack is finalized. The README will evolve into developer onboarding docs as the project grows.

## Local Development

```
cd modernGUI
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. All views currently use mocked data (`src/lib/mockData.ts`) until real AWS/DocuSign/Google endpoints are wired in. Update the mock layer to validate UX changes without touching production services.

### Pull Live Sheet Samples

1. Create/locate a Google Cloud service account with Sheets read access and download its JSON key.
2. Share the `ServiceSlips` Google Sheet (and the `Completed` tab) with that service account email.
3. Export environment variables before running the fetch script:
   ```
   set GOOGLE_APPLICATION_CREDENTIALS=path\to\service-account.json
   set SHEET_ID=your_google_sheet_id
   ```
   (Optional) override ranges with `SHEET_RANGE_PENDING` / `SHEET_RANGE_COMPLETED`.
4. Run `npm run fetch:sheets`. This writes `src/data/serviceSlips.sample.json`, and the dashboard will auto-use that snapshot on the next Vite refresh.

### Sales Portal Prototype

- `Sales` tab captures lead pipeline and interactive quote builder for front-load (scheduled) and roll-off (on-demand) services.
- Quotes apply official 2024–2025 pricing, fuel surcharges, and key contract terms extracted from the provided documents.
- Use `Add Lead` to seed prospects, then `Create Quote` to configure service, preview pricing, and export/print the proposal.
