# Step 22: assert_lifecycle_phase_distribution
**Chain:** permits
**Validated:** 2026-05-23
**HEAD commit:** 56ebce1
**Risk class:** cqa
**Per-step agent:** Calculations
**Final status:** INVESTIGATE
**Notes:** §11.5 invariants; Phase E.4/E.5

## Pre-run state
- Output table counts: {}
- Last 3 runs: [
  {
    "id": 3318,
    "status": "completed",
    "completed_at": "2026-05-20T20:49:57.049Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T20:49:50.059Z",
    "duration_ms": "6990"
  },
  {
    "id": 3272,
    "status": "completed",
    "completed_at": "2026-05-20T02:16:06.902Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T02:16:02.358Z",
    "duration_ms": "4544"
  },
  {
    "id": 3240,
    "status": "completed",
    "completed_at": "2026-05-20T01:52:50.172Z",
    "verdict": "WARN",
    "started_at": "2026-05-20T01:52:42.799Z",
    "duration_ms": "7373"
  }
]

## Execution
- Command: `node scripts/quality/assert-lifecycle-phase-distribution.js`
- Exit code: 0
- Duration: 7912ms
- New `pipeline_runs.id`: 3318

## Post-run state
- Output table counts: {}
- New run: {"id":3318,"status":"completed","verdict":"WARN","duration_ms":"6990","records_total":281198,"records_new":0,"records_updated":0}

