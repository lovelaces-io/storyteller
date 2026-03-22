"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ANSI: () => ANSI,
  Storyteller: () => Storyteller,
  colorizeJsonSections: () => colorizeJsonSections,
  consoleAudience: () => consoleAudience,
  countBrackets: () => countBrackets,
  dbAudience: () => dbAudience,
  formatOrigin: () => formatOrigin,
  getLevelColor: () => getLevelColor,
  summarizeStory: () => summarizeStory,
  useStoryteller: () => useStoryteller,
  writeStoryReport: () => writeStoryReport
});
module.exports = __toCommonJS(index_exports);

// src/utils.ts
var ANSI = {
  reset: "\x1B[0m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[38;2;250;128;114m",
  grayLight: "\x1B[37m",
  grayDark: "\x1B[37m"
};
function getLevelColor(level) {
  if (level === "tell") return ANSI.green;
  if (level === "warn") return ANSI.yellow;
  return ANSI.red;
}
function formatOrigin(origin) {
  if (!origin?.where) return;
  if (typeof origin.where === "string") return origin.where;
  const whereRecord = origin.where;
  const parts = [whereRecord.app, whereRecord.service, whereRecord.page, whereRecord.component].filter(Boolean).map(String);
  return parts.length ? parts.join(" / ") : void 0;
}
function colorizeJsonSections(json, colors) {
  const lines = json.split("\n");
  let insideNotes = false;
  let bracketDepth = 0;
  return lines.map((line) => {
    if (!insideNotes && line.includes('"notes": [')) {
      insideNotes = true;
      bracketDepth = countBrackets(line);
      return `${colors.notes}${line}${colors.reset}`;
    }
    if (insideNotes) {
      const colored = `${colors.notes}${line}${colors.reset}`;
      bracketDepth += countBrackets(line);
      if (bracketDepth <= 0) insideNotes = false;
      return colored;
    }
    return `${colors.base}${line}${colors.reset}`;
  });
}
function countBrackets(line) {
  const openCount = (line.match(/\[/g) || []).length;
  const closeCount = (line.match(/\]/g) || []).length;
  return openCount - closeCount;
}

// src/audiences/consoleAudience.ts
function consoleAudience() {
  return {
    name: "console",
    hear: (event) => {
      const prefix = "Storyteller";
      const style = event.level === "tell" ? "color:#16a34a;font-weight:600" : event.level === "warn" ? "color:#f59e0b;font-weight:600" : "color:#dc2626;font-weight:600";
      const header = `${prefix}: ${event.title}`;
      console.groupCollapsed(`%c${header}`, style);
      const payload = JSON.stringify(event, null, 2);
      const coloredPayload = event.level === "oops" ? `${ANSI.red}${payload}${ANSI.reset}` : payload;
      if (event.level === "tell") {
        console.log(header, payload);
      } else if (event.level === "warn") {
        console.warn(header, payload);
      } else {
        console.error(header, coloredPayload);
      }
      console.groupEnd();
    }
  };
}

