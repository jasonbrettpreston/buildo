# CARD COA-TIER-PLACEMENT (engine inputs plan D-4) — ANSWERED 2026-11-12

Question: when does "Can you build bigger?" get numbers, i.e. where do the M-65 u fit (CoA(s) = AOR(s) × u_form(s), fitted by the M-70 trial) and the Layer 3 `<building_type>/coa_gfa_max_m2` rows go?
- (a) Stay at MB-38 / MB-44 and show "Not yet evaluated" in testing.
- (b) A new increment card that fits u on the MB-35 cohort earlier.

Recommendation: (a). It keeps the increment order (the queue increments table: no row for a later increment is authored before its turn). Fitting u needs AOR(s) on lots with CoA history, which is the MB-38 / MB-44 range today. The legacy Spec 78 `opt_coa` model is not fed the engine size: that would be a third, unruled method beside M-65, it double-counts (M-65 (1)), and it would be thrown away later.
Plan: `~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md` v2 §4c, §11 D-4.

Operator answer (verbatim, 2026-11-12): "D all as recommended - please ensure this is addedd to the McFrontend decisions"
Answer recorded (EI-D4; Spec 135 FE-39; McBylaws queue MB-94 part (e)):
- (a). The field `<building_type>/coa_gfa_max_m2` is declared now and reads `not_evaluated:coa_factor_unfitted:<form>` ("Not yet evaluated") until the M-65 u fit lands at MB-38 / MB-44.
- When it is filled, it shows only after the M-70 fit passes a stated accuracy bar, with the EI-D7 copy: "Possibly. Similar homes nearby were approved by the Committee of Adjustment for up to about {size}. Approval is not guaranteed."
