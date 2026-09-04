import { describe, it, expect } from "vitest";
import { normalizeValue, normalizeError, REDACTED } from "../src/normalize";

/** Assert a value survives a JSON round trip, which is the whole point of normalizing */
function expectSerializable(value: unknown) {
  expect(() => JSON.stringify(normalizeValue(value))).not.toThrow();
}

describe("normalizeValue — primitives", () => {
  it("passes through JSON-safe primitives", () => {
    expect(normalizeValue("hello")).toBe("hello");
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(true)).toBe(true);
    expect(normalizeValue(null)).toBeNull();
  });

  it("converts values JSON cannot represent", () => {
    expect(normalizeValue(undefined)).toBeNull();
    expect(normalizeValue(NaN)).toBe("NaN");
    expect(normalizeValue(Infinity)).toBe("Infinity");
    expect(normalizeValue(10n)).toBe("10n");
    expect(normalizeValue(Symbol("tag"))).toBe("Symbol(tag)");
  });

  it("names functions", () => {
    function namedFunction() {}
    expect(normalizeValue(namedFunction)).toBe("[Function: namedFunction]");
    expect(normalizeValue(() => {})).toContain("[Function:");
  });
});

describe("normalizeValue — built-in objects", () => {
  it("converts a Date to an ISO string", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(normalizeValue(date)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("marks an invalid Date rather than throwing", () => {
    expect(normalizeValue(new Date("not a date"))).toBe("[Invalid Date]");
  });

  it("converts a Map to a tagged entries object", () => {
    const map = new Map<string, unknown>([["id", 1], ["name", "ada"]]);
    expect(normalizeValue(map)).toEqual({
      "@type": "Map",
      entries: { id: 1, name: "ada" },
    });
  });

  it("converts a Set to a tagged values array", () => {
    expect(normalizeValue(new Set([1, 2, 2, 3]))).toEqual({
      "@type": "Set",
      values: [1, 2, 3],
    });
  });

  it("describes binary data by size and preview instead of dumping it", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(normalizeValue(bytes)).toEqual({
      "@type": "Uint8Array",
      byteLength: 4,
      preview: "de ad be ef",
    });
  });

  it("converts a RegExp and a URL to strings", () => {
    expect(normalizeValue(/ab+c/gi)).toBe("/ab+c/gi");
    expect(normalizeValue(new URL("https://example.com/path"))).toBe(
      "https://example.com/path"
    );
  });

  it("labels values that cannot be inspected", () => {
    expect(normalizeValue(new WeakMap())).toBe("[WeakMap]");
    expect(normalizeValue(Promise.resolve(1))).toBe("[Promise]");
  });

  it("honors toJSON()", () => {
    const value = { toJSON: () => ({ replaced: true }) };
    expect(normalizeValue(value)).toEqual({ replaced: true });
  });
});

describe("normalizeValue — class instances and exotic objects", () => {
  it("tags a class instance with its class name", () => {
    class Order {
      constructor(
        public id: string,
        public total: number
      ) {}
    }
    expect(normalizeValue(new Order("o-1", 42))).toEqual({
      "@type": "Order",
      id: "o-1",
      total: 42,
    });
  });

  it("does not tag plain objects", () => {
    expect(normalizeValue({ a: 1 })).toEqual({ a: 1 });
  });

  it("handles null-prototype objects", () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare["field"] = "value";
    expect(normalizeValue(bare)).toEqual({ field: "value" });
  });

  it("drops undefined properties the way JSON.stringify does", () => {
    expect(normalizeValue({ kept: 1, dropped: undefined })).toEqual({ kept: 1 });
  });

  it("survives a getter that throws", () => {
    const hostile = {
      safe: "fine",
      get explosive(): string {
        throw new Error("nope");
      },
    };
    const result = normalizeValue(hostile) as Record<string, string>;
    expect(result["safe"]).toBe("fine");
    expect(result["explosive"]).toBe("[Unreadable: nope]");
  });

  it("survives a proxy that throws on every trap", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("trap");
        },
        ownKeys() {
          throw new Error("trap");
        },
      }
    );
    expectSerializable(hostile);
  });
});

describe("normalizeValue — cycles", () => {
  it("replaces a self-reference with a path marker", () => {
    const cyclic: Record<string, unknown> = { name: "root" };
    cyclic["self"] = cyclic;

    expect(normalizeValue(cyclic)).toEqual({
      name: "root",
      self: "[Circular → $]",
    });
  });

  it("replaces a deep back-reference with the path it points to", () => {
    const root: Record<string, unknown> = { child: {} };
    (root["child"] as Record<string, unknown>)["parent"] = root;

    expect(normalizeValue(root)).toEqual({
      child: { parent: "[Circular → $]" },
    });
  });

  it("handles cycles through arrays", () => {
    const list: unknown[] = [1];
    list.push(list);
    expect(normalizeValue(list)).toEqual([1, "[Circular → $]"]);
  });

  it("renders a repeated non-cyclic reference twice rather than calling it circular", () => {
    const shared = { id: 1 };
    expect(normalizeValue({ left: shared, right: shared })).toEqual({
      left: { id: 1 },
      right: { id: 1 },
    });
  });
});