### audit_table.rows
```json
[
  {
    "value": 8,
    "metric": "lifecycle_seq_01_count",
    "status": "PASS",
    "threshold": "7..33"
  },
  {
    "value": 268,
    "metric": "lifecycle_seq_02_count",
    "status": "PASS",
    "threshold": "195..383"
  },
  {
    "value": 1,
    "metric": "lifecycle_seq_03_count",
    "status": "WARN",
    "threshold": "37..91"
  },
  {
    "value": 27,
    "metric": "lifecycle_seq_04_count",
    "status": "WARN",
    "threshold": "51..117"
  },
  {
    "value": 76,
    "metric": "lifecycle_seq_05_count",
    "status": "WARN",
    "threshold": "82..174"
  },
  {
    "value": 249,
    "metric": "lifecycle_seq_06_count",
    "status": "PASS",
    "threshold": "221..433"
  },
  {
    "value": 1,
    "metric": "lifecycle_seq_07_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 289,
    "metric": "lifecycle_seq_08_count",
    "status": "PASS",
    "threshold": "204..400"
  },
  {
    "value": 321,
    "metric": "lifecycle_seq_09_count",
    "status": "PASS",
    "threshold": "189..371"
  },
  {
    "value": 270,
    "metric": "lifecycle_seq_10_count",
    "status": "PASS",
    "threshold": "228..444"
  },
  {
    "value": 352,
    "metric": "lifecycle_seq_11_count",
    "status": "WARN",
    "threshold": "172..340"
  },
  {
    "value": 643,
    "metric": "lifecycle_seq_12_count",
    "status": "PASS",
    "threshold": "387..741"
  },
  {
    "value": 527,
    "metric": "lifecycle_seq_13_count",
    "status": "WARN",
    "threshold": "41..97"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_14_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 24,
    "metric": "lifecycle_seq_15_count",
    "status": "PASS",
    "threshold": "16..52"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_16_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 108,
    "metric": "lifecycle_seq_17_count",
    "status": "WARN",
    "threshold": "242..472"
  },
  {
    "value": 78,
    "metric": "lifecycle_seq_18_count",
    "status": "WARN",
    "threshold": "152..304"
  },
  {
    "value": 905,
    "metric": "lifecycle_seq_19_count",
    "status": "PASS",
    "threshold": "632..1196"
  },
  {
    "value": 1,
    "metric": "lifecycle_seq_20_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 8,
    "metric": "lifecycle_seq_21_count",
    "status": "PASS",
    "threshold": "5..31"
  },
  {
    "value": 28950,
    "metric": "lifecycle_seq_22_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_23_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_24_count",
    "status": "WARN",
    "threshold": "152..304"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_25_count",
    "status": "WARN",
    "threshold": "325..625"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_26_count",
    "status": "WARN",
    "threshold": "363..695"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_27_count",
    "status": "WARN",
    "threshold": "16..52"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_28_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_29_count",
    "status": "WARN",
    "threshold": "64..140"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_30_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_31_count",
    "status": "WARN",
    "threshold": "21..59"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_32_count",
    "status": "WARN",
    "threshold": "39..95"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_33_count",
    "status": "WARN",
    "threshold": "1..23"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_34_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_35_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_36_count",
    "status": "WARN",
    "threshold": "81..173"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_37_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_38_count",
    "status": "WARN",
    "threshold": "2..26"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_39_count",
    "status": "WARN",
    "threshold": "305..587"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_40_count",
    "status": "WARN",
    "threshold": "23..63"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_41_count",
    "status": "WARN",
    "threshold": "16..50"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_42_count",
    "status": "WARN",
    "threshold": "163..323"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_43_count",
    "status": "WARN",
    "threshold": "2..24"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_44_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_45_count",
    "status": "WARN",
    "threshold": "7..33"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_46_count",
    "status": "WARN",
    "threshold": "2..26"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_47_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_48_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_49_count",
    "status": "WARN",
    "threshold": "2..24"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_50_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_51_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_52_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_53_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_54_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_55_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_56_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_57_count",
    "status": "WARN",
    "threshold": "1..23"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_58_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_59_count",
    "status": "WARN",
    "threshold": "618..1168"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_60_count",
    "status": "WARN",
    "threshold": "621..1175"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_61_count",
    "status": "WARN",
    "threshold": "637..1205"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_62_count",
    "status": "WARN",
    "threshold": "637..1203"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_63_count",
    "status": "WARN",
    "threshold": "623..1177"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_64_count",
    "status": "WARN",
    "threshold": "622..1176"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_65_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_66_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_67_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_68_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_69_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_70_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_71_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_72_count",
    "status": "WARN",
    "threshold": "639..1209"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_73_count",
    "status": "WARN",
    "threshold": "618..1168"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_74_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_75_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_76_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_77_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_78_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_79_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_80_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_81_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_82_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_83_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_84_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_85_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_86_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_87_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_88_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_89_count",
    "status": "WARN",
    "threshold": "18..56"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_90_count",
    "status": "WARN",
    "threshold": "15..49"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_91_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_92_count",
    "status": "WARN",
    "threshold": "341..655"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_93_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_94_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_95_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_96_count",
    "status": "INFO",
    "threshold": "no upper bound (catalog rows_count=0)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_97_count",
    "status": "WARN",
    "threshold": "4..28"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_98_count",
    "status": "WARN",
    "threshold": "1..23"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_99_count",
    "status": "WARN",
    "threshold": "670..1266"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_100_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_101_count",
    "status": "WARN",
    "threshold": "85..179"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_102_count",
    "status": "WARN",
    "threshold": "34..84"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_103_count",
    "status": "WARN",
    "threshold": "6..32"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_104_count",
    "status": "WARN",
    "threshold": "1..23"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_105_count",
    "status": "WARN",
    "threshold": "1..23"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_106_count",
    "status": "WARN",
    "threshold": "12..44"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_107_count",
    "status": "WARN",
    "threshold": "11..41"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_108_count",
    "status": "WARN",
    "threshold": "4..30"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_109_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_110_count",
    "status": "PASS",
    "threshold": "0..22"
  },
  {
    "value": 8,
    "metric": "unclassified_count",
    "status": "PASS",
    "threshold": "<= 100"
  },
  {
    "value": 42,
    "metric": "cross_check_stalled",
    "status": "WARN",
    "threshold": "< 1000 (WARN), >= 1000 (FAIL)"
  },
  {
    "value": 583,
    "metric": "cross_check_active_inspection",
    "status": "WARN",
    "threshold": "< 800 (WARN), >= 800 (FAIL)"
  },
  {
    "value": 195,
    "metric": "cross_check_permit_issued",
    "status": "WARN",
    "threshold": "< 500 (WARN), >= 500 (FAIL)"
  },
  {
    "value": 110,
    "metric": "seq_bands_total",
    "status": "PASS",
    "threshold": "== 110 expected (dynamic from universal_stream_catalog; WARN on partial mig 148 apply)"
  },
  {
    "value": 62,
    "metric": "seq_bands_passing",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 33,
    "metric": "seq_bands_null_catalog_count",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 89,
    "metric": "seq_bands_warn",
    "status": "WARN",
    "threshold": "== 0 PASS, > 0 WARN (E.4 first-deploy posture; E.5 tightens to FAIL)"
  },
  {
    "value": 0,
    "metric": "seq_bands_failing",
    "status": "PASS",
    "threshold": "== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)"
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_band_promote_to_fail_band_violation",
    "status": "INFO",
    "threshold": "0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `band_violation` kind. See Spec 84 §3.4."
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_band_promote_to_fail_no_band_configured",
    "status": "INFO",
    "threshold": "0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `no_band_configured` kind (operator config gap). See Spec 84 §3.4."
  },
  {
    "value": 0,
    "metric": "lifecycle_seq_band_promote_to_fail_expected_data_missing",
    "status": "INFO",
    "threshold": "0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `expected_data_missing` kind (data deletion / classifier-skip signal). See Spec 84 §3.4."
  },
  {
    "value": 246912,
    "metric": "seq_unclassified_count",
    "status": "WARN",
    "threshold": "<= 5000 (WARN above)"
  },
  {
    "value": 41261.63,
    "metric": "sys_velocity_rows_sec",
    "status": "INFO",
    "threshold": null
  },
  {
    "value": 6815,
    "metric": "sys_duration_ms",
    "status": "INFO",
    "threshold": null
  }
]
```

