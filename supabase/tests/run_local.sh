#!/usr/bin/env bash
# Runs all migrations against a throwaway LOCAL Postgres database with a minimal
# Supabase stand-in (auth.users, auth.uid(), roles, storage tables), then checks
# row-level security as several users and a signed-out visitor.
# Never point this at the real Supabase project.
# Usage: PGHOST=/tmp PGPORT=5432 PGUSER=postgres ./supabase/tests/run_local.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=geniusai_rls_test
M=../migrations
run() { PGOPTIONS="-c client_min_messages=warning" psql -d $DB -q -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -q -c "drop database if exists $DB" -c "create database $DB" 2>/dev/null
psql -d $DB -q -v ON_ERROR_STOP=0 -f supabase_stub.sql 2>&1 | grep -v "already exists" || true
run -f $M/202610220001_geniusai_core_schema.sql
run -f legacy.sql
run -f $M/202610220002_security_and_onboarding_fixes.sql
echo "== core tables";  PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f rls_tests.sql 2>&1     | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610220003_private_storage.sql
echo "== storage";      PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f storage_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610220004_auth_onboarding.sql
run -f $M/202610220004b_remove_earlier_setup.sql
echo "== onboarding"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f onboarding_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230005_ai_jobs_and_credits.sql
echo "== credits & jobs"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f credits_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230006_preferences_and_profile_hardening.sql
echo "== preferences & profile"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f preferences_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230007_more_file_types.sql
echo "== file types"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f filetypes_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230008_payments.sql
echo "== payments"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f payments_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230009_refunds.sql
echo "== refunds"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f refunds_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
run -f $M/202610230010_agreements.sql
echo "== agreements"; PGOPTIONS= psql -d $DB -q -v ON_ERROR_STOP=1 -t -f agreements_tests.sql 2>&1 | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^ ]* //'
