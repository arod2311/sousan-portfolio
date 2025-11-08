/*Below is a clean, copy‑paste set of scripts that are read‑only and will capture the exact SQL your TRUX/Crystal report runs.

Before you run A)

On the SQL Server machine, create a folder C:\XE (right‑click → New Folder).

Make sure the SQL Server service account can write to C:\XE.

Use an account that is sysadmin (or at minimum has ALTER ANY EVENT SESSION + VIEW SERVER STATE).

A) Create + start the listener (run this whole block)

/* Read-only Extended Events to capture SQL hitting TRUX_SS_COMP */

/*-------------------------------------------------START OF LISTENER QUERY----------------------------------------------------------------------------------------------*/

-- 0) (Optional) check your privileges: 1 = sysadmin, 0 = not
SELECT IsSysAdmin = IS_SRVROLEMEMBER('sysadmin');

-- 1) Drop any prior session of the same name
IF EXISTS (SELECT 1 FROM sys.server_event_sessions WHERE name = N'TruxReportTrace')
    DROP EVENT SESSION [TruxReportTrace] ON SERVER;
GO

-- 2) Build the CREATE statement with the database_id as a literal
DECLARE @dbid int = DB_ID(N'TRUX_SS_COMP');        -- <-- change DB name if needed
DECLARE @sql  nvarchar(max) = N'
CREATE EVENT SESSION [TruxReportTrace] ON SERVER
ADD EVENT sqlserver.rpc_completed
(
  ACTION
  (
    sqlserver.client_app_name,
    sqlserver.client_hostname,
    sqlserver.database_name,
    sqlserver.session_id,
    sqlserver.username,
    sqlserver.sql_text
  )
  WHERE (sqlserver.database_id = ' + CAST(@dbid AS nvarchar(11)) + N')
),
ADD EVENT sqlserver.sql_batch_completed
(
  ACTION
  (
    sqlserver.client_app_name,
    sqlserver.client_hostname,
    sqlserver.database_name,
    sqlserver.session_id,
    sqlserver.username,
    sqlserver.sql_text
  )
  WHERE (sqlserver.database_id = ' + CAST(@dbid AS nvarchar(11)) + N')
)
ADD TARGET package0.event_file
(
  SET filename = N''C:\XE\TruxReportTrace.xel'',
      max_file_size = (200),
      max_rollover_files = (5)
);';

EXEC (@sql);   -- create the session
GO

-- 3) Start it
ALTER EVENT SESSION [TruxReportTrace] ON SERVER STATE = START;
GO


/* Now run the TRUX “Customer Activity Audit Report” in the app for any period (even a single day is enough). Let it finish.

B) -----------------------------------------------------Stop the listener----------------------------------- */

ALTER EVENT SESSION [TruxReportTrace] ON SERVER STATE = STOP;
GO

/*
C) Read the captured SQL (copy/paste as‑is)


/* --------------------------------------------------Pull back the SQL text captured by the listener--------------------------------------------------------- */
WITH src AS
(
  SELECT CAST(event_data AS xml) AS x
  FROM sys.fn_xe_file_target_read_file('C:\XE\TruxReportTrace*.xel', NULL, NULL, NULL)
)
SELECT
  x.value('(event/@timestamp)[1]','datetime2') AS utc_time,
  x.value('(event/@name)[1]','sysname')       AS event_name,
  x.value('(event/action[@name="client_app_name"]/value)[1]','nvarchar(4000)') AS app,
  x.value('(event/action[@name="client_hostname"]/value)[1]','nvarchar(4000)') AS host,
  x.value('(event/action[@name="username"]/value)[1]','nvarchar(4000)')        AS [user],
  x.value('(event/action[@name="database_name"]/value)[1]','sysname')           AS dbname,
  COALESCE(
    x.value('(event/data[@name="batch_text"]/value)[1]','nvarchar(max)'),
    x.value('(event/data[@name="statement"]/value)[1]','nvarchar(max)'),
    x.value('(event/action[@name="sql_text"]/value)[1]','nvarchar(max)')
  ) AS sql_text
FROM src
WHERE COALESCE(
        x.value('(event/data[@name="batch_text"]/value)[1]','nvarchar(max)'),
        x.value('(event/data[@name="statement"]/value)[1]','nvarchar(max)'),
        x.value('(event/action[@name="sql_text"]/value)[1]','nvarchar(max)')
      ) IS NOT NULL
ORDER BY utc_time DESC;

/*
Tips while reviewing:

Use the grid filter (right‑click column header → Filter) to search for table names like RO01, LN02, LF100, TICKET, MATERIAL, etc.

If the app runs stored procedures, you’ll see EXEC dbo.SomeProc @p1=.... Click into the sql_text to view the full call (and then open the proc in SSMS to see the underlying query).

D) (Optional) Clean up when you’re done */

IF EXISTS (SELECT 1 FROM sys.server_event_sessions WHERE name = N'TruxReportTrace')
    DROP EVENT SESSION [TruxReportTrace] ON SERVER;
GO
-- Then delete the C:\XE\TruxReportTrace*.xel files from Windows if desired.

/*
Why your previous attempt failed

DB_ID('TRUX_SS_COMP') inside the XE WHERE caused the parser error — XE predicates must use literals, not functions or variables. The script above calculates the database_id first and injects it into the CREATE statement via dynamic SQL.

The follow‑on message “Cannot alter the event session … it does not exist or you do not have permission” happened because the CREATE failed, so ALTER … START had nothing to start.

If you still hit a permissions error

Run this check: */

SELECT IsSysAdmin = IS_SRVROLEMEMBER('sysadmin');

/*
If it returns 1, you’re good.

If it returns 0, connect with a sysadmin login or have a sysadmin run:
*/

GRANT ALTER ANY EVENT SESSION TO [SOUSAN\Administrator];
GRANT VIEW SERVER STATE       TO [SOUSAN\Administrator];

/*
(Replace the principal with the login you’re using if different.)

Once you capture a run of Customer Activity Audit Report, paste me the relevant sql_text (or just the table names it joins for Miscellaneous and Disposal). I’ll lock the export query to exactly those tables/columns so you can pull Closed/Active/Suspended customers from inception in one shot._*/