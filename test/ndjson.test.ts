import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { LineWriter } from "../src/audiences/ndjsonAudience";
import { ndjsonAudience } from "../src/audiences/ndjsonAudience";
import { Storyteller } from "../src/storyteller";

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A stream that keeps what was written so tests can parse it back */
function createCaptureStream() {
  const chunks: string[] = [];
  const stream: LineWriter = {
    write: (chunk: string) => {
      chunks.push(chunk);
      return true;
    },
  };

  const text = () => chunks.join("");
  const lines = () => text().split("\n").filter((line) => line.length > 0);
  const parsed = () => lines().map((line) => JSON.parse(line) as Record<string, unknown>);

  return { stream, text, lines, parsed };
}

/** A storyteller whose only audience is NDJSON on a capture stream */
function createNdjsonStoryteller(narration?: "collected" | "live") {
  const capture = createCaptureStream();
  const story = new Storyteller(narration ? { narration } : {});
  story.audience.remove("console");
  story.audience.add(ndjsonAudience({ stream: capture.stream }));
  return { story, ...capture };
}

describe("ndjsonAudience", () => {
  it("writes one parseable JSON object per line", async () => {
    const { story, parsed } = createNdjsonStoryteller("live");

    story.note("first").note("second");
    story.tell("done");
    await tick();

    const records = parsed();
    expect(records.length).toBe(3);
    expect(records[0]!["kind"]).toBe("note");
    expect(records[1]!["kind"]).toBe("note");
    expect(records[2]!["kind"]).toBe("story");
  });

  it("puts nothing but JSON on the channel", async () => {
    const { story, lines } = createNdjsonStoryteller("live");

    story.note("beat");
    story.tell("told");
    await tick();

    for (const line of lines()) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("terminates every line with a newline", async () => {
    const { story, text } = createNdjsonStoryteller("live");

    story.note("one");
    story.note("two");

    expect(text().endsWith("\n")).toBe(true);
    expect(text().split("\n").filter(Boolean).length).toBe(2);
  });

  it("keeps notes and stories separable by storyId", async () => {
    const capture = createCaptureStream();
    const first = new Storyteller({ narration: "live" });
    const second = new Storyteller({ narration: "live" });
    for (const story of [first, second]) {
      story.audience.remove("console");
      story.audience.add(ndjsonAudience({ stream: capture.stream }));
    }

    first.note("from first");
    second.note("from second");
    first.tell("first done");
    second.tell("second done");
    await tick();

    const records = capture.parsed();
    const firstId = records.find((r) => r["note"] === "from first")!["storyId"];
    const secondId = records.find((r) => r["note"] === "from second")!["storyId"];

    expect(firstId).not.toBe(secondId);
    expect(records.filter((r) => r["storyId"] === firstId).length).toBe(2);
    expect(records.filter((r) => r["storyId"] === secondId).length).toBe(2);
  });

  it("preserves the note order with sequence", async () => {
    const { story, parsed } = createNdjsonStoryteller("live");

    for (let index = 0; index < 20; index += 1) story.note(`beat ${index}`);

    const sequences = parsed()
      .filter((record) => record["kind"] === "note")
      .map((record) => record["sequence"]);

    expect(sequences).toEqual([...Array(20).keys()]);
  });

  it("still produces valid lines for an unserializable value", async () => {
    const { story, lines } = createNdjsonStoryteller("live");

    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic["self"] = cyclic;
    story.note("hostile", { what: cyclic });

    // A BigInt makes JSON.stringify throw outright
    story.note("bigint", { what: { size: 10n } });

    expect(lines().length).toBe(2);
    for (const line of lines()) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("can run two streams at once under different names", async () => {
    const primary = createCaptureStream();
    const secondary = createCaptureStream();

    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add(ndjsonAudience({ stream: primary.stream }));
    story.audience.add(ndjsonAudience({ stream: secondary.stream, name: "audit" }));

    story.note("beat");

    expect(primary.lines().length).toBe(1);
    expect(secondary.lines().length).toBe(1);
  });

  it("writes redacted values, not secrets", async () => {
    const { story, text } = createNdjsonStoryteller("live");

    story.note("auth", { what: { password: "hunter2" } });

    expect(text()).not.toContain("hunter2");
    expect(text()).toContain("[redacted]");
  });
});

describe("level threshold", () => {
  it("drops emissions below the configured level", async () => {
    const capture = createCaptureStream();
    const story = new Storyteller({ narration: "live", level: "Warning" });
    story.audience.remove("console");
    story.audience.add(ndjsonAudience({ stream: capture.stream }));

    story.note("quiet detail");
    story.note("worth knowing", { level: "Warning" });
    story.tell("an information story");
    story.warn("a warning story");
    await tick();

    const records = capture.parsed();
    expect(records.length).toBe(2);
    expect(records.map((record) => record["level"])).toEqual(["Warning", "Warning"]);
  });

  it("delivers everything at the default level", async () => {
    const { story, parsed } = createNdjsonStoryteller("live");

    story.note("detail");
    story.tell("story");
    await tick();

    expect(parsed().length).toBe(2);
  });
});

describe("output format from the environment", () => {
  const environment =
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ??
    ({} as Record<string, string | undefined>);
  const originals = {
    format: environment["STORYTELLER_FORMAT"],
    level: environment["STORYTELLER_LEVEL"],
    color: environment["STORYTELLER_COLOR"],
  };

  beforeEach(() => {
    delete environment["STORYTELLER_FORMAT"];
    delete environment["STORYTELLER_LEVEL"];
    delete environment["STORYTELLER_COLOR"];
  });

  afterEach(() => {
    for (const [key, value] of [
      ["STORYTELLER_FORMAT", originals.format],
      ["STORYTELLER_LEVEL", originals.level],
      ["STORYTELLER_COLOR", originals.color],
    ] as const) {
      if (value === undefined) delete environment[key];
      else environment[key] = value;
    }
  });

  it("registers the console audience by default", () => {
    const story = new Storyteller();
    expect(story.audience.names()).toContain("console");
  });

  it("registers the ndjson audience when the format says so", () => {
    environment["STORYTELLER_FORMAT"] = "ndjson";
    const story = new Storyteller();

    expect(story.audience.names()).toContain("ndjson");
    expect(story.audience.names()).not.toContain("console");
  });

  it("lets an explicit format win over the environment", () => {
    environment["STORYTELLER_FORMAT"] = "ndjson";
    const story = new Storyteller({ format: "text" });

    expect(story.audience.names()).toContain("console");
  });

  it("falls back to text for an unrecognized format", () => {
    environment["STORYTELLER_FORMAT"] = "yaml-please";
    const story = new Storyteller();

    expect(story.audience.names()).toContain("console");
  });

  it("applies the level threshold from the environment", async () => {
    environment["STORYTELLER_LEVEL"] = "warn";

    const capture = createCaptureStream();
    const story = new Storyteller({ narration: "live" });
    story.audience.remove("console");
    story.audience.add(ndjsonAudience({ stream: capture.stream }));

    story.note("quiet");
    story.note("loud", { level: "Error" });
    await tick();

    expect(capture.parsed().length).toBe(1);
  });
});
