/**
 * Documentation examples for the view, compiled against the real types.
 * Not a test suite — vitest ignores this file — but `npm run typecheck`
 * covers it, so a doc sample that stops compiling fails the build.
 */
import type { StoryEvent } from "@lovelaces-io/storyteller";
import { renderStory, renderStoryText, type StoryRecord } from "../src/index";

/** site /docs/view: a panel audience */
export function panelExample(panel: HTMLElement, hear: (listener: (event: StoryEvent) => void) => void) {
  hear((event) => panel.append(renderStory(event)));
}

/** site /docs/view: anything you kept */
export function storedExample(panel: HTMLElement, line: string) {
  panel.append(renderStory(JSON.parse(line) as StoryRecord, { expandDepth: 2 }));
}

/** site /docs/view: a terminal audience */
export function terminalExample(hear: (listener: (event: StoryEvent) => void) => void, isTTY: boolean) {
  hear((event) => console.log(renderStoryText(event, { colors: isTTY })));
}
