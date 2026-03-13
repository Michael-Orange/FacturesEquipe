#!/bin/bash
set -e

if [ -z "$PROD_DATABASE_URL" ]; then
  echo "ERROR: PROD_DATABASE_URL environment variable must be set"
  exit 1
fi
if [ -z "$NEW_NEON_DATABASE_URL" ]; then
  echo "ERROR: NEW_NEON_DATABASE_URL environment variable must be set"
  exit 1
fi

PROD_URL="$PROD_DATABASE_URL"
TARGET_URL="$NEW_NEON_DATABASE_URL"
UNPOOLED_TARGET=$(echo "$TARGET_URL" | sed 's/-pooler\./\./')

if echo "$UNPOOLED_TARGET" | grep -q '?'; then
  TARGET_WITH_SCHEMA="${UNPOOLED_TARGET}&options=-csearch_path%3Dfacture"
else
  TARGET_WITH_SCHEMA="${UNPOOLED_TARGET}?options=-csearch_path%3Dfacture"
fi

echo "============================================"
echo "  Migration Verification: Source vs Target"
echo "============================================"
echo ""
echo "Source: $(echo "$PROD_URL" | sed 's|.*@||' | cut -d'/' -f1)"
echo "Target: $(echo "$TARGET_URL" | sed 's|.*@||' | cut -d'/' -f1) (schema: facture)"
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
