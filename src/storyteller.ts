import { consoleAudience } from "./audiences/consoleAudience";

export type StoryLevel = "tell" | "warn" | "oops";

export type StoryNote = {
  ts: string;
  note: string;
  who?: Record<string, unknown>;
  what?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

export type StoryEvent = {
  ts: string;
  level: StoryLevel;
  title: string;

  origin?: {
    who?: Record<string, unknown>;
    what?: Record<string, unknown>;
    where?: Record<string, unknown>;
  };

  summary: {
    noteCount: number;
    durationMs?: number;
    who?: Record<string, unknown>;
    what?: Record<string, unknown>;
    where?: Record<string, unknown>;
  };

  notes: StoryNote[];

  error?: { name?: string; message?: string; stack?: string; cause?: unknown };
};

type StoryError = NonNullable<StoryEvent["error"]>;

export type AudienceMember = {
  name: string;
  accepts?: (event: StoryEvent) => boolean;
  hear: (event: StoryEvent) => void | Promise<void>;
};

type NoteData = {
  who?: Record<string, unknown>;
  what?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

class AudienceRegistry {
  private map = new Map<string, AudienceMember>();

  add(member: AudienceMember) {
    this.map.set(member.name, member);
    return this;
  }
  remove(name: string) {
    this.map.delete(name);
    return this;
  }
  getAll() {
    return [...this.map.values()];
  }
  getOnly(names: string[]) {
    return names.map((n) => this.map.get(n)).filter(Boolean) as AudienceMember[];
  }
}

export class Storyteller {
  public readonly audience = new AudienceRegistry();

  private readonly origin?: StoryEvent["origin"];
  private notes: StoryNote[] = [];

  constructor(opts?: { origin?: StoryEvent["origin"]; audiences?: AudienceMember[] }) {
    this.origin = opts?.origin;

    // default console audience (all levels)
    this.audience.add(consoleAudience());

    opts?.audiences?.forEach((a) => this.audience.add(a));
  }

  note(text: string, data: NoteData = {}) {
    this.notes.push({
      ts: new Date().toISOString(),
      note: text,
      ...(data.who ? { who: data.who } : {}),
      ...(data.what ? { what: data.what } : {}),
      ...(data.where ? { where: data.where } : {}),
    });
    return this;
  }

  tell(title: string) {
    return this.createDelivery("tell", title);
  }
  warn(title: string) {
    return this.createDelivery("warn", title);
  }
  oops(title: string, err?: unknown) {
    return this.createDelivery("oops", title, err);
  }

  private createDelivery(level: StoryLevel, title: string, err?: unknown) {
    const event = this.buildEvent(level, title, err);

    // default: all audiences (scheduled so `.to()` can override)
    let delivered = false;
    let cancelledDefault = false;

    queueMicrotask(() => {
      if (delivered || cancelledDefault) return;
      delivered = true;
      void this.deliver(event);
    });

    return {
      to: (...names: string[]) => {
        cancelledDefault = true;
        if (delivered) return;
        delivered = true;
        void this.deliver(event, { only: names });
      },
    };
  }

  private buildEvent(level: StoryLevel, title: string, err?: unknown): StoryEvent {
    const now = new Date().toISOString();
    const notes = [...this.notes];

    // clear notes after telling the story (your desired behavior)
    this.notes = [];

    const summary = summarizeNotes(notes);

    const event: StoryEvent = {
      ts: now,
      level,
      title,
      ...(this.origin ? { origin: this.origin } : {}),
      summary: {
        noteCount: notes.length,
        ...(summary.durationMs != null ? { durationMs: summary.durationMs } : {}),
        ...(summary.who ? { who: summary.who } : {}),
        ...(summary.what ? { what: summary.what } : {}),
        ...(summary.where ? { where: summary.where } : {}),
      },
      notes,
    };

    if (err) {
      event.error = normalizeError(err);
    }

    return event;
  }

  private async deliver(event: StoryEvent, opts?: { only?: string[] }) {
    const members = opts?.only?.length ? this.audience.getOnly(opts.only) : this.audience.getAll();

    await Promise.allSettled(
      members
        .filter((m) => (m.accepts ? m.accepts(event) : true))
        .map((m) => m.hear(event))
    );
  }
}

function normalizeError(err: unknown): StoryError {
  if (err instanceof Error) {
    const normalized: StoryError = {
      name: err.name,
      message: err.message,
    };

    if (err.stack !== undefined) {
      normalized.stack = err.stack;
    }

    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) {
      normalized.cause = cause;
    }

    return normalized;
  }

  return { message: String(err) };
}

function summarizeNotes(notes: StoryNote[]) {
  if (notes.length <= 1) return { durationMs: undefined as number | undefined, who: undefined, what: undefined, where: undefined };

  const start = Date.parse(notes[0]!.ts);
  const end = Date.parse(notes[notes.length - 1]!.ts);

  const merged = { who: {} as Record<string, unknown>, what: {} as Record<string, unknown>, where: {} as Record<string, unknown> };
  let whoUsed = false, whatUsed = false, whereUsed = false;

  for (const n of notes) {
    if (n.who) { Object.assign(merged.who, n.who); whoUsed = true; }
    if (n.what) { Object.assign(merged.what, n.what); whatUsed = true; }
    if (n.where) { Object.assign(merged.where, n.where); whereUsed = true; }
  }

  return {
    durationMs: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : undefined,
    who: whoUsed ? merged.who : undefined,
    what: whatUsed ? merged.what : undefined,
    where: whereUsed ? merged.where : undefined,
  };
}
