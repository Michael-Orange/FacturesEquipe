#!/bin/bash
set -e

PROD_URL="postgresql://neondb_owner:npg_dixM3G6npQok@ep-frosty-bonus-ahq78f05.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"
TARGET_URL="$NEW_NEON_DATABASE_URL"
UNPOOLED_TARGET=$(echo "$TARGET_URL" | sed 's/-pooler\./\./')
TARGET_WITH_SCHEMA="${UNPOOLED_TARGET}&options=-csearch_path%3Dfacture"

echo "============================================"
echo "  Migration Verification: Source vs Target"
echo "============================================"
echo ""
echo "Source: ep-frosty-bonus (real prod)"
echo "Target: ep-flat-wave (schema: facture)"
echo ""

TABLES="user_tokens suppliers projects invoices payments categories admin_config payment_methods_mapping"

echo "--- Row counts comparison ---"
printf "%-30s %10s %10s %s\n" "Table" "Source" "Target" "Match?"
printf "%-30s %10s %10s %s\n" "-----" "------" "------" "------"

ALL_MATCH=true
for tbl in $TABLES; do
  SRC=$(psql "$PROD_URL" -t -A -c "SELECT COUNT(*) FROM $tbl" 2>/dev/null || echo "ERROR")
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
echo "--- public.users in target (should be untouched) ---"
USERS_COUNT=$(psql "$TARGET_URL" -t -A -c "SELECT COUNT(*) FROM public.users" 2>/dev/null || echo "ERROR")
echo "public.users count: $USERS_COUNT"

echo ""
echo "--- search_path verification ---"
SP=$(psql "$TARGET_WITH_SCHEMA" -t -A -c "SHOW search_path" 2>/dev/null || echo "ERROR")
echo "search_path: $SP"

echo ""
if [ "$ALL_MATCH" = true ] && [ "$SP" = "facture" ]; then
  echo "RESULT: ALL CHECKS PASSED"
else
  echo "RESULT: SOME CHECKS FAILED"
  exit 1
fi