### records_meta (minus audit_table)
```json
{
  "pipeline_meta": {
    "reads": {
      "permits": [
        "lifecycle_phase",
        "lifecycle_seq",
        "lifecycle_stalled",
        "enriched_status",
        "status"
      ],
      "coa_applications": [
        "lifecycle_phase",
        "lifecycle_seq",
        "linked_permit_num",
        "decision"
      ],
      "universal_stream_catalog": [
        "seq",
        "rows_count"
      ]
    },
    "writes": {}
  },
  "seq_violations": [
    {
      "seq": 3,
      "kind": "band_violation",
      "actual": 1,
      "posture": "warn",
      "band_max": 91,
      "band_min": 37
    },
    {
      "seq": 4,
      "kind": "band_violation",
      "actual": 27,
      "posture": "warn",
      "band_max": 117,
      "band_min": 51
    },
    {
      "seq": 5,
      "kind": "band_violation",
      "actual": 76,
      "posture": "warn",
      "band_max": 174,
      "band_min": 82
    },
    {
      "seq": 11,
      "kind": "band_violation",
      "actual": 352,
      "posture": "warn",
      "band_max": 340,
      "band_min": 172
    },
    {
      "seq": 13,
      "kind": "band_violation",
      "actual": 527,
      "posture": "warn",
      "band_max": 97,
      "band_min": 41
    },
    {
      "seq": 17,
      "kind": "band_violation",
      "actual": 108,
      "posture": "warn",
      "band_max": 472,
      "band_min": 242
    },
    {
      "seq": 18,
      "kind": "band_violation",
      "actual": 78,
      "posture": "warn",
      "band_max": 304,
      "band_min": 152
    },
    {
      "seq": 24,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 304,
      "band_min": 152
    },
    {
      "seq": 25,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 625,
      "band_min": 325
    },
    {
      "seq": 26,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 695,
      "band_min": 363
    },
    {
      "seq": 27,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 52,
      "band_min": 16
    },
    {
      "seq": 29,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 140,
      "band_min": 64
    },
    {
      "seq": 31,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 59,
      "band_min": 21
    },
    {
      "seq": 32,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 95,
      "band_min": 39
    },
    {
      "seq": 33,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 23,
      "band_min": 1
    },
    {
      "seq": 36,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 173,
      "band_min": 81
    },
    {
      "seq": 38,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 26,
      "band_min": 2
    },
    {
      "seq": 39,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 587,
      "band_min": 305
    },
    {
      "seq": 40,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 63,
      "band_min": 23
    },
    {
      "seq": 41,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 50,
      "band_min": 16
    },
    {
      "seq": 42,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 323,
      "band_min": 163
    },
    {
      "seq": 43,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 24,
      "band_min": 2
    },
    {
      "seq": 45,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 33,
      "band_min": 7
    },
    {
      "seq": 46,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 26,
      "band_min": 2
    },
    {
      "seq": 49,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 24,
      "band_min": 2
    },
    {
      "seq": 57,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 23,
      "band_min": 1
    },
    {
      "seq": 59,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1168,
      "band_min": 618
    },
    {
      "seq": 60,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1175,
      "band_min": 621
    },
    {
      "seq": 61,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1205,
      "band_min": 637
    },
    {
      "seq": 62,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1203,
      "band_min": 637
    },
    {
      "seq": 63,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1177,
      "band_min": 623
    },
    {
      "seq": 64,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1176,
      "band_min": 622
    },
    {
      "seq": 72,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1209,
      "band_min": 639
    },
    {
      "seq": 73,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1168,
      "band_min": 618
    },
    {
      "seq": 89,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 56,
      "band_min": 18
    },
    {
      "seq": 90,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 49,
      "band_min": 15
    },
    {
      "seq": 92,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 655,
      "band_min": 341
    },
    {
      "seq": 97,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 28,
      "band_min": 4
    },
    {
      "seq": 98,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 23,
      "band_min": 1
    },
    {
      "seq": 99,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 1266,
      "band_min": 670
    },
    {
      "seq": 101,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 179,
      "band_min": 85
    },
    {
      "seq": 102,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 84,
      "band_min": 34
    },
    {
      "seq": 103,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 32,
      "band_min": 6
    },
    {
      "seq": 104,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 23,
      "band_min": 1
    },
    {
      "seq": 105,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 23,
      "band_min": 1
    },
    {
      "seq": 106,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 44,
      "band_min": 12
    },
    {
      "seq": 107,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 41,
      "band_min": 11
    },
    {
      "seq": 108,
      "kind": "band_violation",
      "actual": 0,
      "posture": "warn",
      "band_max": 30,
      "band_min": 4
    },
    {
      "seq": 24,
      "kind": "expected_data_missing",
      "actual": 0,
      "posture": "warn",
      "band_max": 304,
      "band_min": 152
    },
    {
      "seq": 25,
      "kind": "expected_data_missing",
      "actual": 0,
      "posture": "warn",
      "band_max": 625,
      "band_min": 325
    }
  ],
  "seq_distribution": {
    "1": 8,
    "2": 268,
    "3": 1,
    "4": 27,
    "5": 76,
    "6": 249,
    "7": 1,
    "8": 289,
    "9": 321,
    "10": 270,
    "11": 352,
    "12": 643,
    "13": 527,
    "15": 24,
    "17": 108,
    "18": 78,
    "19": 905,
    "20": 1,
    "21": 8,
    "22": 28950
  },
  "phase_distribution": {
    "O1": 2902,
    "O2": 2828,
    "O3": 42382,
    "P1": 276,
    "P2": 964,
    "P3": 2349,
    "P4": 4053,
    "P5": 1475,
    "P6": 2930,
    "P8": 18938,
    "P9": 881,
    "P10": 612,
    "P11": 782,
    "P12": 86,
    "P13": 984,
    "P14": 481,
    "P15": 224,
    "P16": 186,
    "P17": 188,
    "P18": 106307,
    "P19": 8055,
    "P20": 42412,
    "P7a": 1988,
    "P7b": 2675,
    "P7c": 33156,
    "P7d": 1896,
    "null": 1188,
    "P9-P17": 4424
  },
  "unclassified_count": 8,
  "seq_violations_truncated_count": 39
}
```

