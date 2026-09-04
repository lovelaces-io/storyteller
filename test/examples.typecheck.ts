/**
 * Documentation examples, compiled against the real types.
 *
 * Not a test suite — vitest ignores this file — but `npm run typecheck` covers
 * it, so a doc sample that stops compiling fails the build instead of quietly
 * teaching something wrong.
 */
import type { StoryEvent } from "../src/storyteller";
import { Storyteller } from "../src/storyteller";

/** README + site: post only the failures to a Discord webhook */
export function discordExample(story: Storyteller) {
  story.audience.add({
    name: "discord",
    accepts: (event) => event.level === "Error",
    // hear() must return void — awaiting and discarding the Response is what
    // makes this compile in a strict project, and lets a failed POST surface
    // through onAudienceError instead of vanishing as an unhandled rejection
    hear: async (event) => {
      await fetch(process.env["DISCORD_WEBHOOK_URL"]!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // A default audience hears stories only, so `event` is a StoryEvent here
          content: "```\n" + event.summarize({ colors: false, detail: "brief" }).text + "\n```",
        }),
      });
    },
  });
}


/** 0.3.1: an audience written for 0.2 — no `hears`, helper typed for StoryEvent — compiles unchanged */
export function legacyAudienceStillCompiles(story: Storyteller) {
  const hasPersistMarker = (event: StoryEvent): boolean =>
    event.notes.some((note) => note.note === "__persist__");
  const persist = async (event: StoryEvent) => {
    void event.title;
  };
  story.audience.add({
    name: "db",
    accepts: (event) => event.level !== "Information" || hasPersistMarker(event),
    hear: persist,
  });
}

/** Inference from `hears`: note-only gets a NoteEmission, both gets the union */
export function hearsInference(story: Storyteller) {
  story.audience.add({
    name: "beats",
    hears: ["note"],
    hear: (beat) => {
      const sequence: number = beat.sequence;
      void sequence;
    },
  });
  story.audience.add({
    name: "everything",
    hears: ["note", "story"],
    hear: (emission) => {
      if (emission.kind === "story") void emission.title;
      else void emission.sequence;
    },
  });
  story.audience.add({
    name: "wrong",
    hears: ["note"],
    // @ts-expect-error — a note has no title; the type must say so
    hear: (beat) => void beat.title,
  });
}
