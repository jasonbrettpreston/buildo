# CARD LOCAL-DB — ANSWERED 2026-10-30
Operator words (verbatim): "we are working on the local database correct? teh cloud needs to wait"
Answer recorded:
- MB30-PR-3: the dev DB is the LOCAL database at 127.0.0.1:54322 (the local Supabase container). Every McBylaws read-only query and every planned night runs there.
- The CLOUD waits. No McBylaws lane connects to, reads, writes, migrates or deploys to the cloud database (`cloud:pre`, `cloud:*`, remote Supabase, production URLs), until the operator says so in a later card.
