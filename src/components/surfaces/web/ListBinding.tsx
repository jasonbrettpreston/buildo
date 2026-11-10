'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b (the binding standard), docs/specs/02-web-admin/135_mcfrontend_decisions_register.md
//            FE-31 (descriptor + content + standard library components), FE-32 (columns bind to the contract projection), FE-33 (no library default
//            text), FE-05 (no maths in a binding module: the one comparator compares, it never computes).
//
// MF-37 · the web LIST binding (P42-D6, P42-D9 a; owner: promoted entry binding_web_list). Descriptor -> mantine-datatable props:
//   listTree(descriptor, state)              -> the props golden: refs only ({content}, {contract}) and non-display keys;
//   listProps(descriptor, tree, rows, content, sort) -> DataTable props: columns from render.list.columns showing the server display strings,
//                                                 a controlled sort over each column's sort_field, noRecordsText/loadingText from content;
//   <ListBinding/>                           -> the state alert, the DataTable, a preview Image and a delete Button per row, and a Modal that
//                                               holds the delete FORM (FormBinding). Nothing hand-built; every number arrives as data.
import { useState, type ReactNode } from 'react';
import { Alert, Button, Image, Modal, Stack } from '@mantine/core';
import { DataTable, type DataTableColumn, type DataTableProps, type DataTableSortStatus } from 'mantine-datatable';

export type Ref = { content: string } | { contract: string };
export type Node = { component: string; props: Record<string, unknown>; children?: Array<Node | Ref> };
type Column = { field: string; label: string; display: string; sort_field?: string };
type Descriptor = { identity: { id: string }; inputs: { contract_ref: string[]; field_whitelist: string[] }; render: { list: { columns: Column[] } } };
export type ListState = 'hit' | 'empty' | 'partial' | 'degraded' | 'error' | 'unauthorized' | 'offline';
export type Row = Record<string, string | number | null>;

const WITH_ROWS: ListState[] = ['hit', 'partial', 'degraded'];
const STATE_COLOR: Partial<Record<ListState, string>> = { partial: 'yellow', degraded: 'yellow', error: 'red', unauthorized: 'red', offline: 'yellow' };
const contentOf = (v: unknown): string | undefined => (typeof v === 'object' && v !== null && 'content' in v ? String((v as { content: string }).content) : undefined);

/** The props golden of one LIST surface in one state: the record is the contract projection, by ref. */
export function listTree(d: Descriptor, state: ListState): Node {
  const id = d.identity.id;
  const contract = d.inputs.contract_ref[0];
  const record = Object.fromEntries(d.inputs.field_whitelist.map((f) => [f, { contract: `${contract}.${f}` }]));
  const columns = [
    { accessor: 'signed_url', title: { content: `${id}.col.preview` } },
    ...d.render.list.columns.map((c) => ({ accessor: c.field, title: { content: c.label }, sortable: c.sort_field !== undefined })),
    { accessor: 'actions', title: { content: `${id}.col.actions` } },
  ];
  const children: Node[] = [
    { component: 'DataTable', props: { idAccessor: 'asset_id', columns, records: WITH_ROWS.includes(state) ? [record] : [], noRecordsText: { content: `${id}.empty` }, loadingText: { content: `${id}.loading` }, fetching: false } },
    { component: 'Button', props: { size: 'lg', variant: 'light', color: 'red' }, children: [{ content: `${id}.action.delete` }] },
    { component: 'Image', props: { alt: { contract: `${contract}.alt` }, fallback: { content: `${id}.preview.unavailable` } } },
    { component: 'Modal', props: { title: { content: `${id}.delete.title` }, closeButtonProps: { size: 'xl', 'aria-label': { content: `${id}.delete.close` } } } },
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
const nodeOf = (tree: Node, component: string): Node => {
  const n = (tree.children ?? []).find((c): c is Node => 'component' in c && c.component === component);
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
  onDelete?: (row: Row) => void;
  fetching?: boolean;
}

/** DataTable props: columns show the server display strings; sorting compares each column's sort_field. */
export function listProps(d: Descriptor, tree: Node, rows: Row[], content: Record<string, string>, rt: ListRuntime = {}, cells: { preview?: (r: Row) => ReactNode; action?: (r: Row) => ReactNode } = {}) {
  const table = nodeOf(tree, 'DataTable');
  const sortOf = Object.fromEntries(d.render.list.columns.map((c) => [c.field, c.sort_field]));
  const cols = table.props.columns as Array<{ accessor: string; title: unknown; sortable?: boolean }>;
  const columns: DataTableColumn<Row>[] = cols.map((c) => ({
    accessor: c.accessor,
    title: text(content, c.title, `column ${c.accessor}`),
    sortable: c.sortable === true,
    ...(c.accessor === 'signed_url' && cells.preview ? { render: cells.preview } : {}),
    ...(c.accessor === 'actions' && cells.action ? { render: cells.action } : {}),
  }));
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

/** The LIST binding component. `deleteForm` renders the delete FORM (FormBinding) for the chosen row inside the Modal. */
export function ListBinding({ descriptor, tree, rows, content, onDelete, deleteForm }: {
  descriptor: Descriptor; tree: Node; rows: Row[]; content: Record<string, string>;
  onDelete?: (row: Row) => void; deleteForm?: (row: Row, close: () => void) => ReactNode;
}) {
  const first = descriptor.render.list.columns[0]?.field ?? 'kind';
  const [sort, setSort] = useState<DataTableSortStatus<Row>>({ columnAccessor: first, direction: 'asc' });
  const [chosen, setChosen] = useState<Row | null>(null);
  const alert = (tree.children ?? []).find((c): c is Node => 'component' in c && c.component === 'Alert');
  const button = nodeOf(tree, 'Button');
  const image = nodeOf(tree, 'Image');
  const modal = nodeOf(tree, 'Modal');
  const closeLabel = text(content, (modal.props.closeButtonProps as Record<string, unknown>)['aria-label'], 'close label');
  const preview = (r: Row) => (r.signed_url ? <Image src={String(r.signed_url)} alt={String(r.alt)} className="h-12 w-auto object-contain" /> : text(content, image.props.fallback, 'preview fallback'));
  const action = (r: Row) => (
    <Button size="lg" variant="light" color="red" onClick={() => { setChosen(r); onDelete?.(r); }}>{text(content, button.children?.[0], 'delete button')}</Button>
  );
  const props = listProps(descriptor, tree, rows, content, { sort }, { preview, action });
  return (
    <Stack>
      {alert ? <Alert color={alert.props.color as string}>{text(content, alert.children?.[0], 'state alert')}</Alert> : null}
      <DataTable<Row> {...({ ...props, sortStatus: sort, onSortStatusChange: setSort } as DataTableProps<Row>)} />
      <Modal opened={chosen !== null} onClose={() => setChosen(null)} title={text(content, modal.props.title, 'modal title')} closeButtonProps={{ size: 'xl', 'aria-label': closeLabel }}>
        {chosen && deleteForm ? deleteForm(chosen, () => setChosen(null)) : null}
      </Modal>
    </Stack>
  );
}