// src/storyteller.ts
var AudienceRegistry = class {
  members = /* @__PURE__ */ new Map();
  /** Register an audience member, replacing any existing member with the same name */
  add(member) {
    this.members.set(member.name, member);
    return this;
  }
  /** Remove an audience member by name */
  remove(name) {
    this.members.delete(name);
    return this;
  }
  /** Return all registered audience members */
  getAll() {
    return [...this.members.values()];
  }
  /** Return only the audience members matching the given names */
  getOnly(names) {
    return names.map((name) => this.members.get(name)).filter(Boolean);
  }
};
var Storyteller = class {
  audience = new AudienceRegistry();
  origin;
  notes = [];
  constructor(options) {
    this.origin = options?.origin;
    this.audience.add(consoleAudience());
    options?.audiences?.forEach((audience) => this.audience.add(audience));
  }
  /** Add a timestamped note with optional context (who, what, where, error) */
  note(text, data = {}) {
    this.notes.push({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      note: text,
      ...data.who ? { who: data.who } : {},
      ...data.what ? { what: data.what } : {},
      ...data.where ? { where: data.where } : {},
      ...data.error ? { error: normalizeError(data.error) } : {}
    });
    return this;
  }
  /** Clear all accumulated notes without emitting a story */
  reset() {
    this.notes = [];
    return this;
  }
  /** Generate a formatted summary of current notes without emitting or clearing them */
  summarize(options = {}) {
    const {
      title = "Story preview",
      level = "tell",
      error,
      ...summaryOptions
    } = options;
    const event = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      title,
      ...this.origin ? { origin: this.origin } : {},
      notes: [...this.notes],
      ...error ? { error: normalizeError(error) } : {}
    };
    return summarizeStory(event, summaryOptions);
  }
  /** Emit a story at the "tell" level (success / informational) */
  tell(title) {
    return this.createDelivery("tell", title);
  }
  /** Emit a story at the "warn" level (something was off) */
  warn(title) {
    return this.createDelivery("warn", title);
  }
  /** Emit a story at the "oops" level (something broke) with an optional error */
  oops(title, error) {
    return this.createDelivery("oops", title, error);
  }
  /** Build a story event and schedule delivery, returning a handle to override the audience list */
  createDelivery(level, title, error) {
    const event = this.buildEvent(level, title, error);
    let delivered = false;
    let defaultCancelled = false;
    queueMicrotask(() => {
      if (delivered || defaultCancelled) return;
      delivered = true;
      void this.deliver(event);
    });
    return {
      to: (...names) => {
        defaultCancelled = true;
        if (delivered) return;
        delivered = true;
        void this.deliver(event, { only: names });
      }
    };
  }
  /** Assemble the story event from current notes and clear notes for the next story */
  buildEvent(level, title, error) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const collectedNotes = [...this.notes];
    this.notes = [];
    const event = {
      timestamp: now,
      level,
      title,
      ...this.origin ? { origin: this.origin } : {},
      notes: collectedNotes,
      ...error ? { error: normalizeError(error) } : {}
    };
    const eventWithSummary = event;
    Object.defineProperty(eventWithSummary, "summarize", {
      value: (options) => summarizeStory(event, options),
      enumerable: false
    });
    return eventWithSummary;
  }
  /** Deliver a story event to matching audience members */
  async deliver(event, options) {
    const targets = options?.only?.length ? this.audience.getOnly(options.only) : this.audience.getAll();
    await Promise.allSettled(
      targets.filter((member) => member.accepts ? member.accepts(event) : true).map((member) => member.hear(event))
    );
  }
};
function normalizeError(rawError) {
  if (rawError instanceof Error) {
    const normalized = {
      name: rawError.name,
      message: rawError.message
    };
    if (rawError.stack !== void 0) {
      normalized.stack = rawError.stack;
    }
    const cause = rawError.cause;
    if (cause !== void 0) {
      normalized.cause = cause;
    }
    return normalized;
  }
  return { message: String(rawError) };
}
function calculateNoteDuration(notes) {
  if (notes.length <= 1) {
    return {
      durationMs: void 0
    };
  }
  const startTime = Date.parse(notes[0].timestamp);
  const endTime = Date.parse(notes[notes.length - 1].timestamp);
  return {
    durationMs: Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.max(0, endTime - startTime) : void 0
  };
}
function summarizeStory(story, options = {}) {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotes = 50,
    showData = true,
    colorize = true
  } = options;
  const dateTimeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const orderedNotes = [...story.notes].sort(
    (noteA, noteB) => Date.parse(noteA.timestamp) - Date.parse(noteB.timestamp)
  );
  const noteTiming = calculateNoteDuration(orderedNotes);
  const originLabel = formatOrigin(story.origin);
  const duration = noteTiming.durationMs != null ? formatDuration(noteTiming.durationMs) : void 0;
  const slicedNotes = orderedNotes.slice(0, maxNotes);
  const summaryNotes = slicedNotes.map((note) => ({
    timestamp: note.timestamp,
    when: timeFormatter.format(new Date(note.timestamp)),
    note: note.note,
    text: formatNoteText(note, verbosity),
    ...note.who ? { who: note.who } : {},
    ...note.what ? { what: note.what } : {},
    ...note.where ? { where: note.where } : {},
    ...note.error ? { error: note.error } : {}
  }));
  const data = {
    title: story.title,
    level: story.level,
    when: dateTimeFormatter.format(new Date(story.timestamp)),
    ...noteTiming.durationMs != null ? { durationMs: noteTiming.durationMs } : {},
    ...duration ? { duration } : {},
    ...story.origin ? { origin: story.origin } : {},
    notes: summaryNotes,
    ...story.error ? { error: story.error } : {}
  };
  const levelColor = getLevelColor(story.level);
  const label = (text) => colorize ? `${levelColor}${text}${ANSI.reset}` : text;
  const lines = [];
  lines.push(`${label("Story")}: ${story.title}`);
  lines.push(`${label("Level")}: ${story.level}`);
  lines.push(`${label("Time")}: ${data.when}${duration ? ` (${duration})` : ""}`);
  if (originLabel) {
    lines.push(`${label("Origin")}: ${originLabel}`);
  }
  if (story.error) {
    const errorLine = [story.error.name, story.error.message].filter(Boolean).join(": ");
    if (errorLine) lines.push(`${label("Error")}: ${errorLine}`);
  }
  if (verbosity !== "brief" && summaryNotes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of summaryNotes) {
      lines.push(`  ${note.when} \u2014 ${note.text}`);
    }
    if (orderedNotes.length > summaryNotes.length) {
      lines.push(`  \u2026 (${orderedNotes.length - summaryNotes.length} more)`);
    }
  }
  if (showData) {
    lines.push(`${label("Data")}:`);
    const json = JSON.stringify(data, null, 2);
    if (colorize) {
      const colored = colorizeJsonSections(json, {
        base: ANSI.grayLight,
        notes: ANSI.grayDark,
        reset: ANSI.reset
      });
      lines.push(...colored);
    } else {
      lines.push(...json.split("\n"));
    }
  }
  return { text: lines.join("\n"), data };
}
function formatDuration(milliseconds) {
  if (milliseconds < 1e3) return `${milliseconds}ms`;
  const seconds = milliseconds / 1e3;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}m`;
}
function formatNoteText(note, verbosity) {
  if (verbosity !== "full") return note.note;
  const details = [];
  const what = note.what;
  const where = note.where;
  if (typeof what === "string") {
    details.push(`what=${what}`);
  } else if (what) {
    if (what.field) details.push(`field=${String(what.field)}`);
    if (what.status) details.push(`status=${String(what.status)}`);
  }
  if (typeof where === "string") {
    details.push(`where=${where}`);
  } else if (where) {
    if (where.component) details.push(`component=${String(where.component)}`);
  }
  if (note.error) {
    const errorLine = [note.error.name, note.error.message].filter(Boolean).join(": ");
    if (errorLine) details.push(`error=${errorLine}`);
  }
  return details.length ? `${note.note} (${details.join(" ")})` : note.note;
}

// src/useStoryteller.ts
var sharedInstance;
function useStoryteller(options = {}) {
  if (!sharedInstance || options.reset) {
    sharedInstance = new Storyteller({ origin: options.origin });
    return sharedInstance;
  }
  return sharedInstance;
}

// src/audiences/dbAudience.ts
function dbAudience(insert) {
  return {
    name: "db",
    accepts: (event) => event.level === "warn" || event.level === "oops",
    hear: async (event) => {
      await insert(event);
    }
  };
}

// src/report/writeStoryReport.ts
function writeStoryReport(stories, options = {}) {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotesPerStory = 50,
    showData = true,
    colorize = true
  } = options;
  if (!stories.length) {
    return "Storyteller Report\n\n(no stories)\n";
  }
  const sorted = [...stories].sort(
    (storyA, storyB) => Date.parse(storyA.timestamp) - Date.parse(storyB.timestamp)
  );
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
  const firstStory = sorted[0];
  const lastStory = sorted[sorted.length - 1];
  if (!firstStory || !lastStory) {
    return "Storyteller Report\n\n(no stories)\n";
  }
  const lines = [];
  lines.push(`Storyteller Report (${timezone})`);
  lines.push(
    `Range: ${dateFormatter.format(new Date(firstStory.timestamp))} \u2013 ${dateFormatter.format(
      new Date(lastStory.timestamp)
    )}`
  );
  lines.push("");
  const storiesByDay = /* @__PURE__ */ new Map();
  for (const story of sorted) {
    const dayKey = dateFormatter.format(new Date(story.timestamp));
    const dayEvents = storiesByDay.get(dayKey) ?? [];
    dayEvents.push(story);
    storiesByDay.set(dayKey, dayEvents);
  }
  for (const [day, dayStories] of storiesByDay) {
    lines.push(day);
    for (const story of dayStories) {
      const summary = summarizeStory(story, {
        timezone,
        locale,
        verbosity,
        maxNotes: maxNotesPerStory,
        colorize
      });
      const { data } = summary;
      const originLabel = formatOrigin(story.origin);
      const levelColor = getLevelColor(story.level);
      const label = (text) => colorize ? `${levelColor}${text}${ANSI.reset}` : text;
      const duration = data.duration ? ` (${data.duration})` : "";
      lines.push(`${label("Story")}: ${story.title}`);
      lines.push(`${label("Level")}: ${story.level}`);
      lines.push(`${label("Time")}: ${data.when}${duration}`);
      if (originLabel) {
        lines.push(`${label("Origin")}: ${originLabel}`);
      }
      if (data.error) {
        const errorLine = [
          data.error.name,
          data.error.message
        ].filter(Boolean).join(": ");
        if (errorLine) lines.push(`${label("Error")}: ${errorLine}`);
      }
      if (verbosity !== "brief" && data.notes.length) {
        lines.push(`  ${label("Notes")}:`);
        for (const summaryNote of data.notes) {
          lines.push(`    ${summaryNote.when} \u2014 ${summaryNote.text}`);
        }
        if (story.notes.length > data.notes.length) {
          lines.push(
            `    \u2026 (${story.notes.length - data.notes.length} more)`
          );
        }
      }
      if (showData) {
        lines.push(`${label("Data")}:`);
        const json = JSON.stringify(data, null, 2);
        if (colorize) {
          const colored = colorizeJsonSections(json, {
            base: ANSI.grayLight,
            notes: ANSI.grayDark,
            reset: ANSI.reset
          });
          lines.push(...colored);
        } else {
          lines.push(...json.split("\n"));
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ANSI,
  Storyteller,
  colorizeJsonSections,
  consoleAudience,
  countBrackets,
  dbAudience,
  formatOrigin,
  getLevelColor,
  summarizeStory,
  useStoryteller,
  writeStoryReport
});
//# sourceMappingURL=index.cjs.map