MF-20 red evidence (new files only)
restamp-red-before.txt            surface-validate --check after the contract/schema/decl edits and before report-capture: exit 1 (stale fingerprints, empty new goldens)
restamp-fingerprint-only.txt      the 48 existing goldens differ from 34b5ff12c only in fingerprint.files (rendered_tree, response_fixture, fixture hash byte-identical)
capture-run1/2, capture-twice-identical.txt   report-capture run twice: 0 changed on the second run, files identical, --check 0 stale
ad-slot-red.txt                   the FE-23 lock (ad-slot.golden.test.ts) against the base tree: RED
ad-slot-red-renderer-only.txt     the FE-23 lock against the MF-20 data files with the base renderer: RED
targeting-red.txt                 the FE-22 lock (ad-targeting-keys.logic.test.ts) against the base tree: RED
*-green.txt                       the same locks on the tip
