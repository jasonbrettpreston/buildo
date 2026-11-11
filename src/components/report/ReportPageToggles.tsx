'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 5.3 (client is glass: UI state only, no data, no maths), 11a.7 (dated note 2026-11-09, MF-14);
//            approved mock v21 behaviour (open-questions.md "mock v13 details panels": "Hide details" while open, one panel open per option; "mock v21: APPROVED": the Add lot size sheet).
//
// MF-57 · McFrontend queue. The one client island of the v21 report page: a delegated click handler over the server-rendered page. It reads only
// data attributes the server wrote (data-toggle, aria-controls, data-open-label, data-closed-label) and toggles `hidden`, aria-expanded and the
// native <dialog>. No field, no value, no layout decision: those are the server's (ReportPage reads the layout row).
import type { MouseEvent, ReactElement, ReactNode } from 'react';

const byId = (root: Element, id: string | null): HTMLElement | null => (id ? root.ownerDocument.getElementById(id) : null);

const setPanel = (root: Element, btn: HTMLButtonElement, open: boolean): void => {
  const panel = byId(root, btn.getAttribute('aria-controls'));
  if (panel) panel.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  const label = btn.querySelector('[data-label]');
  const text = open ? btn.dataset.openLabel : btn.dataset.closedLabel;
  if (label && text !== undefined) label.textContent = text;
};

const openSheet = (dlg: HTMLDialogElement): void => {
  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
  dlg.querySelector('input')?.focus();
};
const closeSheet = (root: Element, dlg: HTMLDialogElement): void => {
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
  (root.querySelector(`[data-toggle="sheet"][aria-controls="${dlg.id}"]`) as HTMLElement | null)?.focus();
};

export function ReportPageToggles({ children }: { children: ReactNode }): ReactElement {
  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    const root = e.currentTarget;
    const target = e.target as Element;
    if (target instanceof HTMLDialogElement) { closeSheet(root, target); return; } // a click on the backdrop lands on the dialog itself
    const btn = target.closest('button[data-toggle]') as HTMLButtonElement | null;
    if (!btn) return;
    const kind = btn.dataset.toggle;
    if (kind === 'sheet') { const d = byId(root, btn.getAttribute('aria-controls')); if (d instanceof HTMLDialogElement) openSheet(d); return; }
    if (kind === 'sheet-close') { const d = btn.closest('dialog'); if (d) closeSheet(root, d); return; }
    if (kind === 'how') { setPanel(root, btn, btn.getAttribute('aria-expanded') !== 'true'); return; }
    const scope = btn.closest('[data-section="option"]');
    if (!scope) return;
    if (kind === 'hide') {
      const panel = btn.closest('[data-panel]');
      const opener = panel ? (scope.querySelector(`button[data-toggle="panel"][aria-controls="${panel.id}"]`) as HTMLButtonElement | null) : null;
      if (opener) { setPanel(root, opener, false); opener.focus(); }
      return;
    }
    if (kind === 'panel') {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      for (const other of scope.querySelectorAll('button[data-toggle="panel"]')) if (other !== btn) setPanel(root, other as HTMLButtonElement, false);
      setPanel(root, btn, open);
    }
  };
  // The handler only delegates clicks of the buttons inside (keyboard activation of a button fires click); the wrapper itself is not interactive.
  return <div onClick={onClick}>{children}</div>;
}
