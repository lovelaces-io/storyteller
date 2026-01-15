// src/audiences/consoleAudience.ts
function consoleAudience() {
  return {
    name: "console",
    hear: (event) => {
      const label = "Storyteller:";
      const style = event.level === "tell" ? "color:#16a34a;font-weight:600" : event.level === "warn" ? "color:#f59e0b;font-weight:600" : "color:#dc2626;font-weight:600";
      console.groupCollapsed(`%c${label}%c ${event.title}`, style, "");
      console.log(event);
      console.groupEnd();
    }
  };
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
      ...data.where ? { where: data.where } : {}
    });
    return this;
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
    const summary = summarizeNotes(notes);
    const event = {
      ts: now,
      level,
      title,
      ...this.origin ? { origin: this.origin } : {},
      summary: {
        noteCount: notes.length,
        ...summary.durationMs != null ? { durationMs: summary.durationMs } : {},
        ...summary.who ? { who: summary.who } : {},
        ...summary.what ? { what: summary.what } : {},
        ...summary.where ? { where: summary.where } : {}
      },
      notes
    };
    if (err) {
      event.error = normalizeError(err);
    }
    return event;
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
  if (notes.length <= 1) return { durationMs: void 0, who: void 0, what: void 0, where: void 0 };
  const start = Date.parse(notes[0].ts);
  const end = Date.parse(notes[notes.length - 1].ts);
  const merged = { who: {}, what: {}, where: {} };
  let whoUsed = false, whatUsed = false, whereUsed = false;
  for (const n of notes) {
    if (n.who) {
      Object.assign(merged.who, n.who);
      whoUsed = true;
    }
    if (n.what) {
      Object.assign(merged.what, n.what);
      whatUsed = true;
    }
    if (n.where) {
      Object.assign(merged.where, n.where);
      whereUsed = true;
    }
  }
  return {
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : void 0,
    who: whoUsed ? merged.who : void 0,
    what: whatUsed ? merged.what : void 0,
    where: whereUsed ? merged.where : void 0
  };
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
    maxNotesPerStory = 50
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
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
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
      const when = timeFmt.format(new Date(story.ts));
      const duration = story.summary.durationMs != null ? ` (${formatDuration(story.summary.durationMs)})` : "";
      lines.push(
        `- [${story.level.toUpperCase()}] ${story.title}`
      );
      lines.push(`  Time: ${when}${duration}`);
      const origin = formatOrigin(story.origin);
      if (origin) {
        lines.push(`  Origin: ${origin}`);
      }
      const summary = formatSummary(story.summary);
      if (summary) {
        lines.push(`  Summary: ${summary}`);
      }
      if (story.level === "oops" && story.error) {
        const errLine = [
          story.error.name,
          story.error.message
        ].filter(Boolean).join(": ");
        lines.push(`  Error: ${errLine}`);
      }
      if (verbosity !== "brief" && story.notes.length) {
        lines.push(`  Notes:`);
        const notes = story.notes.slice(0, maxNotesPerStory);
        for (const n of notes) {
          const t = timeFmt.format(new Date(n.ts));
          lines.push(`    ${t} - ${formatNote(n, verbosity)}`);
        }
        if (story.notes.length > notes.length) {
          lines.push(
            `    \u2026 (${story.notes.length - notes.length} more)`
          );
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n").trim() + "\n";
}
function formatDuration(ms) {
  if (ms < 1e3) return `${ms}ms`;
  const s = ms / 1e3;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60).toString().padStart(2, "0");
  return `${m}:${r}m`;
}
function formatOrigin(origin) {
  if (!origin?.where) return;
  const w = origin.where;
  const parts = [
    w.app,
    w.service,
    w.page,
    w.component
  ].filter(Boolean).map(String);
  return parts.length ? parts.join(" / ") : void 0;
}
function formatSummary(summary) {
  const parts = [];
  const what = summary.what;
  const where = summary.where;
  if (what?.op) parts.push(`op=${what.op}`);
  if (what?.status) parts.push(`status=${what.status}`);
  if (where?.route) parts.push(`route=${where.route}`);
  if (summary.noteCount) parts.push(`notes=${summary.noteCount}`);
  return parts.length ? parts.join(" ") : void 0;
}
function formatNote(note, verbosity) {
  if (verbosity !== "full") return note.note;
  const extras = [];
  const what = note.what;
  const where = note.where;
  if (what?.field) extras.push(`field=${what.field}`);
  if (what?.status) extras.push(`status=${what.status}`);
  if (where?.component) extras.push(`component=${where.component}`);
  return extras.length ? `${note.note} (${extras.join(" ")})` : note.note;
}
export {
  Storyteller,
  consoleAudience,
  dbAudience,
  writeStoryReport
};
//# sourceMappingURL=index.js.map