describe("normalizeValue — limits", () => {
  it("truncates long strings and says how much was dropped", () => {
    const long = "x".repeat(50);
    expect(normalizeValue(long, { maxStringLength: 10 })).toBe(
      `${"x".repeat(10)}…[+40 chars]`
    );
  });

  it("truncates long arrays with an explicit marker", () => {
    const result = normalizeValue([1, 2, 3, 4, 5], { maxArrayLength: 2 }) as unknown[];
    expect(result).toEqual([1, 2, { "@truncated": { kind: "array", omitted: 3 } }]);
  });

  it("truncates wide objects with an explicit marker", () => {
    const wide = { a: 1, b: 2, c: 3 };
    const result = normalizeValue(wide, { maxProperties: 2 }) as Record<string, unknown>;
    expect(result["@truncated"]).toEqual({ kind: "properties", omitted: 1 });
  });

  it("stops descending past maxDepth with an explicit marker", () => {
    const deep = { a: { b: { c: { d: "bottom" } } } };
    const result = normalizeValue(deep, { maxDepth: 2 }) as Record<string, never>;
    expect(JSON.stringify(result)).toContain('"@truncated"');
    expect(JSON.stringify(result)).toContain('"depth"');
  });

  it("survives very large and very deep structures", () => {
    const huge = Array.from({ length: 10_000 }, (_, index) => ({ index }));
    expectSerializable(huge);

    let deep: Record<string, unknown> = { bottom: true };
    for (let level = 0; level < 200; level += 1) deep = { deep };
    expectSerializable(deep);
  });
});

describe("normalizeValue — redaction", () => {
  it("redacts known secret keys", () => {
    expect(normalizeValue({ password: "hunter2", user: "ada" })).toEqual({
      password: REDACTED,
      user: "ada",
    });
  });

  it("matches regardless of casing and separators", () => {
    const result = normalizeValue({
      apiKey: "a",
      api_key: "b",
      "API-KEY": "c",
      ApiKey: "d",
    }) as Record<string, string>;

    for (const value of Object.values(result)) {
      expect(value).toBe(REDACTED);
    }
  });

  it("redacts nested values", () => {
    const result = normalizeValue({ config: { authorization: "Bearer x" } });
    expect(result).toEqual({ config: { authorization: REDACTED } });
  });

  it("can be disabled", () => {
    expect(normalizeValue({ token: "abc" }, { redact: false })).toEqual({
      token: "abc",
    });
  });

  it("accepts a custom key list", () => {
    const result = normalizeValue(
      { ssn: "000", token: "keep" },
      { redactKeys: ["ssn"] }
    );
    expect(result).toEqual({ ssn: REDACTED, token: "keep" });
  });
});

describe("normalizeValue — determinism and safety", () => {
  it("produces identical output for identical input", () => {
    const build = () => ({
      when: new Date("2026-01-01T00:00:00.000Z"),
      tags: new Set(["a", "b"]),
      nested: { deep: [1, 2, 3] },
    });

    expect(JSON.stringify(normalizeValue(build()))).toBe(
      JSON.stringify(normalizeValue(build()))
    );
  });

  it("never throws for any hostile fixture", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    const fixtures: unknown[] = [
      cyclic,
      new Proxy({}, { ownKeys() { throw new Error("x"); } }),
      Object.create(null),
      { get boom() { throw new Error("boom"); } },
      new Map([[{ key: "object" }, new Set([1])]]),
      Symbol("s"),
      10n,
      () => {},
      new Error("with", { cause: new Error("cause") }),
      "x".repeat(100_000),
    ];

    for (const fixture of fixtures) {
      expect(() => normalizeValue(fixture)).not.toThrow();
      expectSerializable(fixture);
    }
  });
});

describe("normalizeError", () => {
  it("normalizes a plain Error", () => {
    const error = normalizeError(new Error("boom"));
    expect(error.name).toBe("Error");
    expect(error.message).toBe("boom");
    expect(error.stack).toBeDefined();
  });

  it("normalizes non-Error values", () => {
    expect(normalizeError("just a string").message).toBe("just a string");
    expect(normalizeError(404).message).toBe("404");
  });

  it("reads error-shaped objects from across a serialization boundary", () => {
    const error = normalizeError({ name: "HttpError", message: "502" });
    expect(error.name).toBe("HttpError");
    expect(error.message).toBe("502");
  });

  it("follows the cause chain into serializable objects", () => {
    const root = new Error("root");
    const middle = new Error("middle", { cause: root });
    const top = new Error("top", { cause: middle });

    const normalized = normalizeError(top);
    const cause = normalized.cause as Record<string, unknown>;
    expect(cause["message"]).toBe("middle");
    expect((cause["cause"] as Record<string, unknown>)["message"]).toBe("root");

    // The whole chain must survive storage — a raw Error stringifies to {}
    expect(JSON.stringify(normalized)).toContain("root");
  });

  it("stops an infinite cause chain", () => {
    const looping = new Error("loop");
    (looping as { cause?: unknown }).cause = looping;

    expect(() => normalizeError(looping)).not.toThrow();
    expect(JSON.stringify(normalizeError(looping))).toContain("causeChain");
  });

  it("collects AggregateError members", () => {
    const aggregate = new AggregateError(
      [new Error("first"), new Error("second")],
      "both failed"
    );
    const normalized = normalizeError(aggregate);

    expect(normalized.message).toBe("both failed");
    expect(normalized.errors?.length).toBe(2);
    expect(normalized.errors?.[0]?.message).toBe("first");
  });
});
