
# Southern Sanitation — TRUX SQL Custom GPT **Playbook**
_Generated: 2025-10-02 17:57 UTC_

This playbook documents **how your Custom GPT was configured**, **how to use it to request read‑only SQL**, and **how to keep the knowledge up to date** when your TRUX schema or business needs change.

---

## 0) One‑minute overview
- You have a Custom GPT named **“Southern Sanitation — TRUX SQL Reporting”**.
- It is grounded with **Databasedoc.pdf** + a set of **CSV dictionaries** exported from your `TRUX_SS_COMP` database (tables, columns, keys, etc.).
- The GPT converts **plain‑English requests** into **SELECT‑only T‑SQL**, using safe join patterns for CM03/CM04/CM05/SM01/CM12/LM02/LM04/MT02/MT00.
- When TRUX updates or your schema changes, you **refresh the CSVs** and re‑upload them to the GPT.

---

## 1) What lives where (assets)
**Knowledge (uploaded into the Custom GPT):**
- `Databasedoc.pdf` — official TRUX schema doc
- `README_TRUX_KnowledgePack.md` — which data files are included and how to use them
- CSVs (one per dataset; recommended names):
  - `Tables_Catalog.csv`
  - `Columns_Catalog.csv`
  - `Keys_Indexes.csv`
  - `ForeignKeys.csv`
  - `Inferred_Relationships.csv`
  - `CodeTables_Candidates.csv`
  - `DomainColumns_Samples.csv`
  - `Programmability_List.csv`
- (Optional) `SS_TRUX_Final_SQL_Library.sql` — curated set of **final** working report queries

**Local folder structure (on your server or OneDrive/SharePoint):**
```
TRUX_KnowledgePack/
  ├── Databasedoc.pdf
  ├── README_TRUX_KnowledgePack.md
  ├── CSV/
  │   ├── Tables_Catalog_YYYY-MM-DD.csv
  │   ├── Columns_Catalog_YYYY-MM-DD.csv
  │   ├── Keys_Indexes_YYYY-MM-DD.csv
  │   ├── ForeignKeys_YYYY-MM-DD.csv
  │   ├── Inferred_Relationships_YYYY-MM-DD.csv
  │   ├── CodeTables_Candidates_YYYY-MM-DD.csv
  │   ├── DomainColumns_Samples_YYYY-MM-DD.csv
  │   └── Programmability_List_YYYY-MM-DD.csv
  └── SQL/
      ├── DB_Wide_Knowledge_Builder.sql
      └── SS_TRUX_Final_SQL_Library.sql
```

> **Tip:** Keep only the **latest** CSVs inside the Custom GPT’s Knowledge to prevent conflicting retrievals.

---

## 2) How the Custom GPT was configured
1. **Name:** `Southern Sanitation — TRUX SQL Reporting`  
2. **Description:** Read‑only SQL report writer for TRUX_SS_COMP (TRUX Haul‑IT).  
3. **Instructions:** a concise policy block (read‑only SQL, join keys, gating with `COL_LENGTH`, size parsing, last‑service pattern, style guide).  
4. **Knowledge:** uploaded PDF + README + CSVs (+ optional Final SQL Library).  
5. **Capabilities:**  
   - **Code Interpreter / Data Analysis:** **ON** (so the GPT can open CSVs you upload in chat).  
   - **Web browsing:** **OFF** (prevents drifting to the internet).  
   - **Image/Canvas:** **OFF**.  
6. **Model:** **GPT‑5 Pro** (or highest available under your plan).  
7. **Memory (ChatGPT Settings → Personalization → Memory):** optional **ON** to remember preferences (e.g., “always output Excel‑friendly column names”). Do **not** store sensitive data in memory.
8. **Saved & Smoke‑tested** with a few starter prompts (see §5).

---

## 3) How to ask for a report (prompt template)
Use this structure in chat to get precise SQL on the **first pass**:

```
Report goal: (plain English)
Primary entities: (customer/site/service; roll-off vs front-load; tickets; misc)
Columns: (list the output columns you want)
Filters: (date range, activity codes, sizes, service types, flags)
Grain: (per ticket / per service / daily / monthly / customer summary)
Sort and limit: (e.g., top 100 by Amount desc)
Output: (SQL only | SQL + sample result preview | CSV)
Notes: (join hints or special assumptions, if any)
```

**Examples**
- “Front‑load 10‑yard services, last serviced before 2024‑12‑31, with customer/site, last service date, and status (closed/suspended).”
- “Roll‑off services with Dump & Return or Dump & Final (CM12 21/22), include WO #, ticket, material, BQty, rate, amount for FY‑2024.”
- “Monthly count of activity codes 01, 02, 03, 07 per customer.”

---

