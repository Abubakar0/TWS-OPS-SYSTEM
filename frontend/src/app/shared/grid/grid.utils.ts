export type GridSortDirection = 'asc' | 'desc';

export interface GridSortState {
  active: string;
  direction: GridSortDirection;
}

const normalizeValue = (value: unknown): string | number => {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const stringValue = String(value).trim();
  const numericValue = Number(stringValue);

  if (stringValue && Number.isFinite(numericValue) && `${numericValue}` === stringValue) {
    return numericValue;
  }

  return stringValue.toLowerCase();
};

const compareValues = (left: unknown, right: unknown): number => {
  const normalizedLeft = normalizeValue(left);
  const normalizedRight = normalizeValue(right);

  if (normalizedLeft < normalizedRight) {
    return -1;
  }

  if (normalizedLeft > normalizedRight) {
    return 1;
  }

  return 0;
};

export const sortRecords = <T>(
  records: T[],
  state: GridSortState,
  accessor: (record: T, key: string) => unknown,
): T[] => {
  const direction = state.direction === 'desc' ? -1 : 1;

  return [...records].sort((left, right) => compareValues(accessor(left, state.active), accessor(right, state.active)) * direction);
};

export const paginateRecords = <T>(records: T[], pageIndex: number, pageSize: number): T[] => {
  const start = pageIndex * pageSize;
  return records.slice(start, start + pageSize);
};

export const clampPageIndex = (total: number, pageSize: number, pageIndex: number): number => {
  if (pageSize <= 0) {
    return 0;
  }

  const maxPageIndex = Math.max(0, Math.ceil(total / pageSize) - 1);
  return Math.min(Math.max(pageIndex, 0), maxPageIndex);
};
