/** @jest-environment node */
// SPEC LINK: docs/specs/00-architecture/117_maxbld_brand.md §5 (no placeholder art; the mark survives circular masking; dated note 2026-11-26).
//
// task-313 McApp card 1 (PLAN-313-v1 M9, T10; RR-0506 "the phone icon logo - this should be added as well to the existing task", RR-0509 "just the icon
// with out the name"): the three icon files app.json names exist, none is an Expo template file, icon.png is 1024 x 1024 with no alpha channel (iOS), the
// adaptive foreground is 1024 x 1024, and the Android adaptive background is the paper colour #f4f1eb. node fs only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MOBILE = path.resolve(__dirname, '..');
const app = (JSON.parse(fs.readFileSync(path.join(MOBILE, 'app.json'), 'utf8')) as { expo: { icon: string; android: { adaptiveIcon: { foregroundImage: string; backgroundColor: string } }; web: { favicon: string } } }).expo;
/** The sha256 of the Expo template files (icon.png; adaptive-icon.png and splash-icon.png; favicon.png). */
const TEMPLATE = new Set([
  '74c64047eb557b1341bba7a2831eedde9ddb705e6451a9ad9f5552bf558f13de',
  '5f4c0a732b6325bf4071d9124d2ae67e037cb24fcc9c482ef82bea742109a3b8',
  '24272cdaeff82cc5facdaccd982a6f05b60c4504704bbf94c19a6388659880bb',
]);
const sha = (b: Buffer): string => crypto.createHash('sha256').update(b).digest('hex');
/** PNG IHDR: width, height and colour type (2 = RGB, no alpha; 6 = RGBA). */
const ihdr = (b: Buffer) => ({ png: b.subarray(1, 4).toString('latin1') === 'PNG', width: b.readUInt32BE(16), height: b.readUInt32BE(20), colourType: b[25] });

/** The icon rules on the three files as read; a plant swaps one buffer. */
export function iconProblems(files: Record<'icon' | 'adaptive' | 'favicon', Buffer | null>): string[] {
  const out: string[] = [];
  for (const [k, b] of Object.entries(files)) {
    if (b === null) { out.push(`${k}: missing`); continue; }
    if (TEMPLATE.has(sha(b))) out.push(`${k}: an Expo template file`);
    if (!ihdr(b).png) out.push(`${k}: not a PNG`);
  }
  const i = files.icon && ihdr(files.icon);
  if (i && (i.width !== 1024 || i.height !== 1024 || i.colourType !== 2)) out.push(`icon: ${i.width}x${i.height} colour type ${i.colourType}, want 1024x1024 type 2`);
  const a = files.adaptive && ihdr(files.adaptive);
  if (a && (a.width !== 1024 || a.height !== 1024)) out.push(`adaptive: ${a.width}x${a.height}, want 1024x1024`);
  return out;
}

const read = (rel: string): Buffer | null => { const p = path.join(MOBILE, rel); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
const REAL = { icon: read(app.icon), adaptive: read(app.android.adaptiveIcon.foregroundImage), favicon: read(app.web.favicon) };

describe('the phone icon (task-313 M9)', () => {
  it('app.json names the three files at their places', () => {
    expect([app.icon, app.android.adaptiveIcon.foregroundImage, app.web.favicon]).toEqual(['./assets/icon.png', './assets/adaptive-icon.png', './assets/favicon.png']);
  });
  it('the three files exist, none is a template, icon.png is 1024 opaque, the adaptive foreground is 1024', () => {
    expect(iconProblems(REAL)).toEqual([]);
  });
  it('the Android adaptive background is the paper colour #f4f1eb; the splash keeps #09090b and no image (M7)', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(MOBILE, 'app.json'), 'utf8')).expo;
    expect(app.android.adaptiveIcon.backgroundColor).toBe('#f4f1eb');
    expect(raw.splash).toEqual({ resizeMode: 'contain', backgroundColor: '#09090b' });
  });
  it('planted: a copy of a template file under the icon name is found', () => {
    const tmpl = read('assets/splash-icon.png');
    expect(tmpl).not.toBeNull();
    expect(iconProblems({ ...REAL, icon: tmpl })).toEqual(expect.arrayContaining(['icon: an Expo template file']));
  });
  it('planted: an icon with an alpha channel is found', () => {
    expect(iconProblems({ ...REAL, icon: REAL.adaptive })).toEqual(expect.arrayContaining(['icon: 1024x1024 colour type 6, want 1024x1024 type 2']));
  });
});