## 4) Guardrails the GPT follows
- **Read‑only SQL only** (SELECT); **no DDL/DML** (no UPDATE/DELETE/CREATE/ALTER/etc.).
- Join keys: **CM03.CM03_CUST** ↔ **CM04(CUST,SITE)** ↔ **CM05(CUST,SITE,SERV)**.
- Activities: **CM12**; link via **SM01.SM01_ACTV**.
- Disposal: **LM02** ↔ **LM04**; misc charges: **MT02** ↔ **MT00**.
- Optional columns are guarded with `COL_LENGTH('schema.table','col') IS NOT NULL`.
- Sizes can be text or numeric: use both `TRY_CONVERT(decimal(10,2), CM05_SIZE)` **OR** `LIKE '%10%'` as needed.
- “Last service date” = `MAX(SM01_DATE)` grouped by `(CUST,SITE,SERV)` with `TRY_CONVERT(int, SM01_SERV)`.

---

## 5) Using & validating results
1. **Generate SQL** in the chat and run in SSMS using a **read‑only login**.  
2. **Quick validation checklist:**
   - Columns exist? (check against `Columns_Catalog.csv`)
   - Joins use CUST/SITE/SERV as expected?
   - Filters (dates, types, sizes) applied as requested?
   - Spot‑check counts/amounts vs a known report.  
3. **Save good queries** into `SQL/SS_TRUX_Final_SQL_Library.sql` and upload the updated file to the GPT Knowledge.

**Common sanity checks**
- Use `SELECT COUNT(*)` per customer/site/service to compare with dashboard totals.  
- For last service logic, compare a few services’ SM01 history.  
- For activity codes, confirm the code list from CM12 aligns with operations.

---

## 6) Refresh procedure (when TRUX updates or quarterly)
**When to refresh:** any TRUX upgrade, schema change, or at least quarterly.

**A. Run the DB‑wide Knowledge Builder (`DB_Wide_Knowledge_Builder.sql`)**  
- Produces the standard result sets (tables, columns, FKs, inferred relationships, etc.).  
- Export each result to a CSV with today’s date (SSMS “Results to File” or PowerShell).

**B. Replace files in the Custom GPT**
1. In the GPT editor → **Knowledge**, **remove** older CSVs.  
2. **Upload** the new dated CSVs + update `README_TRUX_KnowledgePack.md` (dates).  
3. Keep `Databasedoc.pdf` (replace only if you received a new version).

**C. Test**
- Ask 2–3 sanity prompts (see §5). If the GPT suggests non‑existent columns, a file is stale or missing.

---

## 7) Versioning & change control
- **Naming:** append `_YYYY-MM-DD` to each CSV. Keep only the latest inside the GPT.  
- **Change log:** maintain a simple log (example below) in the repo or SharePoint.

```
Date        Change                                   Who
2025-09-04  Initial knowledge pack uploaded          <name>
2025-12-15  TRUX 7.19 patch; refreshed Columns/Keys  <name>
2026-03-31  Quarterly refresh; added new code table  <name>
```

---

## 8) Troubleshooting
- **GPT proposes columns that don’t exist:** Knowledge is stale → refresh CSVs and remove old ones.  
- **GPT can’t “see” your data:** You uploaded a **ZIP** only. Upload **individual CSVs**; ZIPs are “Code Interpreter only” and not fully indexed.  
- **Incorrect syntax near '.' in dynamic examples:** caused by quoting in dynamic SQL; use bracket quoting and single quotes only around final literals.  
- **Strange size filtering:** remember CM05_SIZE may be text; combine numeric parse + `LIKE`.  
- **Web browsing drift:** keep **Web browsing OFF** in the GPT.

---

## 9) Security & privacy
- Only use **read‑only** database accounts.  
- Do not upload sensitive customer PII that is not already present in the dictionaries.  
- If enabling **ChatGPT Memory**, only store **preferences**, not data values or credentials.

---

## 10) Templates

### A. Report request template (paste this when asking the GPT)
```
Report goal:
Primary entities / tables:
Columns:
Filters:
Grain:
Sort / limit:
Output:
Notes:
```

### B. Release checklist for refresh
- [ ] DB_Wide_Knowledge_Builder executed successfully  
- [ ] CSVs exported and named with date  
- [ ] Old CSVs removed from GPT; new ones uploaded  
- [ ] README updated with dates  
- [ ] Smoke tests passed (columns, joins, sample totals)  
- [ ] Final SQL Library updated (if new reports were added)

---

## 11) Conversation starters (ready to click inside the GPT)
- “Front‑load 10‑yard customers closed or suspended before 2024‑12‑31 with last service date.”  
- “Dump & Return / Dump & Final roll‑off activity with ticket, material, tonnage, rate, and amounts for FY‑2024.”  
- “Monthly counts for activity codes 01, 02, 03, 07 by customer.”  
- “Find site‑level closures that still show recent SM01 activity (possible pickup after close).”  

---

## 12) Notes about file expiry
Files uploaded in regular chats can **expire** and do **not** carry over to the Custom GPT automatically. Always keep the original CSVs and PDF in your `TRUX_KnowledgePack` folder so you can re‑upload quickly.
