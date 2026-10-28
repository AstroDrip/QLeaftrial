import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { content } from "../content/en";
vi.mock("./features/catalog/product-api", () => ({ productApi: { list: vi.fn(), detail: vi.fn(), filters: vi.fn() } }));
describe("App", () => { it("renders the QLeaves landmark and brand link", () => { render(<App />); expect(screen.getByRole("main")).toBeInTheDocument(); expect(screen.getByRole("link", { name: /QLeaves home/i })).toBeInTheDocument(); expect(screen.getByLabelText(content.brand)).toBeInTheDocument(); }); });
