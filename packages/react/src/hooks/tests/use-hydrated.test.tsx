import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useHydrated } from "../use-hydrated";

afterEach(cleanup);

function Where() {
  return <span data-testid="where">{useHydrated() ? "browser" : "server"}</span>;
}

function Counting({ onRender }: { readonly onRender: () => void }) {
  useHydrated();
  onRender();

  return null;
}

describe("useHydrated", () => {
  it("reports the browser once React has mounted", () => {
    render(<Where />);

    expect(screen.getByTestId("where").textContent).toBe("browser");
  });

  it("holds one identity per answer, so a snapshot settles", () => {
    let renders = 0;

    render(
      <Counting
        onRender={() => {
          renders += 1;
        }}
      />,
    );

    expect(renders).toBe(1);
  });
});
