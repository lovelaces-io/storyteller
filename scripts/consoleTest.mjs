import { Storyteller } from "../dist/index.js";

/**
 * Runs the demo scenarios to visually verify console output.
 * `npm run test:console` builds first, then runs this against dist/.
 */
class ConsoleTestRunner {
  static run() {
    ConsoleTestRunner.demoInfo();
    ConsoleTestRunner.demoWarn();
    ConsoleTestRunner.demoOops();
    ConsoleTestRunner.demoLive();
  }

  /** A story that went well */
  static demoInfo() {
    console.log("\n--- Demo: info ---");
    const story = new Storyteller({ origin: { where: { app: "web", page: "Dashboard" } } });

    story.report("User opened dashboard", { who: { id: "user:42" }, where: { component: "DashboardPage" } });
    story.report("Loaded widgets", { what: { count: 6 }, where: { component: "WidgetGrid" } });
    story.report("Dashboard ready", { what: "initial render complete" });

    story.finish("Dashboard loaded");
  }

  /** A story that worked, with something worth knowing */
  static demoWarn() {
    console.log("\n--- Demo: warn ---");
    const story = new Storyteller({ origin: { where: { app: "web", page: "Checkout" } } });

    story.report("User submitted payment", { who: { id: "user:413" }, what: { amount: 49.99, currency: "USD" } });
    story.report("Gateway response slow", { what: { latencyMs: 2400 }, where: "payments", level: "warn" });
    story.report("Retry scheduled", { what: { attempt: 2 } });

    story.finish("Payment slow but succeeded", { level: "warn" });
  }

  /** A story that broke, with the error attached */
  static demoOops() {
    console.log("\n--- Demo: oops ---");
    const story = new Storyteller({ origin: { where: { app: "web", page: "Profile" } } });

    story.report("User updated email", { who: { id: "user:99" }, what: { field: "email" } });
    story.report("Validation passed", { what: "email format" });
    story.report("Write failed", { where: "primary-db", error: new Error("connection timeout") });

    story.finish("Profile update failed", { level: "oops", error: new Error("db timeout") });
  }

  /** Live narration: each beat prints as it happens, then the record lands */
  static demoLive() {
    console.log("\n--- Demo: live narration ---");
    const story = new Storyteller({ origin: { who: "sync-agent" }, narration: "live" });

    story.report("Fetching invoices", { what: { source: "stripe", page: 1 } });
    story.report("Rate limited, backing off", { level: "warn", where: "upstream" });
    story.report({ message: "Retry succeeded", attempt: 2, apiKey: "sk-live-SHOULD-NOT-APPEAR" });

    const chapter = story.chapter({ origin: { what: "acct-1" } });
    chapter.report("Reconciling");
    chapter.finish("Synced acct-1");

    story.finish("Sync complete");
  }
}

ConsoleTestRunner.run();