### stdout tail
```
{"level":"INFO","tag":"[assert-lifecycle-phase-distribution]","msg":"Loaded 33 trade configs from control panel"}
{"level":"INFO","tag":"[assert-lifecycle-phase-distribution]","msg":"Loaded 349 logic variables from control panel"}
PIPELINE_SUMMARY:{"records_total":281566,"records_new":0,"records_updated":0,"records_meta":{"phase_distribution":{"O1":2812,"O2":2546,"O3":40782,"P10":613,"P11":782,"P12":87,"P13":984,"P14":486,"P15":224,"P16":186,"P17":193,"P18":107473,"P19":8059,"P20":42411,"P3":2380,"P4":4082,"P5":1457,"P6":2926,"P7a":2039,"P7b":2826,"P7c":33857,"P7d":1924,"P8":19106,"P9":881,"null":1210,"P2":964,"P1":276,"P9-P17":4436},"unclassified_count":8,"seq_distribution":{"1":8,"2":268,"3":1,"4":27,"5":76,"6":249,"7":1,"8":289,"9":321,"10":270,"11":352,"12":643,"13":527,"15":24,"17":108,"18":78,"19":905,"20":1,"21":8,"22":28950},"seq_violations":[{"seq":3,"actual":1,"band_min":37,"band_max":91,"kind":"band_violation","posture":"warn"},{"seq":4,"actual":27,"band_min":51,"band_max":117,"kind":"band_violation","posture":"warn"},{"seq":5,"actual":76,"band_min":82,"band_max":174,"kind":"band_violation","posture":"warn"},{"seq":11,"actual":352,"band_min":172,"band_max":340,"kind":"band_violation","posture":"warn"},{"seq":13,"actual":527,"band_min":41,"band_max":97,"kind":"band_violation","posture":"warn"},{"seq":17,"actual":108,"band_min":242,"band_max":472,"kind":"band_violation","posture":"warn"},{"seq":18,"actual":78,"band_min":152,"band_max":304,"kind":"band_violation","posture":"warn"},{"seq":24,"actual":0,"band_min":152,"band_max":304,"kind":"band_violation","posture":"warn"},{"seq":25,"actual":0,"band_min":325,"band_max":625,"kind":"band_violation","posture":"warn"},{"seq":26,"actual":0,"band_min":363,"band_max":695,"kind":"band_violation","posture":"warn"},{"seq":27,"actual":0,"band_min":16,"band_max":52,"kind":"band_violation","posture":"warn"},{"seq":29,"actual":0,"band_min":64,"band_max":140,"kind":"band_violation","posture":"warn"},{"seq":31,"actual":0,"band_min":21,"band_max":59,"kind":"band_violation","posture":"warn"},{"seq":32,"actual":0,"band_min":39,"band_max":95,"kind":"band_violation","posture":"warn"},{"seq":33,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":36,"actual":0,"band_min":81,"band_max":173,"kind":"band_violation","posture":"warn"},{"seq":38,"actual":0,"band_min":2,"band_max":26,"kind":"band_violation","posture":"warn"},{"seq":39,"actual":0,"band_min":305,"band_max":587,"kind":"band_violation","posture":"warn"},{"seq":40,"actual":0,"band_min":23,"band_max":63,"kind":"band_violation","posture":"warn"},{"seq":41,"actual":0,"band_min":16,"band_max":50,"kind":"band_violation","posture":"warn"},{"seq":42,"actual":0,"band_min":163,"band_max":323,"kind":"band_violation","posture":"warn"},{"seq":43,"actual":0,"band_min":2,"band_max":24,"kind":"band_violation","posture":"warn"},{"seq":45,"actual":0,"band_min":7,"band_max":33,"kind":"band_violation","posture":"warn"},{"seq":46,"actual":0,"band_min":2,"band_max":26,"kind":"band_violation","posture":"warn"},{"seq":49,"actual":0,"band_min":2,"band_max":24,"kind":"band_violation","posture":"warn"},{"seq":57,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":59,"actual":0,"band_min":618,"band_max":1168,"kind":"band_violation","posture":"warn"},{"seq":60,"actual":0,"band_min":621,"band_max":1175,"kind":"band_violation","posture":"warn"},{"seq":61,"actual":0,"band_min":637,"band_max":1205,"kind":"band_violation","posture":"warn"},{"seq":62,"actual":0,"band_min":637,"band_max":1203,"kind":"band_violation","posture":"warn"},{"seq":63,"actual":0,"band_min":623,"band_max":1177,"kind":"band_violation","posture":"warn"},{"seq":64,"actual":0,"band_min":622,"band_max":1176,"kind":"band_violation","posture":"warn"},{"seq":72,"actual":0,"band_min":639,"band_max":1209,"kind":"band_violation","posture":"warn"},{"seq":73,"actual":0,"band_min":618,"band_max":1168,"kind":"band_violation","posture":"warn"},{"seq":89,"actual":0,"band_min":18,"band_max":56,"kind":"band_violation","posture":"warn"},{"seq":90,"actual":0,"band_min":15,"band_max":49,"kind":"band_violation","posture":"warn"},{"seq":92,"actual":0,"band_min":341,"band_max":655,"kind":"band_violation","posture":"warn"},{"seq":97,"actual":0,"band_min":4,"band_max":28,"kind":"band_violation","posture":"warn"},{"seq":98,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":99,"actual":0,"band_min":670,"band_max":1266,"kind":"band_violation","posture":"warn"},{"seq":101,"actual":0,"band_min":85,"band_max":179,"kind":"band_violation","posture":"warn"},{"seq":102,"actual":0,"band_min":34,"band_max":84,"kind":"band_violation","posture":"warn"},{"seq":103,"actual":0,"band_min":6,"band_max":32,"kind":"band_violation","posture":"warn"},{"seq":104,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":105,"actual":0,"band_min":1,"band_max":23,"kind":"band_violation","posture":"warn"},{"seq":106,"actual":0,"band_min":12,"band_max":44,"kind":"band_violation","posture":"warn"},{"seq":107,"actual":0,"band_min":11,"band_max":41,"kind":"band_violation","posture":"warn"},{"seq":108,"actual":0,"band_min":4,"band_max":30,"kind":"band_violation","posture":"warn"},{"seq":24,"actual":0,"band_min":152,"band_max":304,"kind":"expected_data_missing","posture":"warn"},{"seq":25,"actual":0,"band_min":325,"band_max":625,"kind":"expected_data_missing","posture":"warn"}],"seq_violations_truncated_count":39,"audit_table":{"phase":22,"name":"Assert Lifecycle Phase Distribution","verdict":"WARN","rows":[{"metric":"lifecycle_seq_01_count","value":8,"threshold":"7..33","status":"PASS"},{"metric":"lifecycle_seq_02_count","value":268,"threshold":"195..383","status":"PASS"},{"metric":"lifecycle_seq_03_count","value":1,"threshold":"37..91","status":"WARN"},{"metric":"lifecycle_seq_04_count","value":27,"threshold":"51..117","status":"WARN"},{"metric":"lifecycle_seq_05_count","value":76,"threshold":"82..174","status":"WARN"},{"metric":"lifecycle_seq_06_count","value":249,"threshold":"221..433","status":"PASS"},{"metric":"lifecycle_seq_07_count","value":1,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_08_count","value":289,"threshold":"204..400","status":"PASS"},{"metric":"lifecycle_seq_09_count","value":321,"threshold":"189..371","status":"PASS"},{"metric":"lifecycle_seq_10_count","value":270,"threshold":"228..444","status":"PASS"},{"metric":"lifecycle_seq_11_count","value":352,"threshold":"172..340","status":"WARN"},{"metric":"lifecycle_seq_12_count","value":643,"threshold":"387..741","status":"PASS"},{"metric":"lifecycle_seq_13_count","value":527,"threshold":"41..97","status":"WARN"},{"metric":"lifecycle_seq_14_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_15_count","value":24,"threshold":"16..52","status":"PASS"},{"metric":"lifecycle_seq_16_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_17_count","value":108,"threshold":"242..472","status":"WARN"},{"metric":"lifecycle_seq_18_count","value":78,"threshold":"152..304","status":"WARN"},{"metric":"lifecycle_seq_19_count","value":905,"threshold":"632..1196","status":"PASS"},{"metric":"lifecycle_seq_20_count","value":1,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_21_count","value":8,"threshold":"5..31","status":"PASS"},{"metric":"lifecycle_seq_22_count","value":28950,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_23_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_24_count","value":0,"threshold":"152..304","status":"WARN"},{"metric":"lifecycle_seq_25_count","value":0,"threshold":"325..625","status":"WARN"},{"metric":"lifecycle_seq_26_count","value":0,"threshold":"363..695","status":"WARN"},{"metric":"lifecycle_seq_27_count","value":0,"threshold":"16..52","status":"WARN"},{"metric":"lifecycle_seq_28_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_29_count","value":0,"threshold":"64..140","status":"WARN"},{"metric":"lifecycle_seq_30_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_31_count","value":0,"threshold":"21..59","status":"WARN"},{"metric":"lifecycle_seq_32_count","value":0,"threshold":"39..95","status":"WARN"},{"metric":"lifecycle_seq_33_count","value":0,"threshold":"1..23","status":"WARN"},{"metric":"lifecycle_seq_34_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_35_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_36_count","value":0,"threshold":"81..173","status":"WARN"},{"metric":"lifecycle_seq_37_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_38_count","value":0,"threshold":"2..26","status":"WARN"},{"metric":"lifecycle_seq_39_count","value":0,"threshold":"305..587","status":"WARN"},{"metric":"lifecycle_seq_40_count","value":0,"threshold":"23..63","status":"WARN"},{"metric":"lifecycle_seq_41_count","value":0,"threshold":"16..50","status":"WARN"},{"metric":"lifecycle_seq_42_count","value":0,"threshold":"163..323","status":"WARN"},{"metric":"lifecycle_seq_43_count","value":0,"threshold":"2..24","status":"WARN"},{"metric":"lifecycle_seq_44_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_45_count","value":0,"threshold":"7..33","status":"WARN"},{"metric":"lifecycle_seq_46_count","value":0,"threshold":"2..26","status":"WARN"},{"metric":"lifecycle_seq_47_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_48_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_49_count","value":0,"threshold":"2..24","status":"WARN"},{"metric":"lifecycle_seq_50_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_51_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_52_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_53_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_54_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_55_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_56_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_57_count","value":0,"threshold":"1..23","status":"WARN"},{"metric":"lifecycle_seq_58_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_59_count","value":0,"threshold":"618..1168","status":"WARN"},{"metric":"lifecycle_seq_60_count","value":0,"threshold":"621..1175","status":"WARN"},{"metric":"lifecycle_seq_61_count","value":0,"threshold":"637..1205","status":"WARN"},{"metric":"lifecycle_seq_62_count","value":0,"threshold":"637..1203","status":"WARN"},{"metric":"lifecycle_seq_63_count","value":0,"threshold":"623..1177","status":"WARN"},{"metric":"lifecycle_seq_64_count","value":0,"threshold":"622..1176","status":"WARN"},{"metric":"lifecycle_seq_65_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_66_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_67_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_68_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_69_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_70_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_71_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_72_count","value":0,"threshold":"639..1209","status":"WARN"},{"metric":"lifecycle_seq_73_count","value":0,"threshold":"618..1168","status":"WARN"},{"metric":"lifecycle_seq_74_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_75_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_76_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_77_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_78_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_79_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_80_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_81_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_82_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_83_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_84_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_85_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_86_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_87_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_88_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_89_count","value":0,"threshold":"18..56","status":"WARN"},{"metric":"lifecycle_seq_90_count","value":0,"threshold":"15..49","status":"WARN"},{"metric":"lifecycle_seq_91_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_92_count","value":0,"threshold":"341..655","status":"WARN"},{"metric":"lifecycle_seq_93_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_94_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_95_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_96_count","value":0,"threshold":"no upper bound (catalog rows_count=0)","status":"INFO"},{"metric":"lifecycle_seq_97_count","value":0,"threshold":"4..28","status":"WARN"},{"metric":"lifecycle_seq_98_count","value":0,"threshold":"1..23","status":"WARN"},{"metric":"lifecycle_seq_99_count","value":0,"threshold":"670..1266","status":"WARN"},{"metric":"lifecycle_seq_100_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_101_count","value":0,"threshold":"85..179","status":"WARN"},{"metric":"lifecycle_seq_102_count","value":0,"threshold":"34..84","status":"WARN"},{"metric":"lifecycle_seq_103_count","value":0,"threshold":"6..32","status":"WARN"},{"metric":"lifecycle_seq_104_count","value":0,"threshold":"1..23","status":"WARN"},{"metric":"lifecycle_seq_105_count","value":0,"threshold":"1..23","status":"WARN"},{"metric":"lifecycle_seq_106_count","value":0,"threshold":"12..44","status":"WARN"},{"metric":"lifecycle_seq_107_count","value":0,"threshold":"11..41","status":"WARN"},{"metric":"lifecycle_seq_108_count","value":0,"threshold":"4..30","status":"WARN"},{"metric":"lifecycle_seq_109_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"lifecycle_seq_110_count","value":0,"threshold":"0..22","status":"PASS"},{"metric":"unclassified_count","value":8,"threshold":"<= 100","status":"PASS"},{"metric":"cross_check_stalled","value":42,"threshold":"< 1000 (WARN), >= 1000 (FAIL)","status":"WARN"},{"metric":"cross_check_active_inspection","value":584,"threshold":"< 800 (WARN), >= 800 (FAIL)","status":"WARN"},{"metric":"cross_check_permit_issued","value":194,"threshold":"< 500 (WARN), >= 500 (FAIL)","status":"WARN"},{"metric":"seq_bands_total","value":110,"threshold":"== 110 expected (dynamic from universal_stream_catalog; WARN on partial mig 148 apply)","status":"PASS"},{"metric":"seq_bands_passing","value":62,"threshold":null,"status":"INFO"},{"metric":"seq_bands_null_catalog_count","value":33,"threshold":null,"status":"INFO"},{"metric":"seq_bands_warn","value":89,"threshold":"== 0 PASS, > 0 WARN (E.4 first-deploy posture; E.5 tightens to FAIL)","status":"WARN"},{"metric":"seq_bands_failing","value":0,"threshold":"== 0 PASS, > 0 FAIL (E.5 posture-gated — fires when any of the 3 lifecycle_seq_band_promote_to_fail_* flags is 1 and a matching violation occurs)","status":"PASS"},{"metric":"lifecycle_seq_band_promote_to_fail_band_violation","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `band_violation` kind. See Spec 84 §3.4.","status":"INFO"},{"metric":"lifecycle_seq_band_promote_to_fail_no_band_configured","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `no_band_configured` kind (operator config gap). See Spec 84 §3.4.","status":"INFO"},{"metric":"lifecycle_seq_band_promote_to_fail_expected_data_missing","value":0,"threshold":"0=WARN routing (E.4 default), 1=FAIL routing (E.5 promotion). Gates `expected_data_missing` kind (data deletion / classifier-skip signal). See Spec 84 §3.4.","status":"INFO"},{"metric":"seq_unclassified_count","value":247258,"threshold":"<= 5000 (WARN above)","status":"WARN"},{"metric":"sys_velocity_rows_sec","value":45028.95,"threshold":null,"status":"INFO"},{"metric":"sys_duration_ms","value":6253,"threshold":null,"status":"INFO"}]}}}
PIPELINE_META:{"reads":{"permits":["lifecycle_phase","lifecycle_seq","lifecycle_stalled","enriched_status","status"],"coa_applications":["lifecycle_phase","lifecycle_seq","linked_permit_num","decision"],"universal_stream_catalog":["seq","rows_count"]},"writes":{}}

[assert-lifecycle-phase-distribution] completed in 6.3s

```

