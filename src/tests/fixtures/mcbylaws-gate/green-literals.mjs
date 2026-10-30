export function g(row, l2) { return row.status === 'not_evaluated' ? 0 : l2(row, 'side_yard_m') * 2 / 100 + 1 - -1; }
