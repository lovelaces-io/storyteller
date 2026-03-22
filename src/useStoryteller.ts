import type { StoryEventBase } from "./storyteller";
import { Storyteller } from "./storyteller";

let sharedInstance: Storyteller | undefined;

type StorytellerSharedOptions = {
  origin?: StoryEventBase["origin"];
  reset?: boolean;
};

/** Return a shared singleton Storyteller instance for cross-component or cross-service logging */
export function useStoryteller(
  options: StorytellerSharedOptions = {}
): Storyteller {
  if (!sharedInstance || options.reset) {
    sharedInstance = new Storyteller({ origin: options.origin });
    return sharedInstance;
  }

  return sharedInstance;
}
