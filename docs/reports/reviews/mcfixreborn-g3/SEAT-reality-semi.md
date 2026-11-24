Seat: Cairn-Reality-Semi

2. WHAT I READ AND RAN
Read: migrations/320 and 323, the six semi settings and seed text in scripts/seeds/logic_variables.json, and the semi lines in MORNING-DECISIONS.md (rulings "semi all y" 11-13, "a" 11-14). I did not re-read Spec 78 O-4 or Spec 100 §3.2 beyond what the migrations quote.
Stack view: pg_get_viewdef shows the stack's parcel_lot_form is migration 320's logic exactly. The only differences are cosmetic casts (x.link_parcels >= 2 instead of BETWEEN 2 AND max_link, same result). Branch 323 adds four things:
 (a) an in-scope test: the lot must be in zones R, RD, RS, RT or RM, and a NULL zone is out;
 (b) unsure when the lot is strict (exactly 2 linked parcels) and in an ask zone (RD);
 (c) unsure when the shared line is over 60 m;
 (d) for a 3-parcel (doubt) match, it is now called semi only if it is in a residential zone.
The old shared-line and doubt asks stay as before. 323's own "doubt" is unchanged.
Stack settings: only semi_doubt_enabled=1, semi_doubt_max_link_parcels=3 and semi_doubt_min_shared_len_m=5 exist. I inlined the seed defaults as literals: semi_detect_zone_classes = [R,RD,RS,RT,RM]; semi_ask_two_parcel_zone_classes = [RD]; semi_auto_max_shared_len_m = 60. Those are what 323 itself COALESCEs to, so the result equals applying 323 with its seeds.
Queries (all BEGIN READ ONLY; one SELECT; ROLLBACK; the full 496,536 lots, no sample except where stated; each took under a second or two):
 Q1 branch rule grouped by detected, basis and unsure, with counts of frontage over 15 m and area over 1,000 m².
 Q2 the old rule on the same rows. It reproduces the earlier seat exactly (124,737 / 22,271 / 14,205), so my CTE is a faithful copy.
 Q3 zones dropped, and zones of the kept semis.
 Q4 reasons for unsure, percentiles, "nearest" counts, example ids.
 Q5 (sample id%20=0 only) partner symmetry.

3. OLD VIEW VERSUS BRANCH RULE (496,536 lots)
| measure | old (stack) | branch 323 |
| lots called semi_half | 124,737 | 110,072 (22.2%) |
|  basis o4_two_parcel_abut | n/a | 93,123 |
|  basis doubt_multi_parcel_abut | n/a | 16,949 |
| unsure (asked the question) | 22,271 (4.5%) | 29,515 (5.94%) |
| semi lots with frontage over 15 m | 14,205 | 7,465 (auto 2,161; asked 5,304) |
| detached | 371,799 | 386,464 |
Branch semi_half = 80,557 auto + 29,515 asked. The old view's split by basis is not in the numbers I was given, so I left it blank.
Why unsure rose: the asked count went UP by about 7,200 although 14,665 fewer lots are called semi. Reasons (overlap, so they sum to more than 29,515): doubt band 16,949; strict in RD 11,588 (10,464 of them are asked ONLY because they are RD); shared line over 60 m 2,011 (735 outside RD); shared line under 5 m 482.
By zone, semi / of which asked: R 49,044 / 11,972; RD 14,013 / 14,013 (every RD semi is asked, by design); RM 27,263 / 1,911; RS 17,392 / 1,082; RT 2,360 / 537.
Dropped by the zone filter: about 14,700 semi-by-link lots, mostly CR 4,557, NULL zone 4,055, ON 1,333, E 1,231, OR 926, RA 535, UT 527, O 375.

