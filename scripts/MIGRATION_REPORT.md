# Migration Report: Prod -> Neon (schema `facture`)

## Execution Date
2026-03-13

## Source Database
- Host: `ep-frosty-bonus-ahq78f05.c-3.us-east-1.aws.neon.tech`
- Database: `neondb`
- Schema: `public`

## Target Database
- Host: `ep-flat-wave-ai8s9lqh-pooler.c-4.us-east-1.aws.neon.tech`
- Database: `neondb`
- Schema: `facture` (created during migration)

## Steps Executed

1. **Schema creation**: `CREATE SCHEMA IF NOT EXISTS facture` on target
2. **DDL export**: `pg_dump --schema-only --schema=public` from source (413 lines)
3. **DDL transform**: All `public.*` references rewritten to `facture.*`
4. **DDL import**: Applied to target — all tables, indexes, constraints created
5. **Data export**: `pg_dump --data-only --schema=public` from source (1063 lines)
6. **Data transform**: All `public.*` references rewritten to `facture.*`
7. **Data import**: Applied to target via COPY commands

## Verification Results

| Table                   | Source | Target | Match |
|-------------------------|--------|--------|-------|
| user_tokens             | 3      | 3      | OK    |
| suppliers               | 559    | 559    | OK    |
| projects                | 30     | 30     | OK    |
| invoices                | 261    | 261    | OK    |
| payments                | 75     | 75     | OK    |
| categories              | 15     | 15     | OK    |
| admin_config            | 1      | 1      | OK    |
| payment_methods_mapping | 8      | 8      | OK    |

## Additional Checks

- `public.users` in target: **3 rows (untouched)**
- `search_path` via connection string: **facture (confirmed)**
- Latest invoice date in target: **2026-03-13** (matches source)
- API verification: 559 suppliers, 138 Fatou invoices, 75 Michael invoices, 30 projects

## Connection Strategy

- Neon pooler endpoint does not support `search_path` in startup parameters
- Solution: Use unpooled endpoint (`-pooler` removed from hostname) with `options=-csearch_path%3Dfacture`
- Both `server/db.ts` and `drizzle.config.ts` implement this via `buildConnectionString()`

## Result
**MIGRATION COMPLETE: ALL CHECKS PASSED**
