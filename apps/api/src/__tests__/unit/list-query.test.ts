import { describe, expect, it } from "vitest";
import { buildPaginationMeta, parseListQuery } from "../../lib/list-query";

describe("parseListQuery", () => {
  it("uses defaults", () => {
    const result = parseListQuery({}, {
      defaultSort: "created_at",
      allowedSorts: ["created_at", "event_type"],
    });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
    expect(result.offset).toBe(0);
    expect(result.sort).toBe("created_at");
    expect(result.order).toBe("desc");
  });

  it("clamps page size and validates sort", () => {
    const result = parseListQuery(
      { page: "2", page_size: "500", sort: "invalid", order: "asc", search: "  invoice  " },
      {
        defaultSort: "created_at",
        allowedSorts: ["created_at", "status"],
        maxPageSize: 100,
      }
    );

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(100);
    expect(result.offset).toBe(100);
    expect(result.sort).toBe("created_at");
    expect(result.order).toBe("asc");
    expect(result.search).toBe("invoice");
  });
});

describe("buildPaginationMeta", () => {
  it("calculates pages and navigation flags", () => {
    expect(buildPaginationMeta(1, 25, 60)).toEqual({
      page: 1,
      page_size: 25,
      total: 60,
      total_pages: 3,
      has_next: true,
      has_prev: false,
    });

    expect(buildPaginationMeta(3, 25, 60).has_next).toBe(false);
    expect(buildPaginationMeta(3, 25, 60).has_prev).toBe(true);
  });
});
