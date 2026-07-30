# Deferred scraper tests — parked, not deleted

These test modules exercise code that arrives at a later rung of the WF2 restore
(`.cursor/wf2_deep_scrapes_restore.md`). They are parked with a non-`.py` suffix so
pytest does not collect them, and kept in-tree so the rung that introduces their
subject restores them rather than rewriting them from memory.

| File | Rung that restores it | Subject |
|------|----------------------|---------|
| `test_scraper_launch_attach.py.L1` | **L1** | attach-mode launch: `launch_chrome`, `wait_for_devtools`, `find_free_port`, `read_devtools_active_port`, process-group teardown |
| `test_scraper_egress.py.L2` | **L2** | proxied-egress tripwire: `verify_proxied_egress`, `host_egress_ip`, `_extract_ip`, the TTL cache, `log_browser_targets` |

**Restoring one:** rename back to `.py`, then reconcile it against the code the rung
actually shipped — the earlier versions assumed an unconditional attach path and a
relay-only proxy mechanism, both of which are now mode-gated.

They were parked rather than deleted because deleting a test is how a behaviour
silently stops being guarded, which is the failure class this whole WF exists to undo.
