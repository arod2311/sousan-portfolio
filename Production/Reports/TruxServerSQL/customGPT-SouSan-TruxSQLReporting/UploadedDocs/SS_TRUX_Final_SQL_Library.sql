-- PURPOSE: Front‑Load only; CM05 size ~ 10; customers closed/suspended before 2024‑12‑31.
-- SAFE: SELECT‑only. Works even if some end/close columns don’t exist.

WITH LastService AS (
  SELECT
    SM01_CUST,
    SM01_SITE,
    SM01_SERV_INT = TRY_CONVERT(int, SM01_SERV),
    LastServiceDate = MAX(SM01_DATE)
  FROM dbo.SM01
  GROUP BY SM01_CUST, SM01_SITE, TRY_CONVERT(int, SM01_SERV)
),
CustStatus AS (
  SELECT CM03_CUST,
         StatusType = 'Closed',
         StatusDate = CAST(CM03_CDTE AS date)
  FROM dbo.CM03
  WHERE COL_LENGTH('dbo.CM03','CM03_CDTE') IS NOT NULL AND CM03_CDTE < '2024-12-31'
  UNION ALL
  SELECT CM03_CUST,
         'Suspended',
         CAST(CM03_XDTE AS date)
  FROM dbo.CM03
  WHERE COL_LENGTH('dbo.CM03','CM03_XDTE') IS NOT NULL AND CM03_XDTE < '2024-12-31'
)
SELECT
  c.CM03_CUST           AS ARCode,
  s.CM04_SITE           AS Site,
  TRY_CONVERT(int,sv.CM05_SERV) AS ServiceNo,
  c.CM03_NAME           AS CustomerName,
  -- Address: site if available, else customer-level fragments
  COALESCE(
    NULLIF(LTRIM(RTRIM(s.CM04_ADD1)),''), NULLIF(LTRIM(RTRIM(s.CM04_ADD2)),''),
    NULLIF(LTRIM(RTRIM(c.CM03_ADD1)),''), NULLIF(LTRIM(RTRIM(c.CM03_ADD2)),'')
  )                      AS SiteAddress,
  COALESCE(
    NULLIF(LTRIM(RTRIM(s.CM04_CITY)),''), NULLIF(LTRIM(RTRIM(c.CM03_CITY)),'')
  )                      AS City,
  COALESCE(
    NULLIF(LTRIM(RTRIM(s.CM04_STATE)),''), NULLIF(LTRIM(RTRIM(c.CM03_STAT)),'')
  )                      AS State,
  sv.CM05_TYPE          AS ServiceType,
  sv.CM05_SIZE          AS ContainerSize,
  ls.LastServiceDate,
  cs.StatusType,
  cs.StatusDate
FROM dbo.CM05 sv
JOIN dbo.CM04 s  ON s.CM04_CUST = sv.CM05_CUST AND s.CM04_SITE = sv.CM05_SITE
JOIN dbo.CM03 c  ON c.CM03_CUST = sv.CM05_CUST
LEFT JOIN LastService ls
  ON ls.SM01_CUST = sv.CM05_CUST
 AND ls.SM01_SITE = sv.CM05_SITE
 AND ls.SM01_SERV_INT = TRY_CONVERT(int, sv.CM05_SERV)
LEFT JOIN CustStatus cs
  ON cs.CM03_CUST = sv.CM05_CUST
WHERE sv.CM05_TYPE = 'F1'  -- Front-Load
  AND (
       TRY_CONVERT(decimal(10,2), sv.CM05_SIZE) = 10.00
       OR sv.CM05_SIZE LIKE '%10%'
      )
  AND cs.CM03_CUST IS NOT NULL
ORDER BY c.CM03_CUST, s.CM04_SITE, TRY_CONVERT(int, sv.CM05_SERV);
