/**
 * Highlighted code samples shared across the docs pages.
 * Strings are HTML: syntax spans map to classes in global.css.
 */

export const installCode = `<span class="prompt">$</span> npm install @lovelaces-io/storyteller`;

export const quickStartCode = `<span class="keyword">import</span> <span class="punctuation">{</span> Storyteller <span class="punctuation">}</span> <span class="keyword">from</span> <span class="string">"@lovelaces-io/storyteller"</span>;

<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span>
  origin: <span class="punctuation">{</span> who: <span class="string">"my-service"</span> <span class="punctuation">}</span>,
<span class="punctuation">}</span>);

story.<span class="function">report</span>(<span class="string">"User clicked checkout"</span>);
story.<span class="function">report</span>(<span class="string">"Cart validated"</span>, <span class="punctuation">{</span> what: <span class="punctuation">{</span> items: <span class="type">3</span> <span class="punctuation">}</span> <span class="punctuation">}</span>);
story.<span class="function">finish</span>(<span class="string">"Checkout started"</span>);`;

export const outputCode = `<span class="punctuation">{</span>
  <span class="keyword">"timestamp"</span>: <span class="string">"2026-03-31T14:30:00.000Z"</span>,
  <span class="keyword">"level"</span>: <span class="string">"Information"</span>,
  <span class="keyword">"title"</span>: <span class="string">"Checkout started"</span>,
  <span class="keyword">"origin"</span>: <span class="punctuation">{</span> <span class="keyword">"who"</span>: <span class="string">"my-service"</span> <span class="punctuation">}</span>,
  <span class="keyword">"durationMs"</span>: <span class="type">0</span>,
  <span class="keyword">"notes"</span>: <span class="punctuation">[</span>
    <span class="punctuation">{</span> <span class="keyword">"timestamp"</span>: <span class="string">"..."</span>, <span class="keyword">"note"</span>: <span class="string">"User clicked checkout"</span> <span class="punctuation">}</span>,
    <span class="punctuation">{</span> <span class="keyword">"timestamp"</span>: <span class="string">"..."</span>, <span class="keyword">"note"</span>: <span class="string">"Cart validated"</span>, <span class="keyword">"what"</span>: <span class="punctuation">{</span> <span class="keyword">"items"</span>: <span class="type">3</span> <span class="punctuation">}</span> <span class="punctuation">}</span>
  <span class="punctuation">]</span>
<span class="punctuation">}</span>`;

export const contextCode = `story.<span class="function">report</span>(<span class="string">"Card charged"</span>, <span class="punctuation">{</span>
  who: <span class="punctuation">{</span> id: <span class="string">"user:413"</span>, role: <span class="string">"member"</span> <span class="punctuation">}</span>,
  what: <span class="punctuation">{</span> amount: <span class="string">"$49.99"</span>, method: <span class="string">"visa"</span> <span class="punctuation">}</span>,
  where: <span class="string">"stripe-api"</span>,
<span class="punctuation">}</span>);

story.<span class="function">report</span>(<span class="string">"Write failed"</span>, <span class="punctuation">{</span>
  where: <span class="string">"primary-db"</span>,
  error: <span class="keyword">new</span> <span class="function">Error</span>(<span class="string">"connection timeout"</span>),
<span class="punctuation">}</span>);`;

export const dbAudienceCode = `<span class="keyword">import</span> <span class="punctuation">{</span> dbAudience <span class="punctuation">}</span> <span class="keyword">from</span> <span class="string">"@lovelaces-io/storyteller"</span>;

<span class="comment">// Only stores warn and oops — filters out tell to reduce noise</span>
story.audience.<span class="function">add</span>(
  <span class="function">dbAudience</span>(<span class="keyword">async</span> (event) => <span class="punctuation">{</span>
    <span class="keyword">await</span> db.<span class="function">insert</span>(<span class="string">"story_logs"</span>, event);
  <span class="punctuation">}</span>)
);`;

export const customAudienceCode = `story.audience.<span class="function">add</span>(<span class="punctuation">{</span>
  name: <span class="string">"slack"</span>,
  accepts: (event) => event.level === <span class="string">"Error"</span>,
  hear: <span class="keyword">async</span> (event) => <span class="punctuation">{</span>
    <span class="keyword">await</span> <span class="function">sendSlackAlert</span>(event.title, event.error);
  <span class="punctuation">}</span>,
<span class="punctuation">}</span>);`;

