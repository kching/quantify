import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act } from "react";

if (typeof window === "undefined") GlobalRegistrator.register();
const reactTestGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactTestGlobal.IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render, screen } =
  await import("@testing-library/react");
const { default: ResearchPage } = await import("./research");

const result = {
  symbol: "MQG.AX",
  strategyId: "klinger-oscillator",
  initialBalance: 10_000,
  finalBalance: 11_250,
  strategyReturnPct: 12.5,
  buyAndHoldReturnPct: 8,
  totalReturnPct: 4.5,
  winRatePct: 60,
  maxDrawdownPct: -8.2,
  trades: [
    { entryDate: 1, exitDate: 2, entryPrice: 100, exitPrice: 110, pnlPct: 10 },
  ],
};

let status = 200;
const fetchMock = mock(async (url: string): Promise<Response> => {
  void url;
  return status === 200
    ? Response.json({ results: [result] })
    : Response.json({ error: "Not enough hourly candles." }, { status });
});

beforeEach(() => {
  status = 200;
  fetchMock.mockClear();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(async () => {
  await cleanup();
});

describe("ResearchPage", () => {
  it("runs a selected strategy sweep and shows the results workspace", async () => {
    render(<ResearchPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "Run parameter sweep" }),
    );

    expect(
      await screen.findByText("Strategy return vs drawdown"),
    ).toBeDefined();
    expect(screen.getByText("Buy-and-hold return")).toBeDefined();
    expect(screen.getByText("Maximum return")).toBeDefined();
    expect(
      screen.getAllByText("+61.2% p.a. (+24.6% p.a.)"),
    ).toHaveLength(2);
    expect(
      screen.getByRole("img", { name: "Buy-and-hold return +36.6% p.a." }),
    ).toBeDefined();
    expect(screen.queryByText("Strategy return")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Select run 1" }));
    expect(
      screen.getByRole("img", { name: "Buy-and-hold return +36.6% p.a." }),
    ).toBeDefined();
    expect(screen.getByText("Strategy return (p.a.)")).toBeDefined();
    expect(screen.getByText("Lowest drawdown")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("cadence=hourly");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("days=90");
  });

  it("shows an API error when the backtest cannot run", async () => {
    status = 422;
    render(<ResearchPage />);
    fireEvent.click(
      screen.getByRole("button", { name: "Run parameter sweep" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Not enough hourly candles.",
    );
  });

  it("validates the symbol field when it loses focus", () => {
    render(<ResearchPage />);
    const symbol = screen.getByRole("textbox", { name: "Ticker for backtest" });
    fireEvent.change(symbol, { target: { value: "" } });
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByText("Symbol is required.")).toBeNull();
    fireEvent.blur(symbol);
    expect(screen.getByText("Symbol is required.")).toBeDefined();
    expect(symbol.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(symbol, { target: { value: "QQQ" } });
    expect(screen.queryByText("Symbol is required.")).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("uses each parameter step when generating the sweep", async () => {
    render(<ResearchPage />);

    await act(async () => {
      fireEvent.change(
        screen.getByRole("spinbutton", { name: "Fast period step" }),
        { target: { value: "5" } },
      );
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Run parameter sweep" }),
    );

    expect(
      await screen.findByText("Strategy return vs drawdown"),
    ).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      encodeURIComponent("[5,40,5]"),
    );
  });

  it("allows intermediate range values while typing and validates on blur", async () => {
    render(<ResearchPage />);
    const minimum = screen.getByRole("spinbutton", {
      name: "Fast period minimum",
    });
    const maximum = screen.getByRole("spinbutton", {
      name: "Fast period maximum",
    });
    await act(async () => {
      fireEvent.change(maximum, { target: { value: "5" } });
    });
    expect(maximum).toHaveProperty("value", "5");
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    await act(async () => {
      fireEvent.blur(maximum);
    });
    await act(async () => {
      fireEvent.change(minimum, { target: { value: "4" } });
      fireEvent.blur(minimum);
      fireEvent.blur(maximum);
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("requires a non-negative step", async () => {
    render(<ResearchPage />);
    const step = screen.getByRole("spinbutton", { name: "Fast period step" });
    fireEvent.change(step, { target: { value: "-1" } });
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.blur(step);
    expect(screen.getByText("Step must be 0 or greater.")).toBeDefined();
    fireEvent.change(step, { target: { value: "0" } });
    expect(
      (
        screen.getByRole("button", {
          name: "Run parameter sweep",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