4. FINDINGS (most serious first)
1. MEDIUM, data quality (building-link step), not the SQL. Half of all semi calls rest on a "nearest" link, not a real overlap. Of the auto-called semis, 40,194 of 80,557 have no centroid_in_parcel match at all (every primary link is "nearest"). Of the asked lots, 16,600 of 29,515 have a nearest link. The migration says nearest 0.60 is the "semi signature", so this is a known and accepted bet. I cannot tell on this stack whether it is right. The 79% imagery result is the only evidence, and it was on the old rule. Owner: the link step and the next imagery check.
2. MEDIUM, the asked list is 5.94% of lots, which is a sensible overall rate (about 1 lot in 17). But 35% of it is the RD rule alone: 10,464 RD lots are asked purely because they are RD (the ruling "a" item 2), and every RD semi gets the question. That is the ruling working as written, not a defect. A person in RD with a semi-looking neighbour sees the question every time.
3. MEDIUM, SQL: large lots are auto-called semi. Of the 80,557 auto-called, 2,161 have frontage over 15 m and 295 have area over 1,000 m². Examples over 15 m: 22504 (RS, 17 m, 295 m², shared line 19 m), 23862, 29100. Examples over 1,000 m²: 50828 (RM, 1,588 m², shared line 47 m), 145694, 455803 (R, 2,571 m²). Most of the 15 m group have normal areas, so they are plausibly wide semi halves. The over-1,000 m² group, and the 138 asked-or-auto lots with area over 2,000 m² and a 15 m+ frontage, look like towers or blocks. The 60 m cap does not catch them because their shared lines are 47 to 56 m. Smallest fix: add an area or frontage cap (a new setting) to the auto-call, or accept it. The area or frontage figure is not part of the ruling.
4. LOW to MEDIUM, tiny and null lots called semi. 168 auto and 537 asked semis have a NULL frontage. Doubt-band examples with area under 100 m²: 485 (RM, 28 m², null frontage, 3 linked, 31 m shared), 9021 (R, 62 m², 6 m shared), 44814 (RD, 8 m²). These are slivers or laneway lots (the 3-parcel rule's known sliver case). They are asked, not auto-called, so the cost is a pointless question. Fix: a minimum area guard, if wanted.
5. LOW, three-lot buildings. All 16,949 doubt lots share a building with exactly 2 other lots (rows of 3). Rows of 4 or more are already excluded (a building linked to over 3 parcels returns detached). All 16,949 are asked, none auto-called, which is the intended behaviour.
6. LOW, one-sided calls. In the 5% sample (id%20=0), 91 strict semis have a partner that is not itself called semi (scaled, about 1,800 over the full set). The partner is probably in a non-residential zone. A pair where one lot gets the semi question and the neighbour gets none is the visible result. It follows from "ruling a" item 1 and I did not trace it further.
7. Zone filter works. No non-residential zone in semi or unsure: all semis are in R, RD, RS, RT or RM. A non-residential lot is never asked.
Frontage and area percentiles (5th, 50th, 95th, 99th), auto semis: frontage 4.7 / 7.6 / 13.1 / 18.1 m; area 133 / 262 / 451 / 673 m²; shared line median 45.8 m, 95th 35.1 m... see below. Asked semis: frontage 3.7 / 7.3 / 22.8 / 47.7 m; area 54 / 237 / 1,053 / 4,349 m²; shared line median 34 m, 95th 63 m. (Auto: 50th shared line 35.05 m, 95th 45.8 m.) So the auto group looks like real semi halves; the asked group has a fat tail. 1,626 asked lots have area over 1,000 m², and 1,151 have frontage over 25 m (examples 38897, 163251, 328151 with 3,300 to 4,800 m² in RD; 92732, 153454).
Unsure-with-frontage-over-15-m is 5,304 (that is 18% of the asked group), and RD is the biggest part of it.

5. WHAT IS SOUND
The new rule asks about 29,500 lots (5.94%), a sensible number. The zone filter has no leaks. The 60 m cap and RD ask do exactly what ruling "a" says. The 14,205 frontage-over-15 m "semis" fall to 7,465, and only 2,161 of those are auto-called. The auto group looks like semis (median 7.6 m frontage, 262 m²). My copy of the old rule matches the earlier seat to the lot, so the comparison is clean. No defect in 320 or 323 SQL beyond the missing size guard (finding 3).

6. QUESTIONS (UNVERIFIED)
- Should the auto-call also have an area or frontage ceiling (295 auto lots over 1,000 m² show the need), or is the 60 m shared-line cap meant to be the only size guard?
- Is asking every RD semi-looking lot acceptable at about 14,000 lots, or should the ask be narrowed (for example only if frontage is under 10 m)?
- Is the "nearest" link share (about half) acceptable for this release?
Limit: counts are on the test stack with the 323 settings supplied by me as literals, not read from rows.