export const targetingCode = `<span class="comment">// Send this story only to the database, not the console</span>
story.<span class="function">finish</span>(<span class="string">"Slow query detected"</span>, <span class="punctuation">{</span> level: <span class="string">"warn"</span> <span class="punctuation">}</span>).<span class="function">to</span>(<span class="string">"db"</span>);

<span class="comment">// Send to multiple specific audiences</span>
story.<span class="function">finish</span>(<span class="string">"Critical failure"</span>, <span class="punctuation">{</span> level: <span class="string">"oops"</span>, error <span class="punctuation">}</span>).<span class="function">to</span>(<span class="string">"db"</span>, <span class="string">"slack"</span>);`;

export const audienceManagementCode = `story.audience.<span class="function">has</span>(<span class="string">"console"</span>);    <span class="comment">// true</span>
story.audience.<span class="function">names</span>();           <span class="comment">// ["console", "db"]</span>
story.audience.<span class="function">remove</span>(<span class="string">"console"</span>); <span class="comment">// quiet mode</span>`;

export const singletonCode = `<span class="keyword">import</span> <span class="punctuation">{</span> useStoryteller <span class="punctuation">}</span> <span class="keyword">from</span> <span class="string">"@lovelaces-io/storyteller"</span>;

<span class="comment">// First call creates the instance</span>
<span class="keyword">const</span> story = <span class="function">useStoryteller</span>(<span class="punctuation">{</span>
  origin: <span class="punctuation">{</span> who: <span class="string">"api-server"</span> <span class="punctuation">}</span>,
<span class="punctuation">}</span>);

<span class="comment">// Same instance everywhere</span>
<span class="keyword">const</span> sameStory = <span class="function">useStoryteller</span>();
console.<span class="function">log</span>(story === sameStory); <span class="comment">// true</span>`;

export const outputReferenceCode = `<span class="punctuation">{</span>
  <span class="keyword">"kind"</span>: <span class="string">"story"</span>,                            <span class="comment">// or "note", on a live beat</span>
  <span class="keyword">"storyId"</span>: <span class="string">"2c005b27-…"</span>,                     <span class="comment">// groups beats with their story</span>
  <span class="keyword">"timestamp"</span>: <span class="string">"2026-03-31T14:30:03.420Z"</span>,    <span class="comment">// when the story was told</span>
  <span class="keyword">"level"</span>: <span class="string">"Warning"</span>,                         <span class="comment">// Information | Warning | Error</span>
  <span class="keyword">"title"</span>: <span class="string">"Payment retry succeeded"</span>,         <span class="comment">// the story's headline</span>
  <span class="keyword">"origin"</span>: <span class="punctuation">{</span>                                  <span class="comment">// where this story comes from</span>
    <span class="keyword">"who"</span>: <span class="string">"payment-service"</span>,
    <span class="keyword">"where"</span>: <span class="punctuation">{</span> <span class="keyword">"app"</span>: <span class="string">"web"</span>, <span class="keyword">"page"</span>: <span class="string">"checkout"</span> <span class="punctuation">}</span>
  <span class="punctuation">}</span>,
  <span class="keyword">"durationMs"</span>: <span class="type">3420</span>,                         <span class="comment">// first note to last note</span>
  <span class="keyword">"notes"</span>: <span class="punctuation">[</span>                                   <span class="comment">// chronologically sorted</span>
    <span class="punctuation">{</span>
      <span class="keyword">"timestamp"</span>: <span class="string">"2026-03-31T14:30:00.000Z"</span>,
      <span class="keyword">"sequence"</span>: <span class="type">0</span>,                          <span class="comment">// gap-free, assigned as reported</span>
      <span class="keyword">"note"</span>: <span class="string">"Card declined by processor"</span>,
      <span class="keyword">"error"</span>: <span class="punctuation">{</span> <span class="keyword">"message"</span>: <span class="string">"insufficient funds"</span> <span class="punctuation">}</span>
    <span class="punctuation">}</span>,
    <span class="punctuation">{</span>
      <span class="keyword">"timestamp"</span>: <span class="string">"2026-03-31T14:30:02.000Z"</span>,
      <span class="keyword">"note"</span>: <span class="string">"Retrying with backup processor"</span>
    <span class="punctuation">}</span>,
    <span class="punctuation">{</span>
      <span class="keyword">"timestamp"</span>: <span class="string">"2026-03-31T14:30:03.420Z"</span>,
      <span class="keyword">"note"</span>: <span class="string">"Payment approved"</span>,
      <span class="keyword">"what"</span>: <span class="punctuation">{</span> <span class="keyword">"amount"</span>: <span class="string">"$42.00"</span> <span class="punctuation">}</span>
    <span class="punctuation">}</span>
  <span class="punctuation">]</span>,
  <span class="keyword">"error"</span>: <span class="punctuation">{</span>                                   <span class="comment">// top-level error (from oops)</span>
    <span class="keyword">"name"</span>: <span class="string">"CardDeclinedError"</span>,
    <span class="keyword">"message"</span>: <span class="string">"Insufficient funds"</span>
  <span class="punctuation">}</span>
<span class="punctuation">}</span>`;

