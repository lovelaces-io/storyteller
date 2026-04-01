import {
  Storyteller,
  ANSI,
  getLevelColor,
  colorizeJsonSections,
} from "../dist/index.js";

/** Runs all three demo scenarios (tell, warn, oops) to visually verify console output */
class ConsoleTestRunner {
  static run() {
    ConsoleTestRunner.demoTell();
    ConsoleTestRunner.demoWarn();
    ConsoleTestRunner.demoOops();
  }

  static demoTell() {
    console.log("\n--- Demo: tell ---");
    const story = new Storyteller({
      origin: { where: { app: "web", page: "Dashboard" } },
    });

    story.note("User opened dashboard", {
      who: { id: "user:42" },
      where: { component: "DashboardPage" },
    });
    story.note("Loaded widgets", {
      what: { count: 6 },
      where: { component: "WidgetGrid" },
    });
    story.note("Dashboard ready", { what: "initial render complete" });

    ConsoleTestRunner.printSummary(story, "tell", "Dashboard loaded");
    story.tell("Dashboard loaded");
  }

  static demoWarn() {
    console.log("\n--- Demo: warn ---");
    const story = new Storyteller({
      origin: { where: { app: "checkout", page: "Payment" } },
    });

    story.note("User submitted payment", {
      who: "user:413",
      where: "CheckoutForm",
    });
    story.note("Gateway response slow", {
      what: "stripe:charge",
      where: { service: "payments", route: "/charge" },
    });
    story.note("Retry scheduled", {
      what: { strategy: "retry", attempt: 2 },
      where: { component: "PaymentService" },
    });

    ConsoleTestRunner.printSummary(story, "warn", "Payment gateway slow");
    story.warn("Payment gateway slow");
  }

  static demoOops() {
    console.log("\n--- Demo: oops ---");
    const story = new Storyteller({
      origin: { where: { app: "profile", page: "Settings" } },
    });

    const error = new Error("db timeout");
    story.note("User updated email", {
      who: { id: "user:99", role: "member" },
      what: { field: "email" },
      where: { component: "ProfileForm" },
    });
    story.note("Validation passed", { what: "email format" });
    story.note("Write failed", {
      where: "primary-db",
      error,
    });

    ConsoleTestRunner.printSummary(story, "oops", "Failed to save profile", error);
    story.oops("Failed to save profile", error);
  }

  static printSummary(story, level, title, error) {
    const summary = story.summarize({
      title,
      level,
      error,
      detail: "full",
    });
    console.log(summary.text);
    const levelColor = getLevelColor(level);
    console.log(`${levelColor}Data${ANSI.reset}:`);
    const json = JSON.stringify(summary.data, null, 2);
    const colored = colorizeJsonSections(json, {
      base: ANSI.grayLight,
      notes: ANSI.grayDark,
      reset: ANSI.reset,
    });
    console.log(colored.join("\n"));
  }
}

ConsoleTestRunner.run();
