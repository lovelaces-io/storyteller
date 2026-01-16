import { Storyteller, summarizeStory } from "../dist/index.js";

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[38;2;250;128;114m",
  grayLight: "\x1b[37m",
  grayDark: "\x1b[37m",
};

class ConsoleTestRunner {
  static run() {
    // ConsoleTestRunner.demoTell();
    ConsoleTestRunner.demoWarn();
    ConsoleTestRunner.demoOops();
  }

  static demoTell() {
    // console.log("\n--- Demo: tell ---");
    const story = new Storyteller({
      origin: { where: { app: "web", page: "Dashboard" } }
    });

    story.note("User opened dashboard", {
      who: { id: "user:42" },
      where: { component: "DashboardPage" }
    });
    story.note("Loaded widgets", {
      what: { count: 6 },
      where: { component: "WidgetGrid" }
    });

    story.note("Dashboard ready", { what: "initial render complete" });

    ConsoleTestRunner.printSummary(story, "tell", "Dashboard loaded");
    // story.tell("Dashboard loaded");
  }

  static demoWarn() {
    console.log("\n--- Demo: warn ---");
    const story = new Storyteller({
      origin: { where: { app: "checkout", page: "Payment" } }
    });

    story.note("User submitted payment", {
      who: "user:413",
      where: "CheckoutForm"
    });
    story.note("Gateway response slow", {
      what: "stripe:charge",
      where: { service: "payments", route: "/charge" }
    });
    story.note("Retry scheduled", {
      what: { strategy: "retry", attempt: 2 },
      where: { component: "PaymentService" }
    });

    ConsoleTestRunner.printSummary(story, "warn", "Payment gateway slow");
    story.warn("Payment gateway slow");
  }

  static demoOops() {
    console.log("\n--- Demo: oops ---");
    const story = new Storyteller({
      origin: { where: { app: "profile", page: "Settings" } }
    });

    const error = new Error("db timeout");
    story.note("User updated email", {
      who: { id: "user:99", role: "member" },
      what: { field: "email" },
      where: { component: "ProfileForm" }
    });
    story.note("Validation passed", { what: "email format" });
    story.note("Write failed", {
      where: "primary-db",
      error
    });

    ConsoleTestRunner.printSummary(story, "oops", "Failed to save profile", error);
    story.oops("Failed to save profile", error);
  }



  static buildEventSnapshot(story, level, title, err) {
    const origin = story.origin;
    const notes = Array.isArray(story.notes) ? [...story.notes] : [];
    return {
      ts: new Date().toISOString(),
      level,
      title,
      ...(origin ? { origin } : {}),
      notes,
      ...(err ? { error: ConsoleTestRunner.normalizeError(err) } : {})
    };
  }

  static normalizeError(err) {
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack
      };
    }
    return { message: String(err) };
  }

  static printSummary(story, level, title, err) {
    const event = ConsoleTestRunner.buildEventSnapshot(
      story,
      level,
      title,
      err
    );
    const summary = summarizeStory(event, { verbosity: "full" });
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

function getLevelColor(level) {
  if (level === "tell") return ANSI.green;
  if (level === "warn") return ANSI.yellow;
  return ANSI.red;
}

function colorizeJsonSections(json, colors) {
  const lines = json.split("\n");
  let inNotes = false;
  let notesDepth = 0;

  return lines.map((line) => {
    if (!inNotes && line.includes('"notes": [')) {
      inNotes = true;
      notesDepth = countBrackets(line);
      return `${colors.notes}${line}${colors.reset}`;
    }

    if (inNotes) {
      const colored = `${colors.notes}${line}${colors.reset}`;
      notesDepth += countBrackets(line);
      if (notesDepth <= 0) inNotes = false;
      return colored;
    }

    return `${colors.base}${line}${colors.reset}`;
  });
}

function countBrackets(line) {
  const open = (line.match(/\[/g) || []).length;
  const close = (line.match(/\]/g) || []).length;
  return open - close;
}