export const apiRequestCode = `<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span>
  origin: <span class="punctuation">{</span> who: <span class="string">"api"</span>, where: <span class="punctuation">{</span> service: <span class="string">"users"</span> <span class="punctuation">}</span> <span class="punctuation">}</span>,
<span class="punctuation">}</span>);

story.<span class="function">report</span>(<span class="string">"Request received"</span>, <span class="punctuation">{</span> what: <span class="punctuation">{</span> method: <span class="string">"POST"</span>, path: <span class="string">"/users"</span> <span class="punctuation">}</span> <span class="punctuation">}</span>);

<span class="keyword">try</span> <span class="punctuation">{</span>
  <span class="keyword">const</span> user = <span class="keyword">await</span> <span class="function">createUser</span>(body);
  story.<span class="function">report</span>(<span class="string">"User created"</span>, <span class="punctuation">{</span> what: <span class="punctuation">{</span> id: user.id <span class="punctuation">}</span> <span class="punctuation">}</span>);
  story.<span class="function">finish</span>(<span class="string">"User registration complete"</span>);
<span class="punctuation">}</span> <span class="keyword">catch</span> (error) <span class="punctuation">{</span>
  story.<span class="function">finish</span>(<span class="string">"User registration failed"</span>, <span class="punctuation">{</span> level: <span class="string">"oops"</span>, error <span class="punctuation">}</span>);
<span class="punctuation">}</span>`;

export const backgroundJobCode = `<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span> origin: <span class="punctuation">{</span> who: <span class="string">"sync-worker"</span> <span class="punctuation">}</span> <span class="punctuation">}</span>);

story.<span class="function">report</span>(<span class="string">"Starting daily sync"</span>);
<span class="keyword">const</span> records = <span class="keyword">await</span> <span class="function">fetchRecords</span>();
story.<span class="function">report</span>(<span class="string">\`Fetched \$&#123;records.length&#125; records\`</span>);

<span class="keyword">let</span> failures = <span class="type">0</span>;
<span class="keyword">for</span> (<span class="keyword">const</span> record <span class="keyword">of</span> records) <span class="punctuation">{</span>
  <span class="keyword">try</span> <span class="punctuation">{</span>
    <span class="keyword">await</span> <span class="function">processRecord</span>(record);
  <span class="punctuation">}</span> <span class="keyword">catch</span> <span class="punctuation">{</span>
    failures++;
  <span class="punctuation">}</span>
<span class="punctuation">}</span>

story.<span class="function">report</span>(<span class="string">\`Processed with \$&#123;failures&#125; failures\`</span>);

<span class="keyword">if</span> (failures > <span class="type">0</span>) <span class="punctuation">{</span>
  story.<span class="function">finish</span>(<span class="string">"Sync completed with errors"</span>, <span class="punctuation">{</span> level: <span class="string">"warn"</span> <span class="punctuation">}</span>);
<span class="punctuation">}</span> <span class="keyword">else</span> <span class="punctuation">{</span>
  story.<span class="function">finish</span>(<span class="string">"Sync completed"</span>);
<span class="punctuation">}</span>`;

