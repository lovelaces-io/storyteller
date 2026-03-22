// src/audiences/consoleAudience.ts
function consoleAudience() {
  return {
    name: "console",
    hear: (event) => {
      const label = "Storyteller";
      const style = event.level === "tell" ? "color:#16a34a;font-weight:600" : event.level === "warn" ? "color:#f59e0b;font-weight:600" : "color:#dc2626;font-weight:600";
      const header = `${label}: ${event.title}`;
      console.groupCollapsed(`%c${header}`, style);
      const payload = JSON.stringify(event, null, 2);
      const coloredPayload = event.level === "oops" ? `\x1B[38;2;250;128;114m${payload}\x1B[0m` : payload;
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
  const w = origin.where;
  const parts = [w.app, w.service, w.page, w.component].filter(Boolean).map(String);
  return parts.length ? parts.join(" / ") : void 0;
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

// src/storyteller.ts
var AudienceRegistry = class {
  map = /* @__PURE__ */ new Map();
  add(member) {
    this.map.set(member.name, member);
    return this;
  }
  remove(name) {
    this.map.delete(name);
    return this;
  }
  getAll() {
    return [...this.map.values()];
  }
  getOnly(names) {
    return names.map((n) => this.map.get(n)).filter(Boolean);
  }
};
var Storyteller = class {
  audience = new AudienceRegistry();
  origin;
  notes = [];
  constructor(opts) {
    this.origin = opts?.origin;
    this.audience.add(consoleAudience());
    opts?.audiences?.forEach((a) => this.audience.add(a));
  }
  note(text, data = {}) {
    this.notes.push({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      note: text,
      ...data.who ? { who: data.who } : {},
      ...data.what ? { what: data.what } : {},
      ...data.where ? { where: data.where } : {},
      ...data.error ? { error: normalizeError(data.error) } : {}
    });
    return this;
  }
  reset() {
    this.notes = [];
    return this;
  }
  summarize(opts = {}) {
    const {
      title = "Story preview",
      level = "tell",
      error,
      ...summaryOpts
    } = opts;
    const event = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      title,
      ...this.origin ? { origin: this.origin } : {},
      notes: [...this.notes],
      ...error ? { error: normalizeError(error) } : {}
    };
    return summarizeStory(event, summaryOpts);
  }
  tell(title) {
    return this.createDelivery("tell", title);
  }
  warn(title) {
    return this.createDelivery("warn", title);
  }
  oops(title, err) {
    return this.createDelivery("oops", title, err);
  }
  createDelivery(level, title, err) {
    const event = this.buildEvent(level, title, err);
    let delivered = false;
    let cancelledDefault = false;
    queueMicrotask(() => {
      if (delivered || cancelledDefault) return;
      delivered = true;
      void this.deliver(event);
    });
    return {
      to: (...names) => {
        cancelledDefault = true;
        if (delivered) return;
        delivered = true;
        void this.deliver(event, { only: names });
      }
    };
  }
  buildEvent(level, title, err) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const notes = [...this.notes];
    this.notes = [];
    const event = {
      ts: now,
      level,
      title,
      ...this.origin ? { origin: this.origin } : {},
      notes,
      ...err ? { error: normalizeError(err) } : {}
    };
    const eventWithSummary = event;
    Object.defineProperty(eventWithSummary, "summarize", {
      value: (opts) => summarizeStory(event, opts),
      enumerable: false
    });
    return eventWithSummary;
  }
  async deliver(event, opts) {
    const members = opts?.only?.length ? this.audience.getOnly(opts.only) : this.audience.getAll();
    await Promise.allSettled(
      members.filter((m) => m.accepts ? m.accepts(event) : true).map((m) => m.hear(event))
    );
  }
};
function normalizeError(err) {
  if (err instanceof Error) {
    const normalized = {
      name: err.name,
      message: err.message
    };
    if (err.stack !== void 0) {
      normalized.stack = err.stack;
    }
    const cause = err.cause;
    if (cause !== void 0) {
      normalized.cause = cause;
    }
    return normalized;
  }
  return { message: String(err) };
}
function summarizeNotes(notes) {
  if (notes.length <= 1) {
    return {
      durationMs: void 0
    };
  }
  const start = Date.parse(notes[0].ts);
  const end = Date.parse(notes[notes.length - 1].ts);
  return {
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : void 0
  };
}
function summarizeStory(story, opts = {}) {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotes = 50,
    showData = true,
    colorize = true
  } = opts;
  const dateTimeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
  const orderedNotes = [...story.notes].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts)
  );
  const summary = summarizeNotes(orderedNotes);
  const originLabel = formatOrigin(story.origin);
  const duration = summary.durationMs != null ? formatDuration(summary.durationMs) : void 0;
  const slicedNotes = orderedNotes.slice(0, maxNotes);
  const notes = slicedNotes.map((note) => ({
    ts: note.ts,
    when: timeFmt.format(new Date(note.ts)),
    note: note.note,
    text: formatNote(note, verbosity),
    ...note.who ? { who: note.who } : {},
    ...note.what ? { what: note.what } : {},
    ...note.where ? { where: note.where } : {},
    ...note.error ? { error: note.error } : {}
  }));
  const data = {
    title: story.title,
    level: story.level,
    when: dateTimeFmt.format(new Date(story.ts)),
    ...summary.durationMs != null ? { durationMs: summary.durationMs } : {},
    ...duration ? { duration } : {},
    ...story.origin ? { origin: story.origin } : {},
    notes,
    ...story.error ? { error: story.error } : {}
  };
  const levelColor = getLevelColor(story.level);
  const label = (text) => colorize ? `${levelColor}${text}${ANSI.reset}` : text;
  const lines = [];
  lines.push(`${label("StorytellerSummary")}: ${story.title}`);
  lines.push(`${label("Time")}: ${data.when}${duration ? ` (${duration})` : ""}`);
  if (originLabel) {
    lines.push(`${label("Origin")}: ${originLabel}`);
  }
  if (story.error) {
    const errLine = [story.error.name, story.error.message].filter(Boolean).join(": ");
    if (errLine) lines.push(`${label("?")}: ${errLine}`);
  }
  if (verbosity !== "brief" && notes.length) {
    lines.push(`${label("Notes")}:`);
    for (const note of notes) {
      lines.push(`- ${note.when} - ${note.text}`);
    }
    if (orderedNotes.length > notes.length) {
      lines.push(`\u2026 (${orderedNotes.length - notes.length} more)`);
    }
  }
  if (showData) {
    lines.push(`${label("Story")}:`);
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
function formatDuration(ms) {
  if (ms < 1e3) return `${ms}ms`;
  const s = ms / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60).toString().padStart(2, "0");
  return `${m}:${r}m`;
}
function formatNote(note, verbosity) {
  if (verbosity !== "full") return note.note;
  const extras = [];
  const what = note.what;
  const where = note.where;
  if (typeof what === "string") {
    extras.push(`what=${what}`);
  } else if (what) {
    if (what.field) extras.push(`field=${String(what.field)}`);
    if (what.status) extras.push(`status=${String(what.status)}`);
  }
  if (typeof where === "string") {
    extras.push(`where=${where}`);
  } else if (where) {
    if (where.component) extras.push(`component=${String(where.component)}`);
  }
  if (note.error) {
    const errLine = [note.error.name, note.error.message].filter(Boolean).join(": ");
    if (errLine) extras.push(`error=${errLine}`);
  }
  return extras.length ? `${note.note} (${extras.join(" ")})` : note.note;
}

