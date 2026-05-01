#!/usr/bin/env bash
# Enforces Lesson-routing footer on commits fixing CRITICAL/HIGH findings.
# Per docs/specs/00-architecture/05_knowledge_operating_model.md §4–5: every
# commit body that names a CRITICAL or HIGH finding must declare where the
# lesson goes (test / lint / spec / lessons / memory / commit-only:reason).
#
# This hook is the enforcement layer that prevents the spec from rotting into
# advisory-only guidance (see Spec 05 §7 anti-patterns).

MSG_FILE="$1"

# Same exemptions as validate-commit-msg.sh
FIRST_LINE=$(grep -vE '^(#|$)' "$MSG_FILE" | head -1)
if echo "$FIRST_LINE" | grep -qE '^(Merge|Revert) '; then exit 0; fi
if echo "$FIRST_LINE" | grep -qE '^[vV]?[0-9]+\.[0-9]+\.[0-9]+'; then exit 0; fi

# Read full message excluding comment lines
BODY=$(grep -v '^#' "$MSG_FILE")

# Trigger only when commit body explicitly labels a CRITICAL or HIGH finding.
# Match the section-header convention used in commits 7dfe1a1, 2452bad
# ("CRITICAL —", "HIGH —", "CRITICAL:", "HIGH:") rather than any incidental
# occurrence of the word, to avoid false positives on prose mentions.
if echo "$BODY" | grep -qE '^(CRITICAL|HIGH)( |:|—|-)'; then
  if ! echo "$BODY" | grep -qE '^Lesson-routing:'; then
    echo ""
    echo "ERROR: Commit references CRITICAL or HIGH severity but lacks"
    echo "       'Lesson-routing:' footer."
    echo ""
    echo "  Per docs/specs/00-architecture/05_knowledge_operating_model.md §4–5,"
    echo "  every commit fixing a CRITICAL or HIGH finding must declare a"
    echo "  destination for the lesson. Add a footer like:"
    echo ""
    echo "    Lesson-routing: test:src/tests/foo.infra.test.ts"
    echo "    Lesson-routing: spec:96_mobile_subscription"
    echo "    Lesson-routing: lessons (added entry to tasks/lessons.md)"
    echo "    Lesson-routing: lint (eslint rule no-bare-stripe-customer-id)"
    echo "    Lesson-routing: commit-only (one-off — non-recurring)"
    echo ""
    echo "  See Spec 05 §2 for the five durable destinations."
    echo ""
    exit 1
  fi
fi

exit 0
