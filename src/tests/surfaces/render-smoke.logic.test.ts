// @vitest-environment jsdom
// SPEC LINK: docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-33 (one render smoke per archetype per platform; every displayed string,
//            library default strings and form error messages included, comes from content), docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.2,
//            docs/specs/00-architecture/117_maxbld_brand.md section 3.2 (On-primary #472a00), docs/specs/02-web-admin/33_web_admin_engineering_protocol.md
//            section 9 (touch targets of at least 44 px).
//
// MF-37 · T8, the FE-33 lock (web half; MF-35 extends it for mobile by dated note, prose-only until MF-25). Cases:
//   (a) per archetype (FORM upload, FORM delete, LIST) the binding renders through the one provider: non-empty, its content strings present;
//   (b) RED: an unknown widget throws; a missing content key throws;
//   (c) errors: each schema keyword maps to its content text (pure), and a submitted invalid form shows content text, never AJV English
//       (RED: the same form without the transform shows AJV English);
//   (d) defaults: the empty LIST shows the content empty text, never the library default (RED: noRecordsText dropped -> "No records");
//   (e) the primary Button text colour is the On-primary #472a00 (inline --button-color); every rendered button and input wrapper is lg/xl;
//       the Modal close button is xl in the golden; the provider imports only the layered sheets T1 checks.
// Written with createElement (the lock path is a .ts file). No DB, no network.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h, Fragment, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Form from '@rjsf/mantine';
import { DataTable } from 'mantine-datatable';
import { AdminMantineProvider } from '../../components/surfaces/web/AdminMantineProvider';
import { ERROR_KEYS, FormBinding, errorTransformer, formProps, formTree, type Node } from '../../components/surfaces/web/FormBinding';
import { ListBinding, listProps, listTree, type Row } from '../../components/surfaces/web/ListBinding';
import { MEDIA_CONTENT as C, MEDIA_SCHEMAS, MEDIA_SURFACES } from '../../lib/media/surfaces';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- descriptor JSON and library props
const ROOT = process.cwd();
const upload = MEDIA_SURFACES.upload as unknown as Json;
const remove = MEDIA_SURFACES.remove as unknown as Json;
const list = MEDIA_SURFACES.list as unknown as Json;
const S_UP = MEDIA_SCHEMAS.upload as unknown as Json;
const S_DEL = MEDIA_SCHEMAS.remove as unknown as Json;
const ROW: Row = { asset_id: 'a1', kind: 'ad_creative', scenario_key: null, position: null, alt: 'Alt one', mime: 'image/png', bytes: 1, bytes_display: '1 B', created_at: '2026-11-09T00:00:00Z', created_display: '2026-11-09 00:00 UTC', signed_url: null };
const provided = (el: ReactElement): ReactElement => h(AdminMantineProvider, { scheme: 'light', children: el });
const ssr = (el: ReactElement): string => renderToStaticMarkup(provided(el)).replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const form = (d: Json, s: Json, state: string, runtime: Json = {}): ReactElement => h(FormBinding, { tree: formTree(d as never, s as never, state as never), schema: s as never, content: C, runtime });
const table = (state: string, rows: Row[]): ReactElement => h(ListBinding, { descriptor: list as never, tree: listTree(list as never, state as never), rows, content: C });

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false }) });
  if (!('ResizeObserver' in globalThis)) Object.defineProperty(globalThis, 'ResizeObserver', { writable: true, value: class { observe(): void { /* jsdom stub */ } unobserve(): void { /* jsdom stub */ } disconnect(): void { /* jsdom stub */ } } });
});
afterEach(() => cleanup());

describe('FE-33 (a) one render smoke per archetype (web)', () => {
  it('FORM upload: every field label, help, option and the submit text come from content', () => {
    const html = ssr(form(upload, S_UP, 'static'));
    for (const k of ['field.kind', 'field.scenario_key', 'field.position', 'field.alt', 'field.file', 'help.alt', 'submit']) expect(html).toContain(C[`admin_media_upload.${k}`]);
  });
  it('FORM delete: the confirm field, the state alert and the submit come from content; the asset id is not shown', () => {
    const html = ssr(form(remove, S_DEL, 'error', { formData: { asset_id: 'a1' }, constants: { confirm: 'Alt one' } }));
    for (const k of ['field.confirm', 'help.confirm', 'submit', 'state.error']) expect(html).toContain(C[`admin_media_delete.${k}`]);
    expect(html).not.toContain('asset_id'); // the hidden widget shows nothing; the route takes the id from its path
  });
  it('LIST: the columns, a row, the delete action, the preview fallback and the state alert from content', () => {
    const html = ssr(table('degraded', [ROW]));
    for (const k of ['col.kind', 'col.alt', 'col.bytes', 'col.preview', 'action.delete', 'state.degraded', 'preview.unavailable']) expect(html).toContain(C[`admin_media.${k}`]);
    expect(html).toContain('Alt one');
  });
});