// src/useStoryteller.ts
var shared;
function useStoryteller(opts = {}) {
  if (!shared || opts.reset) {
    shared = new Storyteller({ origin: opts.origin });
    return shared;
  }
  return shared;
}

// src/audiences/dbAudience.ts
function dbAudience(insert) {
  return {
    name: "db",
    accepts: (e) => e.level === "warn" || e.level === "oops",
    hear: async (e) => {
      await insert(e);
    }
  };
}

// src/report/writeStoryReport.ts
function writeStoryReport(stories, opts = {}) {
  const {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale = "en-US",
    verbosity = "normal",
    maxNotesPerStory = 50,
    showData = true,
    colorize = true
  } = opts;
  if (!stories.length) {
    return "Storyteller Report\n\n(no stories)\n";
  }
  const sorted = [...stories].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts)
  );
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) {
    return "Storyteller Report\n\n(no stories)\n";
  }
  const lines = [];
  lines.push(`Storyteller Report (${timezone})`);
  lines.push(
    `Range: ${dateFmt.format(new Date(first.ts))} \u2013 ${dateFmt.format(
      new Date(last.ts)
    )}`
  );
  lines.push("");
  const byDay = /* @__PURE__ */ new Map();
  for (const s of sorted) {
    const key = dateFmt.format(new Date(s.ts));
    const arr = byDay.get(key) ?? [];
    arr.push(s);
    byDay.set(key, arr);
  }
  for (const [day, dayStories] of byDay) {
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
      lines.push(`${label("StorytellerSummary")}: ${story.title}`);
      lines.push(`${label("Time")}: ${data.when}${duration}`);
      if (originLabel) {
        lines.push(`${label("Origin")}: ${originLabel}`);
      }
      if (data.error) {
        const errLine = [
          data.error.name,
          data.error.message
        ].filter(Boolean).join(": ");
        if (errLine) lines.push(`${label("?")}: ${errLine}`);
      }
      if (verbosity !== "brief" && data.notes.length) {
        lines.push(`  ${label("Notes")}:`);
        for (const n of data.notes) {
          lines.push(`    ${n.when} - ${n.text}`);
        }
        if (story.notes.length > data.notes.length) {
          lines.push(
            `    \u2026 (${story.notes.length - data.notes.length} more)`
          );
        }
      }
      if (showData) {
        lines.push(`${label("Story")}:`);
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
export {
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
};
//# sourceMappingURL=index.js.map