# DocuSign AWS Project Overview

## Current Architecture
- **Inbound Security**: The main AWS Lambda verifies DocuSign HMAC secrets and Apps Script API keys before handling Connect webhooks or `/send-service-slip` calls, ensuring both DocuSign and Google-origin traffic is authenticated (`aws/docusignHandler/docusign-lambda/index.js`).
- **Google Sheets Gateway**: Helper utilities append and read rows by header name using a Google service-account JWT so schema changes do not break write operations (`aws/docusignHandler/docusign-lambda/index.js:132`).
- **Slip Creation Flow**: Requests from Google Apps Script expand multi-line payloads into individual DocuSign envelopes, send each slip, and record expected batch counts in DynamoDB (`aws/docusignHandler/docusign-lambda/index.js:558`, `aws/docusignHandler/docusign-lambda/index.js:822`).
- **Contract Completion Handling**: DocuSign Connect events persist PDFs to S3, write contract and slip status snapshots to DynamoDB, update the ServiceSlips sheet with pricing and approval fields, publish SNS alerts, and optionally trigger the welcome-email Lambda (`aws/docusignHandler/docusign-lambda/index.js:349`, `aws/docusignHandler/docusign-lambda/index.js:1314`, `aws/docusignHandler/docusign-lambda/index.js:1553`, `aws/lambda-welcome-Email/src/lambda_function.py:306`).
- **Google Apps Script Automation**: The Apps Script configures validations, throttled on-edit handlers, lookup-based autofill, and secure API calls so the `InitiateSlip` checkbox reliably posts to the Lambda (`google/gs-service-slips/Code.js:84`, `google/gs-service-slips/Code.js:220`, `google/gs-service-slips/Code.js:321`, `google/gs-service-slips/Code.js:455`).

## High-Level Workflow
1. Sales sends DocuSign contracts using approved templates with required envelope fields.
2. When a contract completes, the Lambda writes a fresh row to the ServiceSlips sheet, stores the PDF in S3, and logs metadata in DynamoDB.
3. Dispatch reviews the sheet; Apps Script auto-fills driver, approver, and billing info, gating the `InitiateSlip` action.
4. Checking `InitiateSlip` (or using the manual menu) calls the Lambda, which generates one DocuSign service slip per line item and tracks the expected batch count.
5. As drivers complete slips, DocuSign Connect events update the sheet, append S3 links, keep aggregate state in DynamoDB, push staff SNS notifications, and optionally trigger the SES-powered welcome email Lambda.

## Centralized GUI Vision
- Build a unified work queue that surfaces contract-to-slip-to-welcome milestones for sales, dispatch, and billing, backed by DynamoDB aggregates and sheet data.
- Provide a dispatch operations view that filters by driver or region, shows slip batch progress, and exposes DocuSign envelope and S3 links inline.
- Offer a mobile-friendly driver portal listing assigned, in-progress, and completed slips with the ability to add completion notes or media that flow back into the Lambda.
- Deliver management dashboards summarizing SLA aging, backlog, revenue-impacting fields, and alert statuses to keep stakeholders aligned.

## Suggested Next Steps
1. **Data Modeling**: Decide which Sheet fields need to be mirrored in DynamoDB or another datastore so the GUI can query reliable, normalized data without brittle spreadsheet reads.
2. **API Surface**: Define REST or GraphQL endpoints (for example, new API Gateway routes fronting the existing Lambda) that expose aggregated contract and slip data with role-aware filtering.
3. **Authentication & Authorization**: Choose an identity provider (Azure AD, Okta, AWS Cognito) and outline role-based access policies for sales, dispatch, billing, and drivers.
4. **UI Prototype**: Spin up a lightweight prototype (React/Next.js with Amplify, or a low-code option if preferred) that consumes staged data to validate navigation, filtering, and user experience.
5. **Operational Tooling**: Plan alerting and monitoring for the new GUI (CloudWatch alarms, SNS, or third-party tools) and align deployment pipelines with existing Lambda/App Script release processes.
