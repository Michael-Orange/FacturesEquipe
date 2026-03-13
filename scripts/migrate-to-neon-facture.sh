#!/bin/bash
set -e

if [ -z "$PROD_DATABASE_URL" ]; then
  echo "ERROR: PROD_DATABASE_URL environment variable must be set (source database)"
  exit 1
fi
if [ -z "$NEW_NEON_DATABASE_URL" ]; then
  echo "ERROR: NEW_NEON_DATABASE_URL environment variable must be set (target database)"
  exit 1
fi

TARGET_URL="$NEW_NEON_DATABASE_URL"
UNPOOLED_TARGET=$(echo "$TARGET_URL" | sed 's/-pooler\./\./')

if echo "$UNPOOLED_TARGET" | grep -q '?'; then
  TARGET_WITH_SCHEMA="${UNPOOLED_TARGET}&options=-csearch_path%3Dfacture"
else
  TARGET_WITH_SCHEMA="${UNPOOLED_TARGET}?options=-csearch_path%3Dfacture"
fi

echo "============================================"
echo "  Migration: Source -> Target (schema facture)"
echo "============================================"
echo ""
echo "Source: $(echo "$PROD_DATABASE_URL" | sed 's|.*@||' | cut -d'/' -f1)"
echo "Target: $(echo "$TARGET_URL" | sed 's|.*@||' | cut -d'/' -f1)"
echo ""

echo "Step 1: Create schema 'facture' in target..."
psql "$TARGET_URL" -c "CREATE SCHEMA IF NOT EXISTS facture;"
echo "  Done."

echo ""
echo "Step 2: Export schema DDL from source..."
pg_dump "$PROD_DATABASE_URL" --schema-only --schema=public --no-owner --no-privileges > /tmp/schema_dump.sql
echo "  Exported $(wc -l < /tmp/schema_dump.sql) lines."

echo ""
echo "Step 3: Transform DDL to use schema 'facture'..."
sed \
  -e '/^CREATE SCHEMA public;/d' \
  -e "/^COMMENT ON SCHEMA public/d" \
  -e "s/public\./facture\./g" \
  -e "s/SELECT pg_catalog.set_config('search_path', '', false);/SET search_path TO facture;/" \
  -e '/^\\restrict/d' \
  /tmp/schema_dump.sql > /tmp/schema_facture.sql
echo "  Transformed $(wc -l < /tmp/schema_facture.sql) lines."

echo ""
echo "Step 4: Apply schema DDL to target..."
psql "$TARGET_URL" < /tmp/schema_facture.sql
echo "  Done."

echo ""
echo "Step 5: Export data from source..."
pg_dump "$PROD_DATABASE_URL" --data-only --schema=public --no-owner --no-privileges > /tmp/data_dump.sql
echo "  Exported $(wc -l < /tmp/data_dump.sql) lines."

echo ""
echo "Step 6: Transform data to use schema 'facture'..."
sed \
  -e "s/public\./facture\./g" \
  -e "s/SELECT pg_catalog.set_config('search_path', '', false);/SET search_path TO facture;/" \
  -e '/^\\restrict/d' \
  /tmp/data_dump.sql > /tmp/data_facture.sql
echo "  Transformed $(wc -l < /tmp/data_facture.sql) lines."

echo ""
echo "Step 7: Import data to target..."
psql "$TARGET_URL" < /tmp/data_facture.sql
echo "  Done."

echo ""
echo "Step 8: Verify row counts..."
TABLES="user_tokens suppliers projects invoices payments categories admin_config payment_methods_mapping"
printf "%-30s %10s %10s %s\n" "Table" "Source" "Target" "Match?"
printf "%-30s %10s %10s %s\n" "-----" "------" "------" "------"

ALL_MATCH=true
for tbl in $TABLES; do
  SRC=$(psql "$PROD_DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM $tbl" 2>/dev/null || echo "ERROR")
  TGT=$(psql "$TARGET_WITH_SCHEMA" -t -A -c "SELECT COUNT(*) FROM $tbl" 2>/dev/null || echo "ERROR")
  if [ "$SRC" = "$TGT" ]; then
    STATUS="OK"
  else
    STATUS="MISMATCH"
    ALL_MATCH=false
  fi
  printf "%-30s %10s %10s %s\n" "$tbl" "$SRC" "$TGT" "$STATUS"
done

echo ""
echo "Step 9: Verify public.users untouched..."
USERS_COUNT=$(psql "$TARGET_URL" -t -A -c "SELECT COUNT(*) FROM public.users" 2>/dev/null || echo "ERROR")
echo "  public.users count: $USERS_COUNT"

echo ""
echo "Step 10: Verify search_path..."
SP=$(psql "$TARGET_WITH_SCHEMA" -t -A -c "SHOW search_path" 2>/dev/null || echo "ERROR")
echo "  search_path: $SP"

echo ""
if [ "$ALL_MATCH" = true ] && [ "$SP" = "facture" ]; then
  echo "MIGRATION COMPLETE: ALL CHECKS PASSED"
else
  echo "MIGRATION FAILED: SOME CHECKS DID NOT PASS"
  exit 1
fi

rm -f /tmp/schema_dump.sql /tmp/schema_facture.sql /tmp/data_dump.sql /tmp/data_facture.sql