export const discordDocsCode = `story.audience.<span class="function">add</span>(<span class="punctuation">{</span>
  name: <span class="string">"discord"</span>,
  accepts: (event) => event.level === <span class="string">"Error"</span>,
  hear: <span class="keyword">async</span> (event) => <span class="punctuation">{</span>
    <span class="keyword">await</span> <span class="function">fetch</span>(process.env.<span class="type">DISCORD_WEBHOOK_URL</span>!, <span class="punctuation">{</span>
      method: <span class="string">"POST"</span>,
      headers: <span class="punctuation">{</span> <span class="string">"content-type"</span>: <span class="string">"application/json"</span> <span class="punctuation">}</span>,
      body: <span class="function">JSON.stringify</span>(<span class="punctuation">{</span>
        content: <span class="string">"\`\`\`\n"</span> + event.<span class="function">summarize</span>(<span class="punctuation">{</span> colors: <span class="keyword">false</span>, detail: <span class="string">"brief"</span> <span class="punctuation">}</span>).text + <span class="string">"\n\`\`\`"</span>,
      <span class="punctuation">}</span>),
    <span class="punctuation">}</span>);
  <span class="punctuation">}</span>,
<span class="punctuation">}</span>);`;

export const liveCode = `<span class="comment">14:30:00</span>  <span class="level-tell">info</span>  <span class="comment">checkout / web</span>  User submitted payment  <span class="comment">{amount=49.99}</span>
<span class="comment">14:30:01</span>  <span class="level-tell">info</span>  <span class="comment">checkout / web</span>  Charging card  <span class="comment">{stripe}</span>
<span class="comment">14:30:03</span>  <span class="level-warn">warn</span>  <span class="comment">checkout / web</span>  Card declined  <span class="comment">{gateway timeout}</span>
<span class="comment">14:30:03</span>  <span class="level-tell">info</span>  <span class="comment">checkout / web</span>  Retrying
<span class="comment">14:30:04</span>  <span class="level-tell">info</span>  <span class="comment">checkout / web</span>  Charge succeeded`;

export const anythingCode = `story.<span class="function">report</span>(<span class="keyword">await</span> response.<span class="function">json</span>());        <span class="comment">// any API payload</span>
story.<span class="function">report</span>(caughtError);                 <span class="comment">// cause chain preserved</span>
story.<span class="function">report</span>(<span class="keyword">new</span> <span class="function">Map</span>([[<span class="string">"region"</span>, <span class="string">"us-east"</span>]]));
story.<span class="function">report</span>(circularObject);              <span class="comment">// marked, never thrown</span>
story.<span class="function">report</span>(<span class="punctuation">{</span> apiKey: <span class="string">"sk-live-abc"</span> <span class="punctuation">}</span>);      <span class="comment">// → "[redacted]"</span>`;

export const discordCode = `<span class="comment">// Only the failures, straight to your Discord</span>
story.audience.<span class="function">add</span>(<span class="punctuation">{</span>
  name: <span class="string">"discord"</span>,
  accepts: (event) => event.level === <span class="string">"Error"</span>,
  hear: <span class="keyword">async</span> (event) => <span class="punctuation">{</span>
    <span class="keyword">await</span> <span class="function">fetch</span>(process.env.<span class="type">DISCORD_WEBHOOK_URL</span>!, <span class="punctuation">{</span>
      method: <span class="string">"POST"</span>,
      headers: <span class="punctuation">{</span> <span class="string">"content-type"</span>: <span class="string">"application/json"</span> <span class="punctuation">}</span>,
      body: <span class="function">JSON.stringify</span>(<span class="punctuation">{</span>
        content: <span class="string">"\`\`\`\n"</span> + event.<span class="function">summarize</span>(<span class="punctuation">{</span> colors: <span class="keyword">false</span>, detail: <span class="string">"brief"</span> <span class="punctuation">}</span>).text + <span class="string">"\n\`\`\`"</span>,
      <span class="punctuation">}</span>),
    <span class="punctuation">}</span>);
  <span class="punctuation">}</span>,
<span class="punctuation">}</span>);`;

export const liveOptionsCode = `<span class="comment">// Per instance</span>
<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span> narration: <span class="string">"live"</span> <span class="punctuation">}</span>);

<span class="comment">// At runtime — takes effect on the next report()</span>
story.<span class="function">narrate</span>(<span class="string">"live"</span>);
story.<span class="function">narrate</span>(<span class="string">"collected"</span>);

<span class="comment">// One urgent beat out of an otherwise collected story</span>
story.<span class="function">report</span>(<span class="string">"Disk at 97%"</span>, <span class="punctuation">{</span> level: <span class="string">"warn"</span>, live: <span class="keyword">true</span> <span class="punctuation">}</span>);`;

