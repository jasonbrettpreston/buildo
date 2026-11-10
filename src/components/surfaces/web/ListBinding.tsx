'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (the binding standard), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31 (descriptor + content + standard library components), FE-32 (columns bind to the contract projection), FE-33 (no library default
//            text), FE-05 (no maths in a binding module: the one comparator compares, it never computes).
//
// MF-37 · the web LIST binding (P42-D6, P42-D9 a; owner: promoted entry binding_web_list). Descriptor -> mantine-datatable props:
//   listTree(descriptor, state)              -> the props golden: refs only ({content}, {contract}) and non-display keys;
//   listProps(descriptor, tree, rows, content, sort) -> DataTable props: columns from render.list.columns showing the server display strings,
//                                                 a controlled sort over each column's sort_field, noRecordsText/loadingText from content;
//   <ListBinding/>                           -> the state alert, the DataTable, an Image per image column cell, one Button per row action, and a
//                                               Modal that holds the action's FORM (FormBinding). Nothing hand-built; every number arrives as data.
// Binding standard (MF-40 plan delta 1, option C, section 8 folds 2, 5, 9, 13): the LIST is generic. render.list declares id_field, optional rows (a
// contract path to the row array; absent = the response is the rows), columns (display text | boolean | enum | image) and row_actions (delete | edit |
// toggle_active). Keys derived by convention from <id> and the action kind: <id>.col.actions, <id>.<kind>.title, <id>.<kind>.close,
// <id>.preview.unavailable; boolean and enum cells show <label>.option.<value>. Only delete is red; delete and edit open the Modal.
import { useState, type ReactNode } from 'react';
import { Alert, Button, Image, Modal, Stack } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableProps, type DataTableSortStatus } from 'mantine-datatable';

export type Ref = { content: string } | { contract: string };
export type Node = { component: string; props: Record<string, unknown>; children?: Array<Node | Ref> };
type Column = { field: string; label: string; display: string; sort_field?: string; alt_field?: string; values?: string[] };
export type RowActionKind = 'delete' | 'edit' | 'toggle_active';
type RowAction = { kind: RowActionKind; label: string };
type ListSpec = { columns: Column[]; id_field: string; rows?: string; row_actions?: RowAction[] };
type Descriptor = { identity: { id: string }; inputs: { contract_ref: string[]; field_whitelist: string[] }; render: { list: ListSpec } };
type Option = { value: string; label: Ref };
export type ListState = 'hit' | 'empty' | 'partial' | 'degraded' | 'error' | 'unauthorized' | 'offline';
export type Row = Record<string, string | number | null>;

const WITH_ROWS: ListState[] = ['hit', 'partial', 'degraded'];
const STATE_COLOR: Partial<Record<ListState, string>> = { partial: 'yellow', degraded: 'yellow', error: 'red', unauthorized: 'red', offline: 'yellow' };
const MODAL_KINDS: RowActionKind[] = ['delete', 'edit'];
const ACTION_COLOR: Partial<Record<RowActionKind, string>> = { delete: 'red' };
const contentOf = (v: unknown): string | undefined => (typeof v === 'object' && v !== null && 'content' in v ? String((v as { content: string }).content) : undefined);

/** The option list of a boolean or enum column (content keys <label>.option.<value>); none for text and image. */
const optionsOf = (c: Column): Option[] | undefined => {
  const values = c.display === 'boolean' ? ['true', 'false'] : c.display === 'enum' ? (c.values ?? []) : undefined;
  return values?.map((v) => ({ value: v, label: { content: `${c.label}.option.${v}` } }));
};

/** The alt_field of an image column; SV-DESC requires it on a converted descriptor, so its absence throws (never an empty path). */
const altOf = (c: Column): string => {
  if (c.alt_field === undefined) throw new Error(`ListBinding: image column ${c.field} has no alt_field`);
  return c.alt_field;
};

