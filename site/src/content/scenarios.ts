/**
 * Scenarios for the explorer: small worlds a visitor can drive.
 *
 * Each scenario is a set of runs. A run is a list of beats with delays, so it
 * plays out live on the board — running, then finished — the way a real story
 * would. Operational data only: no customers, no accounts, no people.
 */
export type Level = "Information" | "Warning" | "Error";

export type Beat = {
  /** Milliseconds after the previous beat */
  after: number;
  note: string;
  level?: Level;
  what?: unknown;
  where?: string;
  error?: { name?: string; message: string; stack?: string };
  /** A chapter opened at this beat: its own beats, then its own finish */
  chapter?: { origin: { what: string }; beats: Beat[]; finish: Finish };
};

export type Finish = { title: string; level?: Level; error?: { name?: string; message: string } };

export type Run = {
  /** The button that starts it */
  label: string;
  /** What kind of outcome it shows */
  outcome: "success" | "warning" | "failure";
  origin: { who: string; where?: unknown };
  beats: Beat[];
  finish: Finish;
};

export type Scenario = {
  id: string;
  name: string;
  tagline: string;
  runs: Run[];
  /** Which runs auto-play, in order, with a pause between them */
  autoplay: number[];
};

const order = () => `ord_${Math.random().toString(16).slice(2, 6)}`;

