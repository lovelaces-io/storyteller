/**
 * Reference stories, produced by driving the real library.
 *
 * Every normalizer feature the view has to render shows up here: nested
 * values, exotic types, circular references, every kind of truncation,
 * redaction, a capped cause chain, an AggregateError, chapters, all levels.
 * The contract test asserts those markers are really present, so if core
 * changes what it emits, the view's tests notice.
 */
import type { NoteEmission, StoryEvent } from "@lovelaces-io/storyteller";
import { Storyteller } from "@lovelaces-io/storyteller";

export type Fixtures = {
  /** Keyed by title */
  stories: Record<string, StoryEvent>;
  /** Every live note emission, in delivery order */
  notes: NoteEmission[];
  /** The id of the main story, for chapter assertions */
  mainStoryId: string;
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function causeChain(depth: number): Error {
  let error = new Error("socket hang up");
  for (let i = 1; i <= depth; i++) {
    error = new Error(`layer ${i} failed`, { cause: error });
  }
  return error;
}

export async function buildFixtures(): Promise<Fixtures> {
  const stories: StoryEvent[] = [];
  const notes: NoteEmission[] = [];
  const teller = new Storyteller({
    narration: "live",
    origin: { who: "checkout-service", where: { region: "us-east-1", pod: "web-7" } },
  });
  teller.audience.remove("console");
  teller.audience.add({
    name: "capture",
    hears: ["note", "story"],
    hear: (emission) => {
      if (emission.kind === "note") notes.push(emission);
      else stories.push(emission);
    },
  });
  const mainStoryId = teller.currentStoryId;

  teller.report("Order received", {
    what: {
      orderId: "ord_9f2",
      items: [
        { sku: "A1", qty: 2 },
        { sku: "B2", qty: 1 },
      ],
      total: 42.5,
      customer: { email: "a@example.com", password: "hunter2", apiKey: "sk-live-123" },
    },
  });

  // A bare object as the whole input
  teller.report({ status: 402, retryAfter: 30, gateway: "stripe" });

  const circular: Record<string, unknown> = { name: "root" };
  circular["self"] = circular;
  circular["children"] = [{ parent: circular }];

  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let i = 0; i < 12; i++) {
    const next: Record<string, unknown> = {};
    cursor[`level${i}`] = next;
    cursor = next;
  }
  const wide: Record<string, number> = {};
  for (let i = 0; i < 130; i++) wide[`key${i}`] = i;

  teller.report("Exotic values", {
    what: {
      when: new Date("2026-09-04T12:00:00Z"),
      tags: new Set(["alpha", "beta"]),
      lookup: new Map([["k", 1]]),
      big: 10n,
      fn: () => 1,
      sym: Symbol("s"),
      bytes: new Uint8Array(40),
      undef: undefined,
      nan: NaN,
      circular,
      deep,
      wide,
      many: Array.from({ length: 150 }, (_, i) => i),
      long: "x".repeat(9000),
    },
  });

  teller.report("Payment retry scheduled", { level: "warn", where: "payments.charge", who: "worker-3" });

  teller.report("Charge failed", { level: "oops", error: causeChain(7) });
  teller.report("Several things failed", {
    level: "oops",
    error: new AggregateError([new Error("first"), new Error("second")], "two failures"),
  });

  const chapter = teller.chapter({ origin: { what: "inventory" } });
  chapter.report("Reserved stock", { what: { sku: "A1", qty: 2 } });
  chapter.finish("Inventory reserved");

  teller.finish("Order ord_9f2 failed", {
    level: "oops",
    error: new Error("Checkout aborted", { cause: causeChain(1) }),
  });

  teller.report("Digest built", { what: { recipients: 12 } });
  teller.report("Digest sent");
  teller.finish("Nightly digest sent");

  teller.report("Skipped 3 rows with missing ids", { level: "warn" });
  teller.finish("Sync finished with skips", { level: "warn" });

  await tick();
  await tick();

  const byTitle: Record<string, StoryEvent> = {};
  for (const story of stories) byTitle[story.title] = story;
  return { stories: byTitle, notes, mainStoryId };
}
