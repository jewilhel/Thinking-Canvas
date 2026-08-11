import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";

describe("Home", () => {
  it("describes the Milestone 0 foundation", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "A durable place to think together.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Milestone 0")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Foundation status" }),
    ).toBeInTheDocument();
  });
});