/** The props golden of one LIST surface in one state: the record is the contract projection (one item of `rows` when declared), by ref. */
export function listTree(d: Descriptor, state: ListState): Node {
  const id = d.identity.id;
  const list = d.render.list;
  const base = list.rows !== undefined ? `${list.rows}.0` : d.inputs.contract_ref[0];
  const ref = (f: string): Ref => ({ contract: `${base}.${f}` });
  const record = Object.fromEntries(d.inputs.field_whitelist.map((f) => [f, ref(f)]));
  const actions = list.row_actions ?? [];
  const columns = [
    ...list.columns.map((c) => {
      if (c.display === 'image') return { accessor: c.field, title: { content: c.label } };
      const options = optionsOf(c);
      return { accessor: c.field, title: { content: c.label }, sortable: c.sort_field !== undefined, ...(options ? { options } : {}) };
    }),
    ...(actions.length > 0 ? [{ accessor: 'actions', title: { content: `${id}.col.actions` } }] : []),
  ];
  const image = list.columns.find((c) => c.display === 'image');
  const children: Node[] = [
    { component: 'DataTable', props: { idAccessor: list.id_field, columns, records: WITH_ROWS.includes(state) ? [record] : [], noRecordsText: { content: `${id}.empty` }, loadingText: { content: `${id}.loading` }, fetching: false } },
    ...actions.map((a): Node => ({ component: 'Button', props: { size: 'lg', variant: 'light', ...(ACTION_COLOR[a.kind] ? { color: ACTION_COLOR[a.kind] } : {}) }, children: [{ content: a.label }] })),
    ...(image ? [{ component: 'Image', props: { alt: ref(altOf(image)), fallback: { content: `${id}.preview.unavailable` } } }] : []),
    ...actions.filter((a) => MODAL_KINDS.includes(a.kind)).map((a): Node => ({ component: 'Modal', props: { title: { content: `${id}.${a.kind}.title` }, closeButtonProps: { size: 'xl', 'aria-label': { content: `${id}.${a.kind}.close` } } } })),
  ];
  const color = STATE_COLOR[state];
  if (color) children.unshift({ component: 'Alert', props: { color }, children: [{ content: `${id}.state.${state}` }] });
  return { component: 'Stack', props: {}, children };
}

const text = (content: Record<string, string>, v: unknown, where: string): string => {
  const key = contentOf(v);
  if (key === undefined) throw new Error(`ListBinding: ${where} is not a content ref`);
  const s = content[key];
  if (s === undefined) throw new Error(`ListBinding: missing content key ${key}`);
  return s;
};
const nodesOf = (tree: Node, component: string): Node[] => (tree.children ?? []).filter((c): c is Node => 'component' in c && c.component === component);
const nodeOf = (tree: Node, component: string): Node => {
  const n = nodesOf(tree, component)[0];
  if (!n) throw new Error(`ListBinding: no ${component} node`);
  return n;
};

/** The one comparator: comparison only (no arithmetic); nulls last; descending by swapped operands. */
export const compareBy = (key: string, direction: 'asc' | 'desc') => (a: Row, b: Row): number => {
  const [x, y] = direction === 'asc' ? [a[key], b[key]] : [b[key], a[key]];
  if (x === y) return 0;
  if (x === null || x === undefined) return 1;
  if (y === null || y === undefined) return -1;
  return x < y ? -1 : 1;
};

export interface ListRuntime {
  sort?: DataTableSortStatus<Row> | undefined;
  fetching?: boolean;
}

/** A boolean or enum cell: the content text of its option; an empty cell for null; a value outside the options throws. */
const optionCell = (options: Option[], accessor: string, content: Record<string, string>) => (r: Row): ReactNode => {
  const v = r[accessor];
  if (v === null || v === undefined) return null;
  const o = options.find((x) => x.value === String(v));
  if (!o) throw new Error(`ListBinding: ${accessor} value ${String(v)} is not a declared option`);
  return text(content, o.label, `${accessor} option ${o.value}`);
};

