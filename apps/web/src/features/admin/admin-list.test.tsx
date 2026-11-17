import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminPager, pageNumbers, restoreCachedLists, updateCachedLists } from "./admin-list";

describe("admin pager", () => {
  afterEach(cleanup);

  it("shows the pages around the current one with gaps", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(5, 20)).toEqual([1, "gap", 4, 5, 6, "gap", 20]);
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });

  it("moves between pages, changes the page size and says what is shown", () => {
    const onPage = vi.fn();
    const onPageSize = vi.fn();
    render(<AdminPager page={2} pageSize={25} totalItems={60} totalPages={3} isArabic={false} onPage={onPage} onPageSize={onPageSize} />);
    expect(screen.getByText("26–50 of 60")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Page 1" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Per page" }), { target: { value: "100" } });
    expect(onPage.mock.calls).toEqual([[3], [1]]);
    expect(onPageSize).toHaveBeenCalledWith(100);
  });

  it("is hidden for an empty list", () => {
    const { container } = render(<AdminPager page={1} pageSize={25} totalItems={0} totalPages={1} isArabic onPage={vi.fn()} onPageSize={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("cached admin lists", () => {
  it("changes an item in every cached list and page, and can put them back", () => {
    const client = new QueryClient();
    client.setQueryData(["admin", "orders"], [{ id: "a", status: "PENDING" }]);
    client.setQueryData(["admin", "orders", "page", { page: 1 }], { items: [{ id: "a", status: "PENDING" }], page: 1, pageSize: 25, totalItems: 1, totalPages: 1 });
    const previous = updateCachedLists<{ id: string; status: string }>(client, ["admin", "orders"], (items) => items.map((item) => ({ ...item, status: "CONFIRMED" })));
    expect(client.getQueryData(["admin", "orders"])).toEqual([{ id: "a", status: "CONFIRMED" }]);
    expect(client.getQueryData<{ items: unknown[] }>(["admin", "orders", "page", { page: 1 }])?.items).toEqual([{ id: "a", status: "CONFIRMED" }]);
    restoreCachedLists(client, previous);
    expect(client.getQueryData(["admin", "orders"])).toEqual([{ id: "a", status: "PENDING" }]);
  });
});
