import type { StoryEventBase } from "./storyteller";
import { Storyteller } from "./storyteller";

let shared: Storyteller | undefined;

type StorytellerSharedOptions = {
  origin?: StoryEventBase["origin"];
  reset?: boolean;
};

export function useStoryteller(
  opts: StorytellerSharedOptions = {}
): Storyteller {
  if (!shared || opts.reset) {
    shared = new Storyteller({ origin: opts.origin });
    return shared;
  }

  return shared;
}
