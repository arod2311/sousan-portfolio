/*  DB-WIDE KNOWLEDGE BUILDER (READ-ONLY)
    SAFE: Uses only SELECTs and #temp tables. No writes.
*/

SET NOCOUNT ON;
USE TRUX_SS_COMP;

--------------------------------------------------------------------------------
-- 1) Master table catalog + row counts + create/modify dates
--------------------------------------------------------------------------------
;WITH p AS (
  SELECT object_id, row_count = SUM(row_count)
  FROM sys.dm_db_partition_stats
  WHERE index_id IN (0,1)
  GROUP BY object_id
)
SELECT
  s.name      AS [schema],
  t.name      AS [table],
  p.row_count AS [approx_rows],
  o.create_date,
  o.modify_date
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.objects o ON o.object_id = t.object_id
LEFT JOIN p        ON p.object_id = t.object_id
ORDER BY p.row_count DESC, s.name, t.name;

--------------------------------------------------------------------------------
-- 2) Full column catalog
--------------------------------------------------------------------------------
SELECT
  [schema]      = s.name,
  [table]       = t.name,
  [column]      = c.name,
  [type]        = ty.name,
  c.max_length,
  c.is_nullable,
  c.column_id,
  [computed]    = c.is_computed,
  [default]     = CASE WHEN dc.object_id IS NULL THEN NULL ELSE OBJECT_NAME(dc.object_id) END,
  [collation]   = c.collation_name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types   ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id
ORDER BY s.name, t.name, c.column_id;

--------------------------------------------------------------------------------
-- 3) Primary keys, unique constraints
--------------------------------------------------------------------------------
SELECT
  [schema]    = s.name,
  [table]     = t.name,
  kc.type_desc AS key_type,
  kc.name      AS key_name,
  col_name     = c.name,
  ic.key_ordinal
FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
ORDER BY s.name, t.name, kc.type_desc, ic.key_ordinal;

--------------------------------------------------------------------------------
-- 4) All indexes (including nonclustered; included columns)
--------------------------------------------------------------------------------
SELECT
  [schema] = s.name,
  [table]  = t.name,
  i.name   AS index_name,
  i.type_desc,
  key_columns = STUFF((
      SELECT ','+c.name
      FROM sys.index_columns ic2
      JOIN sys.columns c ON c.object_id = ic2.object_id AND c.column_id = ic2.column_id
      WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id AND ic2.is_included_column = 0
      ORDER BY ic2.key_ordinal
      FOR XML PATH(''), TYPE).value('.','nvarchar(max)'),1,1,''),
  included_columns = STUFF((
      SELECT ','+c.name
      FROM sys.index_columns ic2
      JOIN sys.columns c ON c.object_id = ic2.object_id AND c.column_id = ic2.column_id
      WHERE ic2.object_id = i.object_id AND ic2.index_id = i.index_id AND ic2.is_included_column = 1
      ORDER BY c.column_id
      FOR XML PATH(''), TYPE).value('.','nvarchar(max)'),1,1,'')
FROM sys.indexes i
JOIN sys.tables t  ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
WHERE i.is_hypothetical = 0 AND i.[type] IN (1,2)
ORDER BY s.name, t.name, i.name;

--------------------------------------------------------------------------------
-- 5) Declared foreign keys
--------------------------------------------------------------------------------
SELECT
  fk_name     = fk.name,
  parent_tbl  = QUOTENAME(SCHEMA_NAME(pt.schema_id))+'.'+QUOTENAME(pt.name),
  parent_col  = pc.name,
  ref_tbl     = QUOTENAME(SCHEMA_NAME(rt.schema_id))+'.'+QUOTENAME(rt.name),
  ref_col     = rc.name
FROM sys.foreign_keys fk
JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
ORDER BY parent_tbl, fk.name;

--------------------------------------------------------------------------------
-- 6) Inferred relationships (name/type/length match across tables)
--------------------------------------------------------------------------------
;WITH cols AS (
  SELECT s.name AS schema_name, t.name AS table_name, c.name AS column_name, ty.name AS type_name, c.max_length
  FROM sys.tables t
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  JOIN sys.columns c ON c.object_id = t.object_id
  JOIN sys.types ty  ON ty.user_type_id = c.user_type_id
)
SELECT TOP (1000)
  parent = QUOTENAME(a.schema_name)+'.'+QUOTENAME(a.table_name)+'.'+QUOTENAME(a.column_name),
  ref    = QUOTENAME(b.schema_name)+'.'+QUOTENAME(b.table_name)+'.'+QUOTENAME(b.column_name),
  reason = 'Same name & type/length'
