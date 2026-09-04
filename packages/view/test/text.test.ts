// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { StoryEvent } from "@lovelaces-io/storyteller";
import { renderErrorText, renderNoteText, renderStoryText, renderValueText, stripAnsi } from "../src/index";
import type { StoryRecord } from "../src/types";
import { buildFixtures, type Fixtures } from "./fixtures/stories";
import loreErrorJson from "./fixtures/lore-error.json";

const loreError = loreErrorJson as StoryRecord;
const hasAnsi = (text: string) => stripAnsi(text) !== text;

let fixtures: Fixtures;
let main: StoryEvent;
let text: string;
let lines: string[];

const section = (from: string, until: RegExp) => {
  const start = lines.findIndex((line) => line.includes(from));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => until.test(line));
  return [lines[start]!, ...(end === -1 ? rest : rest.slice(0, end))];
};

beforeAll(async () => {
  fixtures = await buildFixtures();
  main = fixtures.stories["Order ord_9f2 failed"]!;
  text = renderStoryText(main, { locale: "en-US", timeZone: "UTC" });
  lines = text.split("\n");
});

describe("renderStoryText", () => {
  it("opens with the level, title and a meta line", () => {
    expect(lines[0]).toBe("ERROR  Order ord_9f2 failed");
    expect(lines[1]).toMatch(/^ {2}.+ · \d+ ms · \d+ notes · [0-9a-f-]{36}$/);
  });

  it("prints the origin under the header", () => {
    expect(lines[2]).toBe('  who: "checkout-service"');
    expect(lines[3]).toBe('  where: {region: "us-east-1", pod: "web-7"}');
  });

  it("lists notes in sequence order with offsets and badges", () => {
    const heads = lines.filter((line) => /^ {2}#\d+ /.test(line));
    expect(heads.length).toBe(main.notes.length);
    expect(heads[0]).toBe("  #0  +0 ms  Order received");
    expect(heads.map((line) => Number(/#(\d+)/.exec(line)![1]))).toEqual(main.notes.map((n) => n.sequence));
    expect(heads.find((line) => line.includes("Payment retry"))).toMatch(/^ {2}#\d+ {2}\+\d+ ms {2}WARN {2}Payment retry scheduled$/);
    expect(heads.find((line) => line.includes("Charge failed"))).toContain("  ERROR  Charge failed");
  });

  it("orders shuffled notes by sequence", () => {
    const shuffled: StoryRecord = { ...main, notes: [...main.notes].reverse() };
    const heads = renderStoryText(shuffled).split("\n").filter((line) => /^ {2}#\d+ /.test(line));
    expect(heads[0]).toContain("#0");
    expect(heads[0]).toContain("Order received");
  });

  it("folds small flat values onto one line and expands the rest", () => {
    const order = section("Order received", /^ {2}#/);
    expect(order).toContain("    what: {4}");
    expect(order).toContain('      orderId: "ord_9f2"');
    expect(order).toContain("      items: [2]");
    expect(order).toContain('        0: {sku: "A1", qty: 2}');
    expect(order).toContain('      customer: {email: "a@example.com", password: redacted, apiKey: redacted}');
    expect(text).not.toContain("[redacted]");
  });

  it("describes every marker in words", () => {
    const exotic = section("Exotic values", /^ {2}#/);
    const joined = exotic.join("\n");
    expect(joined).toContain("tags: Set {");
    expect(joined).toContain("lookup: Map {");
    expect(joined).toContain("bytes: Uint8Array {");
    expect(joined).toContain("… 24 more bytes not kept");
    expect(joined).toContain("… 50 more items not kept");
    expect(joined).toContain("… 30 more properties not kept");
    expect(joined).toContain("circular, same as $");
    expect(joined).toContain("(1000 more characters not kept)");
    expect(joined).not.toContain("[Circular");
    expect(joined).not.toContain("@truncated");
  });

  it("nests the cause chain and marks where it stopped", () => {
    const charge = section("Charge failed", /^ {2}#/);
    const causes = charge.filter((line) => line.includes("caused by"));
    expect(causes.length).toBe(6);
    expect(causes[0]!.trim()).toBe("caused by Error: layer 6 failed");
    expect(causes[5]!.trim()).toBe("caused by … cause chain continues, not kept");
    expect(causes[1]!.search(/\S/)).toBeGreaterThan(causes[0]!.search(/\S/));
  });

  it("numbers AggregateError members", () => {
    const several = section("Several things failed", /^ {2}#/);
    expect(several.map((line) => line.trim())).toEqual(
      expect.arrayContaining(["1. Error: first", "2. Error: second"])
    );
  });

  it("ends with the closing error", () => {
    const tail = lines.slice(lines.lastIndexOf(""));
    expect(tail[1]).toBe("  Error: Checkout aborted");
    expect(tail.some((line) => line.trim() === "caused by Error: layer 1 failed")).toBe(true);
  });

  it("marks a chapter", () => {
    const chapter = renderStoryText(fixtures.stories["Inventory reserved"]!);
    expect(chapter.split("\n")[1]).toContain(`chapter of ${fixtures.mainStoryId}`);
  });

  it("renders a stored record, stack frames dimmed and droppable", () => {
    const withStacks = renderStoryText(loreError);
    expect(withStacks.split("\n")[0]).toBe("ERROR  The app shell crashed");
    expect(withStacks).toContain("TypeError: Cannot read properties of undefined (reading 'preview')");
    expect(withStacks).toContain("at Shell (app/layout.tsx:42:13)");
    expect(withStacks).toContain('where: "global-error-boundary"');
    const without = renderStoryText(loreError, { stacks: false });
    expect(without).not.toContain("app/layout.tsx");
  });

  it("uses ANSI only when asked", () => {
    expect(hasAnsi(text)).toBe(false);
    const colored = renderStoryText(loreError, { colors: true });
    expect(hasAnsi(colored)).toBe(true);
    expect(stripAnsi(colored)).toBe(renderStoryText(loreError));
  });

  it("hides ids and warns about drops", () => {
    const quiet = renderStoryText({ ...loreError, droppedEmissions: 2 }, { showIds: false });
    expect(quiet).not.toContain("#0");
    expect(quiet).not.toContain(loreError.storyId!);
    expect(quiet).toContain("2 dropped");
  });

  it("folds values past maxDepth to their shape", () => {
    const shallow = renderStoryText(main, { maxDepth: 0 });
    expect(shallow).toContain("what: {4} …");
    expect(shallow).not.toContain("orderId");
  });
});

describe("renderNoteText, renderErrorText, renderValueText", () => {
  it("renders a live emission with its story id", () => {
    const emission = fixtures.notes.find((n) => n.note === "Payment retry scheduled")!;
    const out = renderNoteText(emission);
    const [head, ...rest] = out.split("\n");
    expect(head).toMatch(/^#\d+ {2}.+ {2}WARN {2}Payment retry scheduled {2}[0-9a-f-]{36}$/);
    expect(head).not.toContain("+");
    expect(rest).toContain('  who: "worker-3"');
    expect(rest).toContain('  where: "payments.charge"');
  });

  it("renders errors and values on their own", () => {
    expect(renderErrorText({ name: "RangeError", message: "too far", cause: "network" }).split("\n")).toEqual([
      "RangeError: too far",
      '  caused by "network"',
    ]);
    expect(renderValueText(42)).toBe("42");
    expect(renderValueText({ a: [1, { b: true }] }).split("\n")).toEqual(["{1}", "  a: [2]", "    0: 1", "    1: {b: true}"]);
    expect(renderValueText({ "@truncated": { kind: "depth", depth: 6 } })).toBe("… nested deeper than 6 levels, not kept");
    expect(renderValueText("x".repeat(3) + "…[+7 chars]")).toBe('"xxx" (7 more characters not kept)');
  });
});