### stderr tail
```
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_44_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_47_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_48_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_50_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_53_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_54_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_55_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_56_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_58_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_65_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_66_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_67_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_70_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_71_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_74_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_75_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_76_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_77_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_78_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_79_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_80_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_81_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_82_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_83_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_88_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_91_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_94_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"logic_variables.lifecycle_seq_band_96_max is non-finite — keeping fallback","context":{"raw":null}}
{"level":"WARN","tag":"[assert-lifecycle-phase-distribution]","msg":"WARNINGS","context":{"warnings":["42 permits have enriched_status=Stalled but lifecycle_stalled=false (Strangler Fig drift — legacy column is less accurate)","584 permits with enriched_status=Active Inspection are not in P9-P18/O1-O3 (Strangler Fig drift — legacy column is less accurate)","89 per-seq bands outside expected range (0 FAIL, 89 WARN) — first 10: [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 3: 1 outside [37, 91]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 4: 27 outside [51, 117]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 5: 76 outside [82, 174]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 11: 352 outside [172, 340]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 13: 527 outside [41, 97]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 17: 108 outside [242, 472]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 18: 78 outside [152, 304]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 24: 0 outside [152, 304]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 25: 0 outside [325, 625]; [E.4 WARN-ONLY POSTURE — expected during first-deploy / Phase D ramp-up] seq 26: 0 outside [363, 695] ... (+40 more in records_meta.seq_violations) (39 additional violations TRUNCATED — see records_meta.seq_violations_truncated_count)","[E.4 WARN-ONLY POSTURE] seq_unclassified_count 247258 exceeds 5000 — Phase D/E.2 first-run state likely; verify classifier coverage. (In steady state seq_unclassified_count >= unclassified_count; the two converge as E.5 ramps up.)"]}}

```

