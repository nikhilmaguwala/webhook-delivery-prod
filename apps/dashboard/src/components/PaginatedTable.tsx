"use client";

import { Icon } from "@/components/Icon";

export type PaginationMeta = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type SortOrder = "asc" | "desc";

export type TableColumn<T> = {
  id: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
};

type FilterOption = {
  value: string;
  label: string;
};

type PaginatedTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pagination: PaginationMeta | null;
  loading?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  searchValue: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  sort: string;
  order: SortOrder;
  onSortChange: (column: string) => void;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  filterLabel?: string;
  filterValue?: string;
  filterOptions?: FilterOption[];
  onFilterChange?: (value: string) => void;
  secondaryFilterLabel?: string;
  secondaryFilterValue?: string;
  secondaryFilterOptions?: FilterOption[];
  onSecondaryFilterChange?: (value: string) => void;
};

export function PaginatedTable<T>({
  columns,
  rows,
  rowKey,
  pagination,
  loading,
  emptyTitle,
  emptyDescription,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  sort,
  order,
  onSortChange,
  onPageChange,
  pageSize,
  onPageSizeChange,
  filterLabel,
  filterValue,
  filterOptions,
  onFilterChange,
  secondaryFilterLabel,
  secondaryFilterValue,
  secondaryFilterOptions,
  onSecondaryFilterChange,
}: PaginatedTableProps<T>) {
  const start = pagination ? (pagination.page - 1) * pagination.page_size + 1 : 0;
  const end = pagination ? Math.min(pagination.page * pagination.page_size, pagination.total) : rows.length;

  return (
    <div className="paginated-table">
      <div className="table-toolbar">
        <div className="table-search-wrap">
          <Icon name="search" size={18} />
          <input
            className="input table-search"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {filterOptions && onFilterChange && (
          <label className="table-filter">
            <span>{filterLabel}</span>
            <select className="input" value={filterValue || ""} onChange={(e) => onFilterChange(e.target.value)}>
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {secondaryFilterOptions && onSecondaryFilterChange && (
          <label className="table-filter">
            <span>{secondaryFilterLabel}</span>
            <select
              className="input"
              value={secondaryFilterValue || ""}
              onChange={(e) => onSecondaryFilterChange(e.target.value)}
            >
              {secondaryFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="table-filter">
          <span>Rows</span>
          <select
            className="input"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="table-loading">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state" style={{ padding: "40px 16px" }}>
          <h3 style={{ marginBottom: 8 }}>{emptyTitle}</h3>
          {emptyDescription && (
            <p style={{ color: "var(--on-surface-variant)", fontSize: 14 }}>{emptyDescription}</p>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.id} className={column.className}>
                    {column.sortable ? (
                      <button
                        type="button"
                        className={`table-sort-btn ${sort === column.id ? "active" : ""}`}
                        onClick={() => onSortChange(column.id)}
                      >
                        <span>{column.label}</span>
                        {sort === column.id && (
                          <Icon name={order === "asc" ? "arrow_upward" : "arrow_downward"} size={16} />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.id} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.total > 0 && (
        <div className="table-pagination">
          <span className="table-pagination-meta">
            Showing {start}–{end} of {pagination.total.toLocaleString()}
          </span>
          <div className="table-pagination-actions">
            <button
              className="btn btn-secondary btn-sm"
              disabled={!pagination.has_prev}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              <Icon name="chevron_left" size={18} />
              Previous
            </button>
            <span className="table-pagination-page">
              Page {pagination.page} of {pagination.total_pages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={!pagination.has_next}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
              <Icon name="chevron_right" size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
