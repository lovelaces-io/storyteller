import { describe, it, expect } from "vitest";
import { ANSI, getLevelColor, formatOrigin, countBrackets } from "../src/utils";

describe("ANSI", () => {
  it("grayDark and grayLight are different values", () => {
    expect(ANSI.grayDark).not.toBe(ANSI.grayLight);
  });
});

describe("getLevelColor", () => {
  it("returns green for tell", () => {
    expect(getLevelColor("tell")).toBe(ANSI.green);
  });

  it("returns yellow for warn", () => {
    expect(getLevelColor("warn")).toBe(ANSI.yellow);
  });

  it("returns red for oops", () => {
    expect(getLevelColor("oops")).toBe(ANSI.red);
  });
});

describe("formatOrigin", () => {
  it("returns undefined when origin is undefined", () => {
    expect(formatOrigin(undefined)).toBeUndefined();
  });

  it("returns undefined when origin.where is missing", () => {
    expect(formatOrigin({ who: "test" })).toBeUndefined();
  });

  it("returns string where as-is", () => {
    expect(formatOrigin({ where: "checkout" })).toBe("checkout");
  });

  it("formats record where with known fields", () => {
    const result = formatOrigin({
      where: { app: "web", service: "api", page: "home", component: "header" },
    });
    expect(result).toBe("web / api / home / header");
  });

  it("skips falsy values in record", () => {
    const result = formatOrigin({
      where: { app: "web", service: undefined, page: "home" },
    });
    expect(result).toBe("web / home");
  });

  it("returns undefined for empty record", () => {
    expect(formatOrigin({ where: {} })).toBeUndefined();
  });

  it("includes custom fields after known fields", () => {
    const result = formatOrigin({
      where: { app: "web", region: "us-west", instance: "3" },
    });
    expect(result).toBe("web / us-west / 3");
  });

  it("shows only custom fields when no known fields present", () => {
    const result = formatOrigin({
      where: { environment: "staging", cluster: "east" },
    });
    expect(result).toBe("staging / east");
  });
});

describe("countBrackets", () => {
  it("counts opening brackets", () => {
    expect(countBrackets("[")).toBe(1);
    expect(countBrackets("[[")).toBe(2);
  });

  it("counts closing brackets", () => {
    expect(countBrackets("]")).toBe(-1);
    expect(countBrackets("]]")).toBe(-2);
  });

  it("returns net depth", () => {
    expect(countBrackets("[item]")).toBe(0);
    expect(countBrackets("[[item]")).toBe(1);
  });

  it("returns 0 for no brackets", () => {
    expect(countBrackets("hello")).toBe(0);
  });
});
