import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";

describe("root page", () => {
  it("provides PatchCAD in a main landmark", () => {
    render(<Page />);

    expect(screen.getByRole("main")).toHaveTextContent("PatchCAD");
  });
});