export const ndjsonCode = `<span class="keyword">import</span> <span class="punctuation">{</span> ndjsonAudience <span class="punctuation">}</span> <span class="keyword">from</span> <span class="string">"@lovelaces-io/storyteller"</span>;

story.audience.<span class="function">remove</span>(<span class="string">"console"</span>);
story.audience.<span class="function">add</span>(<span class="function">ndjsonAudience</span>(<span class="punctuation">{</span> stream: process.stderr <span class="punctuation">}</span>));

<span class="comment">// or change nothing and run with STORYTELLER_FORMAT=ndjson</span>`;

export const jqCode = `<span class="prompt">$</span> STORYTELLER_NARRATION=live STORYTELLER_FORMAT=ndjson node sync.js \\
    | jq -r <span class="string">'select(.kind=="note") | "\\(.sequence)  \\(.level)  \\(.note)"'</span>
<span class="type">0</span>  Information  Reading config
<span class="type">1</span>  Information  Fetched invoices
<span class="type">2</span>  <span class="level-warn">Warning</span>      Rate limited`;

export const robustnessCode = `<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span>
  <span class="comment">// Called instead of swallowing the failure. Without it: one throttled console warning.</span>
  onAudienceError: (error, member, emission) =>
    metrics.<span class="function">increment</span>(<span class="string">"storyteller.audience_failed"</span>, <span class="punctuation">{</span> audience: member.name <span class="punctuation">}</span>),

  <span class="comment">// Deliveries in flight per audience. Past this, beats are dropped and counted.</span>
  maxInFlight: <span class="type">500</span>,
<span class="punctuation">}</span>);

<span class="comment">// A dropped beat never vanishes silently — the closing story says so</span>
<span class="comment">// { ..., "droppedEmissions": 12 }</span>`;

export const chapterCode = `<span class="keyword">const</span> story = <span class="keyword">new</span> <span class="function">Storyteller</span>(<span class="punctuation">{</span> origin: <span class="punctuation">{</span> who: <span class="string">"sync-agent"</span> <span class="punctuation">}</span>, narration: <span class="string">"live"</span> <span class="punctuation">}</span>);

story.<span class="function">report</span>(<span class="string">"Starting sync"</span>);

<span class="keyword">for</span> (<span class="keyword">const</span> account <span class="keyword">of</span> accounts) <span class="punctuation">{</span>
  <span class="keyword">const</span> chapter = story.<span class="function">chapter</span>(<span class="punctuation">{</span> origin: <span class="punctuation">{</span> what: account.id <span class="punctuation">}</span> <span class="punctuation">}</span>);
  chapter.<span class="function">report</span>(<span class="string">"Fetching invoices"</span>);
  chapter.<span class="function">report</span>(<span class="string">"Reconciling"</span>);
  chapter.<span class="function">finish</span>(<span class="string">\`Synced \$&#123;account.id&#125;\`</span>);
<span class="punctuation">}</span>

story.<span class="function">finish</span>(<span class="string">"Sync complete"</span>);`;

export const treeCode = `<span class="comment">// Every chapter record carries parentStoryId. That is all you need to rebuild the run.</span>
<span class="keyword">const</span> byParent = <span class="function">groupBy</span>(records, (r) => r.parentStoryId ?? <span class="string">"root"</span>);

<span class="comment">// Sync complete       (1 beat)</span>
<span class="comment">//   Synced acct-1     (2 beats)</span>
<span class="comment">//   Synced acct-2     (2 beats)</span>
<span class="comment">//   Synced acct-3     (2 beats)</span>`;

export const audienceMemberCode = `<span class="keyword">type</span> <span class="type">AudienceMember</span> = <span class="punctuation">{</span>
  name: <span class="type">string</span>;
  hears?: (<span class="string">"note"</span> | <span class="string">"story"</span>)[];          <span class="comment">// defaults to ["story"]</span>
  accepts?(emission: <span class="type">Emission</span>): <span class="type">boolean</span>;   <span class="comment">// optional filter</span>
  hear(emission: <span class="type">Emission</span>): <span class="type">void</span> | <span class="type">Promise</span>&lt;<span class="type">void</span>&gt;;
<span class="punctuation">}</span>;`;

export const initOutputCode = `<span class="prompt">$</span> npx storyteller init
  <span class="level-tell">added</span>    src/storyteller.ts
  <span class="level-tell">added</span>    AGENTS.md (created)

<span class="prompt">$</span> npx storyteller init          <span class="comment"># again — nothing to do</span>
  <span class="comment">kept</span>     src/storyteller.ts (already exists)
  <span class="comment">kept</span>     AGENTS.md (already up to date)`;