## Checklist evidence (C1-C12)

### C1: PASS
**Evidence:** exit=0 duration=7912ms

### C2: PASS
**Evidence:** id=3318 status=completed completed_at=Wed May 20 2026 16:49:57 GMT-0400 (Eastern Daylight Time)

### C3: INVESTIGATE
**Evidence:** verdict='WARN'

### C4: PASS
**Evidence:** 125 audit rows: [lifecycle_seq_01_count, lifecycle_seq_02_count, lifecycle_seq_03_count, lifecycle_seq_04_count, lifecycle_seq_05_count, lifecycle_seq_06_count, lifecycle_seq_07_count, lifecycle_seq_08_count, lifecycle_seq_09_count, lifecycle_seq_10_count, lifecycle_seq_11_count, lifecycle_seq_12_count, lifecycle_seq_13_count, lifecycle_seq_14_count, lifecycle_seq_15_count, lifecycle_seq_16_count, lifecycle_seq_17_count, lifecycle_seq_18_count, lifecycle_seq_19_count, lifecycle_seq_20_count, lifecycle_seq_21_count, lifecycle_seq_22_count, lifecycle_seq_23_count, lifecycle_seq_24_count, lifecycle_seq_25_count, lifecycle_seq_26_count, lifecycle_seq_27_count, lifecycle_seq_28_count, lifecycle_seq_29_count, lifecycle_seq_30_count, lifecycle_seq_31_count, lifecycle_seq_32_count, lifecycle_seq_33_count, lifecycle_seq_34_count, lifecycle_seq_35_count, lifecycle_seq_36_count, lifecycle_seq_37_count, lifecycle_seq_38_count, lifecycle_seq_39_count, lifecycle_seq_40_count, lifecycle_seq_41_count, lifecycle_seq_42_count, lifecycle_seq_43_count, lifecycle_seq_44_count, lifecycle_seq_45_count, lifecycle_seq_46_count, lifecycle_seq_47_count, lifecycle_seq_48_count, lifecycle_seq_49_count, lifecycle_seq_50_count, lifecycle_seq_51_count, lifecycle_seq_52_count, lifecycle_seq_53_count, lifecycle_seq_54_count, lifecycle_seq_55_count, lifecycle_seq_56_count, lifecycle_seq_57_count, lifecycle_seq_58_count, lifecycle_seq_59_count, lifecycle_seq_60_count, lifecycle_seq_61_count, lifecycle_seq_62_count, lifecycle_seq_63_count, lifecycle_seq_64_count, lifecycle_seq_65_count, lifecycle_seq_66_count, lifecycle_seq_67_count, lifecycle_seq_68_count, lifecycle_seq_69_count, lifecycle_seq_70_count, lifecycle_seq_71_count, lifecycle_seq_72_count, lifecycle_seq_73_count, lifecycle_seq_74_count, lifecycle_seq_75_count, lifecycle_seq_76_count, lifecycle_seq_77_count, lifecycle_seq_78_count, lifecycle_seq_79_count, lifecycle_seq_80_count, lifecycle_seq_81_count, lifecycle_seq_82_count, lifecycle_seq_83_count, lifecycle_seq_84_count, lifecycle_seq_85_count, lifecycle_seq_86_count, lifecycle_seq_87_count, lifecycle_seq_88_count, lifecycle_seq_89_count, lifecycle_seq_90_count, lifecycle_seq_91_count, lifecycle_seq_92_count, lifecycle_seq_93_count, lifecycle_seq_94_count, lifecycle_seq_95_count, lifecycle_seq_96_count, lifecycle_seq_97_count, lifecycle_seq_98_count, lifecycle_seq_99_count, lifecycle_seq_100_count, lifecycle_seq_101_count, lifecycle_seq_102_count, lifecycle_seq_103_count, lifecycle_seq_104_count, lifecycle_seq_105_count, lifecycle_seq_106_count, lifecycle_seq_107_count, lifecycle_seq_108_count, lifecycle_seq_109_count, lifecycle_seq_110_count, unclassified_count, cross_check_stalled, cross_check_active_inspection, cross_check_permit_issued, seq_bands_total, seq_bands_passing, seq_bands_null_catalog_count, seq_bands_warn, seq_bands_failing, lifecycle_seq_band_promote_to_fail_band_violation, lifecycle_seq_band_promote_to_fail_no_band_configured, lifecycle_seq_band_promote_to_fail_expected_data_missing, seq_unclassified_count, sys_velocity_rows_sec, sys_duration_ms]