describe('FE-33 (b) a gap is loud', () => {
  it('RED: an unknown widget throws in formTree', () => {
    const d = structuredClone(upload); d.render.form.fields[0].widget = 'slider';
    expect(() => formTree(d as never, S_UP as never, 'static')).toThrow('FormBinding: unknown widget slider (admin_media_upload.kind)');
  });
  it('RED: a missing content key throws in both bindings', () => {
    const c = { ...C }; delete c['admin_media_upload.submit']; delete c['admin_media.empty'];
    expect(() => formProps(formTree(upload as never, S_UP as never, 'static'), S_UP as never, c)).toThrow('FormBinding: missing content key admin_media_upload.submit');
    expect(() => listProps(list as never, listTree(list as never, 'empty'), [], c)).toThrow('ListBinding: missing content key admin_media.empty');
  });
});

describe('FE-33 (c) form error messages come from content', () => {
  it('every keyword the schema can raise maps to its content text (pure transform)', () => {
    const tree = formTree(upload as never, S_UP as never, 'static');
    const segs = Object.keys(tree.props.errors as Json);
    expect(segs.length).toBeGreaterThan(4);
    const t = errorTransformer(tree, C);
    for (const [kw, seg] of Object.entries(ERROR_KEYS).filter(([, s]) => segs.includes(s))) {
      expect(t([{ name: kw, message: 'must be AJV English', stack: '', property: '.x', params: {}, schemaPath: '' }])[0]?.message).toBe(C[`admin_media_upload.errors.${seg}`]);
    }
  });
  const submitEmpty = (withTransform: boolean): string => {
    const tree = formTree(remove as never, S_DEL as never, 'static');
    const p = formProps(tree, S_DEL as never, C, { formData: { asset_id: 'a1' } }) as Json;
    if (!withTransform) delete p.transformErrors;
    render(provided(h(Form, p as never)));
    fireEvent.click(screen.getByRole('button', { name: C['admin_media_delete.submit'] as string }));
    return document.body.textContent ?? '';
  };
  it('a submitted empty confirm shows the content text, never AJV English', () => {
    const text = submitEmpty(true);
    expect(text).toContain(C['admin_media_delete.errors.required']);
    expect(text).not.toMatch(/must have required property|must NOT have fewer/);
  });
  it('RED: the same form without the transform shows AJV English', () => {
    expect(submitEmpty(false)).toMatch(/must have required property|must NOT have fewer/);
  });
});

describe('FE-33 (d) no library default text', () => {
  it('the empty LIST shows the content empty text, never "No records"', () => {
    const html = ssr(table('empty', []));
    expect(html).toContain(C['admin_media.empty']);
    expect(html).not.toContain('No records');
  });
  it('RED: with noRecordsText dropped the library default appears', () => {
    const p = listProps(list as never, listTree(list as never, 'empty'), [], C) as Json;
    delete p.noRecordsText;
    expect(ssr(h(DataTable, p as never))).toContain('No records');
  });
});

describe('FE-33 (e) colour and touch targets', () => {
  it('the primary (submit) Button carries --button-color #472a00 (On-primary)', () => {
    expect(ssr(form(upload, S_UP, 'static'))).toMatch(/--button-color:\s*#472a00/i);
  });
  it('every rendered button and input wrapper carries data-size lg or xl; the golden Modal close button is xl', () => {
    const html = ssr(h(Fragment, null, form(upload, S_UP, 'static'), table('hit', [ROW])));
    const tags = [...html.matchAll(/<(?:button|div)[^>]*class="[^"]*(?:mantine-Button-root|mantine-InputWrapper-root)[^"]*"[^>]*>/g)].map((m) => m[0]);
    console.log(`FE-33 (e): ${tags.length} buttons and input wrappers examined`);
    expect(tags.length).toBeGreaterThan(4);
    expect(tags.filter((t) => !/data-size="(?:lg|xl)"/.test(t))).toEqual([]);
    const modal = (listTree(list as never, 'hit').children ?? []).find((c) => (c as Node).component === 'Modal') as Node;
    expect((modal.props.closeButtonProps as Json).size).toBe('xl');
  });
  it('the provider layout imports only the layered library sheets T1 checks', () => {
    const text = fs.readFileSync(path.join(ROOT, 'src/app/(maxbld)/admin/layout.tsx'), 'utf8');
    const sheets = [...text.matchAll(/import '([^']+\.css)'/g)].map((m) => m[1] as string);
    expect(sheets.length).toBeGreaterThan(0);
    // The same three sheets T1 (src/tests/web-library-css.logic.test.ts SHEETS) checks for layering, by package export path.
    const known = ['@mantine/core/styles.layer.css', '@mantine/dates/styles.layer.css', 'mantine-datatable/styles.layer.css'];
    expect(fs.readFileSync(path.join(ROOT, 'src/tests/web-library-css.logic.test.ts'), 'utf8')).toContain("'node_modules/mantine-datatable/dist/styles.layer.css'");
    for (const s of sheets) expect(known).toContain(s);
  });
});
