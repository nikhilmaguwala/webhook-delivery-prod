export type SortOrder = "asc" | "desc";

export type PaginationMeta = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
};

export type ParsedListQuery = {
  page: number;
  pageSize: number;
  offset: number;
  search?: string;
  sort: string;
  order: SortOrder;
};

export function parseListQuery(
  query: Record<string, string | undefined>,
  options: {
    defaultSort: string;
    allowedSorts: string[];
    defaultPageSize?: number;
    maxPageSize?: number;
  }
): ParsedListQuery {
  const page = Math.max(1, Number.parseInt(query.page || "1", 10) || 1);
  const maxPageSize = options.maxPageSize ?? 100;
  const defaultPageSize = options.defaultPageSize ?? 25;
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Number.parseInt(query.page_size || String(defaultPageSize), 10) || defaultPageSize)
  );
  const sort = options.allowedSorts.includes(query.sort || "")
    ? (query.sort as string)
    : options.defaultSort;
  const order: SortOrder = query.order === "asc" ? "asc" : "desc";
  const search = query.search?.trim() || undefined;

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search,
    sort,
    order,
  };
}

export function buildPaginationMeta(page: number, pageSize: number, total: number): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    page_size: pageSize,
    total,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1,
  };
}
