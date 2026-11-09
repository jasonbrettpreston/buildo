// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (dated note 2026-11-09, MF-14), 126:552 (R-27: one home),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-29, FE-30.
//
// MF-14 · lane E-MF14. The committed files the renderer reads, gathered once for the server: the node contract, the generated declaration and
// content registry, the headline lists and the closed layout table. Nothing is copied; these are imports of the one home of each.
import schema from '../../../../scripts/surfaces/_schema/report-tree.schema.json';
import decl from '../../../../scripts/surfaces/_schema/report-v2.decl.json';
import content from '../../../../scripts/surfaces/_schema/report-presentation.json';
import lists from '../../../../scripts/surfaces/_schema/report-v2-seed/row-presentation.json';
import adContract from '../../../../scripts/surfaces/_schema/ad-contract.json';
import layout from '../../../../scripts/surfaces/_schema/report-layout.json';
import type { ReportCtx } from './core';

export const reportCtx: ReportCtx = { schema, decl, content, lists, layout, adContract };