/** DataTable props: columns show the server display strings (boolean and enum through content); sorting compares each column's sort_field. */
export function listProps(d: Descriptor, tree: Node, rows: Row[], content: Record<string, string>, rt: ListRuntime = {}, cells: Record<string, (r: Row) => ReactNode> = {}) {
  const table = nodeOf(tree, 'DataTable');
  const sortOf = Object.fromEntries(d.render.list.columns.map((c) => [c.field, c.sort_field]));
  const cols = table.props.columns as Array<{ accessor: string; title: unknown; sortable?: boolean; options?: Option[] }>;
  const columns: DataTableColumn<Row>[] = cols.map((c) => {
    const render = cells[c.accessor] ?? (c.options ? optionCell(c.options, c.accessor, content) : undefined);
    return { accessor: c.accessor, title: text(content, c.title, `column ${c.accessor}`), sortable: c.sortable === true, ...(render ? { render } : {}) };
  });
  const sort = rt.sort;
  const key = sort ? (sortOf[String(sort.columnAccessor)] ?? String(sort.columnAccessor)) : undefined;
  const records = key && sort ? [...rows].sort(compareBy(key, sort.direction)) : rows;
  return {
    idAccessor: table.props.idAccessor as string,
    columns,
    records,
    noRecordsText: text(content, table.props.noRecordsText, 'noRecordsText'),
    loadingText: text(content, table.props.loadingText, 'loadingText'),
    fetching: rt.fetching === true,
    verticalSpacing: 'xs' as const,
    withTableBorder: true,
  };
}

/**
 * The LIST binding component. `onAction` hears every row action; `actionForm` renders the FORM (FormBinding) of a delete or edit action for the
 * chosen row inside the Modal (toggle_active opens none).
 */
export function ListBinding({ descriptor, tree, rows, content, onAction, actionForm }: {
  descriptor: Descriptor; tree: Node; rows: Row[]; content: Record<string, string>;
  onAction?: (row: Row, kind: RowActionKind) => void; actionForm?: (row: Row, close: () => void, kind: RowActionKind) => ReactNode;
}) {
  const list = descriptor.render.list;
  const first = list.columns.find((c) => c.sort_field !== undefined && c.display !== 'image')?.field;
  const [sort, setSort] = useState<DataTableSortStatus<Row> | undefined>(first !== undefined ? { columnAccessor: first, direction: 'asc' } : undefined);
  const [chosen, setChosen] = useState<{ row: Row; kind: RowActionKind } | null>(null);
  const alert = (tree.children ?? []).find((c): c is Node => 'component' in c && c.component === 'Alert');
  const actions = list.row_actions ?? [];
  const buttons = nodesOf(tree, 'Button');
  const modals = nodesOf(tree, 'Modal');
  const modalOf = (kind: RowActionKind): Node | undefined => modals[actions.filter((a) => MODAL_KINDS.includes(a.kind)).findIndex((a) => a.kind === kind)];
  const cells: Record<string, (r: Row) => ReactNode> = {};
  const imageCol = list.columns.find((c) => c.display === 'image');
  if (imageCol) {
    const image = nodeOf(tree, 'Image');
    const alt = altOf(imageCol);
    cells[imageCol.field] = (r: Row) => (r[imageCol.field] ? <Image src={String(r[imageCol.field])} alt={String(r[alt])} className="h-12 w-auto object-contain" /> : text(content, image.props.fallback, 'preview fallback'));
  }
  if (actions.length > 0) {
    cells.actions = (r: Row) => actions.map((a, i) => (
      <Button key={a.kind} size="lg" variant="light" {...(buttons[i]?.props.color ? { color: buttons[i]?.props.color as string } : {})} onClick={() => { if (MODAL_KINDS.includes(a.kind)) setChosen({ row: r, kind: a.kind }); onAction?.(r, a.kind); }}>
        {text(content, buttons[i]?.children?.[0], `${a.kind} button`)}
      </Button>
    ));
  }
  const props = listProps(descriptor, tree, rows, content, { sort }, cells);
  const modal = chosen ? modalOf(chosen.kind) : modals[0];
  return (
    <Stack>
      {alert ? <Alert color={alert.props.color as string}>{text(content, alert.children?.[0], 'state alert')}</Alert> : null}
      <DataTable<Row> {...({ ...props, sortStatus: sort, onSortStatusChange: setSort } as DataTableProps<Row>)} />
      {modal ? (
        <Modal opened={chosen !== null} onClose={() => setChosen(null)} title={text(content, modal.props.title, 'modal title')} closeButtonProps={{ size: 'xl', 'aria-label': text(content, (modal.props.closeButtonProps as Record<string, unknown>)['aria-label'], 'close label') }}>
          {chosen && actionForm ? actionForm(chosen.row, () => setChosen(null), chosen.kind) : null}
        </Modal>
      ) : null}
    </Stack>
  );
}
