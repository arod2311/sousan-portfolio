# Flow Diagrams

This page contains two Mermaid diagrams:
- A technical sequence with component/function details
- A staff-friendly overview of the process

## Technical (detailed)

```mermaid
sequenceDiagram
  autonumber
  actor Staff as Sheet User (Dispatcher)
  participant GAS as Apps Script (Code.js)
  participant API as API Gateway
  participant LH as Lambda DocuSignHandler (aws/docusignHandler/docusign-lambda/index.js)
  participant DS as DocuSign (Templates)
  participant Conn as DocuSign Connect
  participant S3 as S3
  participant DDB as DynamoDB
  participant Sheets as Google Sheets API
  participant SNS as SNS (optional)
  participant WL as Welcome Email Lambda (aws/lambda-welcome-Email)

  rect rgba(200,200,255,0.18)
    Staff->>GAS: Edit row; check InitiateSlip
    note right of GAS: onEditHandler() • validateRequiredFields() • buildPayloadFromRow()
    GAS->>API: POST /send-service-slip (API key + optional HMAC)
    API->>LH: Route: send-service-slip
    note right of LH: appendRowByHeaders() • expandServiceSlipRequests()
    loop For each slip
      LH->>DS: createEnvelope(templateRoles, tabs, customFields)
      note right of DS: Tabs include: ARCode, ClientName/Email, ContactName, ServicePhone,\nsize checkboxes (2–10/15/20/30/40yd), Freq1..6, OnCall
      DS-->>LH: envelopeId
    end
    LH->>DDB: setSlipExpected(contractId, count)
    LH-->>GAS: { success, createdCount, envelopeIds }
  end

  rect rgba(200,255,200,0.18)
    Conn->>API: POST /docusign-connect (XML)
    API->>LH: Route: docusign-connect
    note right of LH: verifyDocusignHmac() • collectRecipientsInfo() • pickTabs() • contractAllowedCheck()\n(Template IDs allow‑list OR EnvelopeType=ServiceAgreements OR role match)
    alt Contract Completed
      LH->>S3: putObject (Contract PDF) [if STORE_CONTRACT_PDF]
      LH->>DDB: put({ ContractEnvelopeId, Status })
      LH->>Sheets: appendRowByHeaders(values incl ContractType, quantities, addresses,...)
      LH->>SNS: publish 'Contract Completed' (optional)
    else Service Slip Completed
      LH->>S3: putObject (Slip PDF)
      LH->>DDB: upsertSlipAgg(contractId, item, s3Key)
      LH->>Sheets: archiveCompletedRowByContract() → move to Completed
      opt Final slip in batch AND welcome not sent
        LH->>WL: Invoke with { client, items, documents? }
        note right of LH: documents include slips (+contract if WELCOME_ATTACHMENTS=true)
      end
    end
  end
```

Key functions referenced:
- Apps Script: `onEditHandler`, `validateRequiredFields`, `buildPayloadFromRow`, `autoFillDriverPairOnEdit`, `autoFillApproverPairOnEdit`, `maybeArchiveRow`
- DocuSignHandler Lambda: `sendServiceSlipWithTemplate`, `expandServiceSlipRequests`, `appendRowByHeaders`, `contractAllowedCheck`, `archiveCompletedRowByContract`, `upsertSlipAgg`, `getSlipAgg`
- Welcome Email Lambda: `normalize_items`, `build_items_table`, `build_html` (SES send)

## Staff Overview (simple)

```mermaid
flowchart TD
  A[Sales Rep sends contract\n(New Client)] --> B[Client signs\n(remote or in-person)]
  B --> C[CS Team generates\nnew Trux Account #]
  C --> D[Verifier checks\naccount & services]
  D --> E[System records the contract\nAdds a row to the ServiceSlips sheet\nStatus: Pending Slip]
  E --> F[Dispatcher chooses driver\nSets Status: Ready for Service Slip\nClicks 'Initiate Slip']
  F --> G[Driver receives email\nCompletes & signs Service Slip]
  G --> H[System saves PDF to S3\nMoves row to 'Completed' tab]
  H --> I[Welcome Email sent to client\n(Portal links, FAQs, Contact)]
```

Notes for staff:
- In‑person signing uses a host at Southern Sanitation; steps remain the same.
- For roll‑off containers, sizes 15/20/30/40 yards and On‑Call service are supported.
- Dispatcher: make sure driver name & email are set before clicking Initiate Slip.