export const scenarios: Scenario[] = [
  {
    id: "checkout",
    name: "Checkout",
    tagline: "An online shop taking orders. Most go through; some don't.",
    autoplay: [0, 0, 1, 0, 2, 0],
    runs: [
      {
        label: "Order goes through",
        outcome: "success",
        origin: { who: "web", where: { route: "/api/checkout" } },
        beats: [
          { after: 0, note: "Cart validated", what: { items: 3, subtotal: 42.5 } },
          { after: 450, note: "Stock reserved", what: { skus: ["A1", "B2", "C3"] } },
          { after: 600, note: "Card charged", what: { amount: 42.5, currency: "USD", gateway: "stripe" } },
          { after: 300, note: "Confirmation queued" },
        ],
        finish: { title: `Checkout for ${order()}` },
      },
      {
        label: "Slow gateway",
        outcome: "warning",
        origin: { who: "web", where: { route: "/api/checkout" } },
        beats: [
          { after: 0, note: "Cart validated", what: { items: 1, subtotal: 18 } },
          { after: 400, note: "Stock reserved" },
          { after: 2200, note: "Gateway slow, retrying once", level: "Warning", what: { attempt: 1, waitedMs: 2200 } },
          { after: 900, note: "Card charged", what: { amount: 18, currency: "USD" } },
        ],
        finish: { title: `Checkout for ${order()}`, level: "Warning" },
      },
      {
        label: "Card declined",
        outcome: "failure",
        origin: { who: "web", where: { route: "/api/checkout" } },
        beats: [
          { after: 0, note: "Cart validated", what: { items: 2, subtotal: 64 } },
          { after: 400, note: "Stock reserved" },
          { after: 700, note: "Charge declined", level: "Error", what: { amount: 64, currency: "USD", code: "card_declined" }, error: { name: "CardDeclinedError", message: "The card was declined", stack: "CardDeclinedError: The card was declined\n    at charge (payments/stripe.ts:71:9)\n    at checkout (api/checkout.ts:40:5)" } },
          { after: 200, note: "Stock released" },
        ],
        finish: { title: `Checkout for ${order()} failed`, level: "Error", error: { name: "CardDeclinedError", message: "The card was declined" } },
      },
    ],
  },
  {
    id: "sync",
    name: "Nightly sync",
    tagline: "A batch job that moves rows between systems while nobody is watching.",
    autoplay: [0, 1, 2],
    runs: [
      {
        label: "Clean run",
        outcome: "success",
        origin: { who: "sync-agent" },
        beats: [
          { after: 0, note: "Fetched 1,180 rows", what: { source: "crm", rows: 1180 } },
          { after: 300, note: "Schema checked", chapter: { origin: { what: "schema" }, beats: [{ after: 0, note: "42 columns match" }], finish: { title: "Schema checked" } } },
          { after: 900, note: "Batch 1 of 3 upserted", what: { rows: 400 } },
          { after: 900, note: "Batch 2 of 3 upserted", what: { rows: 400 } },
          { after: 900, note: "Batch 3 of 3 upserted", what: { rows: 380 } },
        ],
        finish: { title: "Nightly sync finished" },
      },
      {
        label: "Skipped rows",
        outcome: "warning",
        origin: { who: "sync-agent" },
        beats: [
          { after: 0, note: "Fetched 1,204 rows", what: { source: "crm", rows: 1204 } },
          { after: 800, note: "Batch 1 of 3 upserted", what: { rows: 400 } },
          { after: 800, note: "Skipped 4 rows with missing ids", level: "Warning", what: { skipped: 4, reason: "missing id" } },
          { after: 800, note: "Batch 2 of 3 upserted", what: { rows: 400 } },
          { after: 800, note: "Batch 3 of 3 upserted", what: { rows: 400 } },
        ],
        finish: { title: "Nightly sync finished with skips", level: "Warning" },
      },
      {
        label: "Deadlock on batch 3",
        outcome: "failure",
        origin: { who: "sync-agent" },
        beats: [
          { after: 0, note: "Fetched 1,200 rows", what: { source: "crm", rows: 1200 } },
          { after: 800, note: "Batch 1 of 3 upserted", what: { rows: 400 } },
          { after: 800, note: "Batch 2 of 3 upserted", what: { rows: 400 } },
          { after: 700, note: "Retrying batch 3", level: "Warning", chapter: { origin: { what: "batch-3" }, beats: [{ after: 0, note: "Attempt 1 timed out", level: "Warning", what: { timeoutMs: 10000 } }, { after: 900, note: "Attempt 2 timed out", level: "Warning", what: { timeoutMs: 5800 } }], finish: { title: "Batch 3 retried twice", level: "Warning" } } },
          { after: 1200, note: "Upsert failed", level: "Error", what: { batch: 3, rows: 412, attempt: 3 }, error: { name: "DeadlockError", message: "deadlock detected", stack: "DeadlockError: deadlock detected\n    at upsert (sync/batch.ts:88:11)\n    at run (sync/nightly.ts:41:9)" } },
        ],
        finish: { title: "Nightly sync failed", level: "Error", error: { name: "DeadlockError", message: "deadlock detected" } },
      },
    ],
  },
  {
    id: "agent",
    name: "Agent task",
    tagline: "An AI agent working a ticket: reading, calling tools, checking itself.",
    autoplay: [0, 1, 0, 2],
    runs: [
      {
        label: "Ticket resolved",
        outcome: "success",
        origin: { who: "support-agent", where: { model: "claude-sonnet-5" } },
        beats: [
          { after: 0, note: "Read ticket #4821", what: { ticket: 4821, category: "billing", words: 212 } },
          { after: 500, note: "Searched the knowledge base", what: { query: "refund window", results: 3 } },
          { after: 400, note: "Called tool: lookup_order", chapter: { origin: { what: "tool:lookup_order" }, beats: [{ after: 0, note: "Request sent", what: { orderRef: "ord_9f2c" } }, { after: 600, note: "200 OK in 612 ms", what: { status: "shipped", eligibleForRefund: true } }], finish: { title: "lookup_order" } } },
          { after: 900, note: "Drafted a reply", what: { tokens: 318, tone: "plain" } },
          { after: 400, note: "Self-check passed", what: { citations: 2, policy: "refund-14d" } },
        ],
        finish: { title: "Resolved ticket #4821" },
      },
      {
        label: "Needed a retry",
        outcome: "warning",
        origin: { who: "support-agent", where: { model: "claude-sonnet-5" } },
        beats: [
          { after: 0, note: "Read ticket #4822", what: { ticket: 4822, category: "shipping" } },
          { after: 500, note: "Called tool: track_shipment", chapter: { origin: { what: "tool:track_shipment" }, beats: [{ after: 0, note: "Request timed out after 8 s", level: "Warning", what: { attempt: 1 } }, { after: 700, note: "200 OK in 1.4 s", what: { status: "in transit", eta: "2 days" } }], finish: { title: "track_shipment", level: "Warning" } } },
          { after: 900, note: "Drafted a reply", what: { tokens: 204 } },
          { after: 300, note: "Self-check passed" },
        ],
        finish: { title: "Resolved ticket #4822 after a retry", level: "Warning" },
      },
      {
        label: "Tool refused",
        outcome: "failure",
        origin: { who: "support-agent", where: { model: "claude-sonnet-5" } },
        beats: [
          { after: 0, note: "Read ticket #4823", what: { ticket: 4823, category: "billing" } },
          { after: 500, note: "Called tool: issue_refund", chapter: { origin: { what: "tool:issue_refund" }, beats: [{ after: 0, note: "Request sent", what: { orderRef: "ord_1b77", amount: 29 } }, { after: 500, note: "403 Forbidden", level: "Error", error: { name: "ToolError", message: "issue_refund is not permitted for this agent" } }], finish: { title: "issue_refund", level: "Error", error: { name: "ToolError", message: "issue_refund is not permitted for this agent" } } } },
          { after: 400, note: "Escalated to a person", level: "Error", what: { queue: "billing-humans" } },
        ],
        finish: { title: "Ticket #4823 escalated", level: "Error", error: { name: "ToolError", message: "issue_refund is not permitted for this agent" } },
      },
    ],
  },
];
