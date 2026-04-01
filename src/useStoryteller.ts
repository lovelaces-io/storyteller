import type { StoryEventBase } from "./storyteller";
import { Storyteller } from "./storyteller";

let sharedInstance: Storyteller | undefined;

type StorytellerSharedOptions = {
  origin?: StoryEventBase["origin"];
  reset?: boolean;
};

/**
 * Get or create a shared Storyteller instance for cross-component logging.
 * First call creates the instance; subsequent calls return the same one.
 *
 * @param options.origin - Origin context for the shared instance
 * @param options.reset - Create a fresh instance (useful in tests)
 *
 * @example
 * ```ts
 * // Same instance everywhere in your app
 * const story = useStoryteller({ origin: { who: "worker" } });
 * ```
 */
export function useStoryteller(
  options: StorytellerSharedOptions = {}
): Storyteller {
  if (!sharedInstance || options.reset) {
    sharedInstance = new Storyteller({ origin: options.origin });
    return sharedInstance;
  }

  return sharedInstance;
}
