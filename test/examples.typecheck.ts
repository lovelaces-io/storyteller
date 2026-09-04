/**
 * Documentation examples, compiled against the real types.
 *
 * Not a test suite — vitest ignores this file — but `npm run typecheck` covers
 * it, so a doc sample that stops compiling fails the build instead of quietly
 * teaching something wrong.
 */
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
          content:
            "```\n" +
            (event.kind === "story" ? event.summarize({ colors: false, detail: "brief" }).text : event.note) +
            "\n```",
        }),
      });
    },
  });
}
