'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (the binding standard), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31 (descriptor + content + standard library components configured by schema), FE-33 (every displayed string from content, library
//            defaults and form errors included), FE-05 (no maths in a binding module).
//
// MF-37 · the web FORM binding (P42-D1 a, P42-D9 a; owner: promoted entry binding_web_form). Descriptor -> RJSF props on the Mantine theme:
//   formTree(descriptor, schema, state)  -> the props golden: a node tree holding only binding refs ({content}) and non-display keys;
//   formProps(tree, schema, content, rt) -> the RJSF props: uiSchema GENERATED from the tree, enum titles from option keys, transformErrors -> content;
//   <FormBinding/>                       -> <Form {...formProps}/> plus the state alert, nothing hand-built.
// No display text lives here; a missing content key or an unknown widget throws.
import { Alert, Stack } from '@mantine/core';
import Form from '@rjsf/mantine';
import type { FormProps, IChangeEvent } from '@rjsf/core';
import type { RJSFSchema, RJSFValidationError, UiSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';

export type Ref = { content: string };
export type Node = { component: string; props: Record<string, unknown>; children?: Array<Node | Ref> };
type Schema = { type?: string; properties: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties?: boolean };
type Field = { field: string; widget: string; label?: string; help?: string; placeholder?: string };
type Descriptor = { identity: { id: string }; render: { form: { fields: Field[]; submit: string } } };
export type FormState = 'static' | 'loading' | 'error' | 'hit' | 'unauthorized' | 'offline';

/** widget (bindings.json widget_types) -> [the library component RJSF's Mantine theme renders, the RJSF widget id]. */
export const WIDGETS: Record<string, [string, string]> = {
  text: ['TextInput', 'text'], textarea: ['Textarea', 'textarea'], number: ['NumberInput', 'updown'], select: ['Select', 'select'],
  file: ['FileInput', 'file'], checkbox: ['Checkbox', 'checkbox'], date: ['DateInput', 'date'], hidden: ['hidden', 'hidden'],
};
/** AJV keyword -> the content key segment of its message (content keys are [a-z0-9_]). */
export const ERROR_KEYS: Record<string, string> = {
  required: 'required', type: 'type', enum: 'enum', const: 'const', pattern: 'pattern', format: 'format', minLength: 'min_length',
  maxLength: 'max_length', minimum: 'minimum', maximum: 'maximum', additionalProperties: 'additional_properties',
};
const STATE_COLOR: Partial<Record<FormState, string>> = { error: 'red', unauthorized: 'red', offline: 'yellow', hit: 'green' };
const isRef = (v: unknown): v is Ref => typeof v === 'object' && v !== null && Object.keys(v).length === 1 && typeof (v as Ref).content === 'string';

/** The AJV keywords the schema (and the run-time confirm const) can raise, in a stable order. */
const keywordsOf = (schema: Schema): string[] => {
  const used = new Set<string>(['type', 'const']); // const: the run-time confirm value (FormRuntime.constants)
  if ((schema.required ?? []).length > 0) used.add('required');
  if (schema.additionalProperties === false) used.add('additionalProperties');
  for (const p of Object.values(schema.properties)) for (const k of Object.keys(p)) if (k in ERROR_KEYS) used.add(k);
  return Object.keys(ERROR_KEYS).filter((k) => used.has(k));
};

/** The props golden of one FORM surface in one state (refs only). */
export function formTree(d: Descriptor, schema: Schema, state: FormState): Node {
  const id = d.identity.id;
  const fields: Node[] = d.render.form.fields.map((f) => {
    const w = WIDGETS[f.widget];
    if (!w) throw new Error(`FormBinding: unknown widget ${f.widget} (${id}.${f.field})`);
    if (f.widget === 'hidden') return { component: 'hidden', props: { name: f.field } };
    const props: Record<string, unknown> = { name: f.field, size: 'lg' };
    if (f.label) props.label = { content: f.label };
    if (f.help) props.description = { content: f.help };
    if (f.placeholder) props.placeholder = { content: f.placeholder };
    const options = schema.properties[f.field]?.enum;
    if (f.widget === 'select' && Array.isArray(options)) props.data = options.map((v) => ({ value: String(v), label: { content: `${f.label}.option.${String(v)}` } }));
    return { component: w[0], props };
  });
  const errors = Object.fromEntries(keywordsOf(schema).map((k) => [ERROR_KEYS[k], { content: `${id}.errors.${ERROR_KEYS[k]}` }]));
  const children: Node[] = [...fields, { component: 'Button', props: { type: 'submit', size: 'lg', loading: state === 'loading' }, children: [{ content: d.render.form.submit }] }];
  const color = STATE_COLOR[state];
  if (color) children.unshift({ component: 'Alert', props: { color }, children: [{ content: `${id}.state.${state}` }] });
  return { component: 'Form', props: { name: id, errors }, children };
}

const text = (content: Record<string, string>, v: unknown, where: string): string => {
  if (!isRef(v)) throw new Error(`FormBinding: ${where} is not a content ref`);
  const s = content[v.content];
  if (s === undefined) throw new Error(`FormBinding: missing content key ${v.content}`);
  return s;
};

/** The pure transform the Form uses: every AJV error message becomes this surface's content text for its keyword. */
export const errorTransformer = (tree: Node, content: Record<string, string>) => (errors: RJSFValidationError[]): RJSFValidationError[] =>
  errors.map((e) => {
    const seg = ERROR_KEYS[e.name ?? ''];
    const ref = seg ? (tree.props.errors as Record<string, Ref>)[seg] : undefined;
    if (!ref) throw new Error(`FormBinding: no content for error keyword ${e.name}`);
    const message = text(content, ref, `error ${e.name}`);
    return { ...e, message, stack: message };
  });

export interface FormRuntime {
  formData?: Record<string, unknown>;
  disabled?: boolean;
  /** Run-time `const` per field (the delete confirm: the row's alt text), re-checked by the server. */
  constants?: Record<string, string>;
  onSubmit?: (data: Record<string, unknown>) => void;
}

/** RJSF props from the golden tree: generated uiSchema, enum titles from content, constants per MF-42 section 8. */
export function formProps(tree: Node, schema: Schema, content: Record<string, string>, rt: FormRuntime = {}): FormProps<Record<string, unknown>, RJSFSchema> {
  const props: Record<string, Record<string, unknown>> = structuredClone(schema.properties);
  const uiSchema: UiSchema = {};
  const nodes = (tree.children ?? []).filter((c): c is Node => !isRef(c));
  for (const n of nodes) {
    const name = n.props.name as string | undefined;
    if (n.component === 'Alert' || n.component === 'Button' || name === undefined) continue;
    const widget = Object.values(WIDGETS).find(([c]) => c === n.component);
    if (!widget) throw new Error(`FormBinding: unknown component ${n.component}`);
    if (n.component === 'hidden') { uiSchema[name] = { 'ui:widget': 'hidden' }; continue; }
    const ui: Record<string, unknown> = { 'ui:widget': widget[1], 'ui:title': text(content, n.props.label, `${name} label`), 'ui:options': { size: 'lg' } };
    if (n.props.description) ui['ui:description'] = text(content, n.props.description, `${name} help`);
    if (n.props.placeholder) ui['ui:placeholder'] = text(content, n.props.placeholder, `${name} placeholder`);
    uiSchema[name] = ui;
    const data = n.props.data as Array<{ value: string; label: Ref }> | undefined;
    if (data && props[name]) {
      const { enum: _drop, ...rest } = props[name]; // eslint-disable-line @typescript-eslint/no-unused-vars -- enum is replaced by oneOf with titles
      props[name] = { ...rest, oneOf: data.map((o) => ({ const: o.value, title: text(content, o.label, `${name} option ${o.value}`) })) };
    }
  }
  for (const [k, v] of Object.entries(rt.constants ?? {})) if (props[k]) props[k] = { ...props[k], const: v };
  const submit = nodes.find((n) => n.component === 'Button');
  if (!submit) throw new Error('FormBinding: no submit node');
  uiSchema['ui:submitButtonOptions'] = { submitText: text(content, submit.children?.[0], 'submit'), props: { size: 'lg', loading: submit.props.loading === true, disabled: rt.disabled === true } };
  return {
    schema: { ...schema, properties: props } as RJSFSchema,
    uiSchema,
    validator,
    formData: rt.formData,
    disabled: rt.disabled,
    showErrorList: false,
    noHtml5Validate: true,
    liveValidate: false,
    idPrefix: tree.props.name as string,
    transformErrors: errorTransformer(tree, content),
    onSubmit: (e: IChangeEvent<Record<string, unknown>>) => rt.onSubmit?.(e.formData ?? {}),
  } as FormProps<Record<string, unknown>, RJSFSchema>;
}

/** The FORM binding component: the state alert (from content) and the RJSF Form; nothing else. */
export function FormBinding({ tree, schema, content, runtime }: { tree: Node; schema: Schema; content: Record<string, string>; runtime?: FormRuntime }) {
  const alert = (tree.children ?? []).find((c): c is Node => !isRef(c) && c.component === 'Alert');
  return (
    <Stack>
      {alert ? <Alert color={alert.props.color as string}>{text(content, alert.children?.[0], 'state alert')}</Alert> : null}
      <Form {...formProps(tree, schema, content, runtime)} />
    </Stack>
  );
}