### C5: N/A-MANUAL
**Evidence:** grep script source; cross-ref with C3

### C6: N/A
**Evidence:** not a ledger writer

### C7: PASS
**Evidence:** 6 records_meta keys: [pipeline_meta, seq_violations, seq_distribution, phase_distribution, unclassified_count, seq_violations_truncated_count]

### C8: N/A
**Evidence:** no output tables declared (read-only / sanity step)

### C9: N/A-MANUAL
**Evidence:** compare information_schema columns to script INSERT/UPDATE column list

### C10: N/A
**Evidence:** not a calculation step

### C11: N/A-MANUAL
**Evidence:** records_total=281198 records_new=0 records_updated=0; verify primary entity scoping per §11.1

### C12: PASS
**Evidence:** all applicable tripwires PASS or N/A

## Tripwires (per-risk-class profile: cqa)

- **T3:** INFO — records_total=281198 records_new=0 records_updated=0
- **T9:** N/A-MANUAL — distribution baseline manual (last 7 runs comparison)
- **T12:** PASS — 0 warn lines in stderr

## N/A-MANUAL items requiring follow-up

- **C5:** grep script source; cross-ref with C3
- **C9:** compare information_schema columns to script INSERT/UPDATE column list
- **C11:** records_total=281198 records_new=0 records_updated=0; verify primary entity scoping per §11.1

## Specialized agent finding
_Pending: Calculations agent to run separately and append findings here._