FROM cols a
JOIN cols b ON a.column_name = b.column_name
           AND a.type_name  = b.type_name
           AND a.max_length = b.max_length
           AND NOT (a.schema_name=b.schema_name AND a.table_name=b.table_name)
WHERE a.column_name LIKE '%CUST%' OR a.column_name LIKE '%SITE%' OR a.column_name LIKE '%SERV%' OR a.column_name LIKE '%ID%'
ORDER BY a.table_name, a.column_name;

--------------------------------------------------------------------------------
-- 7) Detect small "code tables" (likely Code/Desc pairs)
--------------------------------------------------------------------------------
;WITH p AS (
  SELECT object_id, row_count = SUM(row_count)
  FROM sys.dm_db_partition_stats
  WHERE index_id IN (0,1)
  GROUP BY object_id
)
SELECT TOP (200)
  s.name AS [schema], t.name AS [table], p.row_count,
  has_code = SUM(CASE WHEN c.name LIKE '%CODE%' OR c.name LIKE 'CODE' THEN 1 ELSE 0 END),
  has_desc = SUM(CASE WHEN c.name LIKE '%DESC%' OR c.name LIKE 'DESC' THEN 1 ELSE 0 END)
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
LEFT JOIN p ON p.object_id = t.object_id
GROUP BY s.name, t.name, p.row_count
HAVING p.row_count IS NOT NULL AND p.row_count BETWEEN 1 AND 2000
ORDER BY p.row_count;

--------------------------------------------------------------------------------
-- 8) Domain columns (TYPE/STATUS/CODE/etc.) and sample values (TOP 15)
--    FIXED: CAST(...) AS NVARCHAR(MAX) inside STRING_AGG and correct quoting
--------------------------------------------------------------------------------
IF OBJECT_ID('tempdb..#domaincols') IS NOT NULL DROP TABLE #domaincols;
CREATE TABLE #domaincols(schema_name sysname, table_name sysname, column_name sysname);

INSERT INTO #domaincols(schema_name, table_name, column_name)
SELECT s.name, t.name, c.name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types   ty ON ty.user_type_id = c.user_type_id
WHERE ty.name IN ('varchar','nvarchar','char','nchar')
  AND (c.name LIKE '%TYPE%' OR c.name LIKE '%STATUS%' OR c.name LIKE '%CODE%' OR c.name LIKE '%CLASS%' OR c.name LIKE '%UNIT%' OR c.name LIKE '%UOM%' OR c.name LIKE '%MATL%' OR c.name LIKE '%ECOD%' OR c.name LIKE '%SUSREA%');

DECLARE @sql2 nvarchar(max) = N'';

SELECT @sql2 =
  STRING_AGG(
    CAST(
N'SELECT TOP (15)
  ' + N'''' + QUOTENAME(d.schema_name) + N'.' + QUOTENAME(d.table_name) + N'.' + QUOTENAME(d.column_name) + N'''' + N' AS column_qualified,
  ' + QUOTENAME(d.column_name) + N' AS sample_value
FROM ' + QUOTENAME(d.schema_name) + N'.' + QUOTENAME(d.table_name) + N'
WHERE ' + QUOTENAME(d.column_name) + N' IS NOT NULL
GROUP BY ' + QUOTENAME(d.column_name) + N'
ORDER BY COUNT(*) DESC;'
      AS nvarchar(max))
  , CHAR(10)
  )
FROM #domaincols d;

IF LEN(@sql2) > 0
  EXEC sp_executesql @sql2;
-- ELSE: no domain-like columns found

--------------------------------------------------------------------------------
-- 9) Views, procedures, functions
--------------------------------------------------------------------------------
SELECT 'VIEW' AS obj_type, s.name AS [schema], v.name AS [object_name]
FROM sys.views v JOIN sys.schemas s ON s.schema_id = v.schema_id
UNION ALL
SELECT 'PROC', s.name, p.name FROM sys.procedures p JOIN sys.schemas s ON s.schema_id = p.schema_id
UNION ALL
SELECT 'FUNC', s.name, o.name FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
WHERE o.type IN ('FN','IF','TF')
ORDER BY obj_type, [schema], [object_name];
