MF-38 red evidence (single image per option, operator O-1 b 2026-11-11)
locks-red-base.txt               the nine MF-38 lock files (new selector lock; FE-06/FE-28/FE-29 honest, FE-24 render, FE-07 parity, FE-05 no-maths,
                                 FE-13 surface-validate, report-golden-parity, report-view and report-preview ui) against the BASE code with the test
                                 edits and the two new response fixtures: RED (9 of 9 files, 65 tests).
planted-mutations-red.txt        seven defects planted one at a time in the real sources (selector null coercion, the frontage edge, a threshold
                                 literal, the caption default, a url key, one image per option in the gate checks, the picture dropped from the
                                 component); each named lock RED; the sources restored byte for byte after each run.
surface-validate-plant-red.txt   a blank alt planted in images_present.web.json: surface-validate --check exit 1 (SV-STATUS schema line, SV-PARITY).
restamp-fingerprint-only.txt     the 56 existing goldens differ from the base only in fingerprint.files (report-tree.schema.json, report-v2.decl.json);
                                 rendered_tree, response_fixture and the fixture hash are byte-identical (D-7).
capture-twice.txt                report-capture written, then --check: 0 stale over 64 goldens.
