# CARD COST-PREMIUM (engine inputs plan D-3; extends CARD-cost-rates-stale-and-premium, 2026-11-09) — ANSWERED 2026-11-12

Question: the cost basis. The income-based `neighbourhood_cost_premium` (1.00 / 1.15 / 1.35 / 1.60 / 1.85, a census household-income step function, Spec 67 and Spec 88 §2.1) multiplies the whole hard-cost rate. Measured (plan §3.3, §6 M-3), it puts the FB rate above its own cited $400-650/ft² source range on 95,692 lots (19 %): FB × 1.60 = $720/ft², FB × 1.85 = $833/ft². No cost data backs the premium (Competition Act s.74.01(1)(b)).
- (a) Base rate × escalation only; no premium in the customer figure.
- (b) Keep a premium only if it is re-derived from construction-cost data.
- (c) Keep it, and label it next to the figure.

Recommendation: (a) now, and (b) later as its own card. It is the smallest change and closes the s.74.01(1)(b) gap.
Plan: `~/Buildo-scratch/mcbylaws/ENGINE-INPUTS-PLAN.md` v2 §6 M-3, §8 R-7, §11 D-3. Earlier card (scratch): `~/Buildo-scratch/mcbylaws/CARD-cost-rates-stale-and-premium.md` (rates as of 2026-06-30, escalation index 100.0; premium distribution).

Operator answer (verbatim, 2026-11-12): "D all as recommended - please ensure this is addedd to the McFrontend decisions"
Answer recorded (EI-D3; Spec 135 FE-39; Spec 69a M-67 dated note 2026-11-12 (R-7); Spec 88 §2.6 dated note 2026-11-12; McBylaws queue MB-94 part (b)):
- (a) now. The figure shown to a customer or a tester is base rate × escalation × adjustment, with no `neighbourhood_cost_premium`. It is applied before any engine cost shows (plan §10 step 3).
- (b) stays open as the follow-up on this card: a premium returns only once it is re-derived from construction-cost data. The rate refresh of the 2026-11-09 card (rates and index stale) is still owed before engine costs go live.
