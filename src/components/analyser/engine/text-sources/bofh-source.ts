import type { TextSnippet, TextSource } from "./types";

const API_URL = "https://bofh.bombeck.io/v1/excuses/random";

type BofhResponse = {
  data?: Array<{ id: number; excuse: string }>;
};

/** Embedded so the overlay works with zero network dependency — used when
 * the API is unreachable and no cached batch exists yet. */
const BOFH_FALLBACK_STRINGS: string[] = [
  "Someone unplugged the internet to charge their phone.",
  "The backup backup generator needs a backup.",
  "A raccoon got into the server room again.",
  "We're waiting on a firmware update from 2011.",
  "The load balancer is feeling unbalanced today.",
  "Cosmic rays flipped a bit in production.",
  "The DNS is out enjoying its lunch break.",
  "Someone renamed the database to 'database_final_FINAL'.",
  "The cache is stuck remembering yesterday.",
  "It works on my machine, which is the important part.",
  "The router is meditating and cannot be disturbed.",
  "We're out of tokens. Please insert more coffee.",
  "The cloud is actually just someone else's computer, and it's down.",
  "A cron job is running a marathon it will never finish.",
  "The API changed its mind about what a boolean means.",
  "Gremlins in the fiber. Union rules prevent overtime removal.",
  "The staging environment achieved sentience and unionized.",
  "Someone fat-fingered a semicolon and now nothing loves each other.",
  "The load-bearing spreadsheet has collapsed.",
  "We're experiencing a planned unplanned outage.",
  "The intern found the big red button.",
  "Quantum entanglement broke the session store.",
  "The certificate expired precisely when we needed it most.",
  "A stray electron wandered into the wrong subnet.",
  "The build server is on a coffee break that started last Tuesday.",
  "Someone merged main into main.",
  "The rate limiter rate-limited itself.",
  "It's not a bug, it's an undocumented feature outage.",
  "The logs are too honest about what happened.",
  "A packet got lost looking for scenic routes.",
  "The container escaped and is now roaming the data center.",
  "Someone asked the AI to fix it and it agreed a little too confidently.",
  "The message queue is queueing up its own therapy session.",
  "We're rate-limited by the speed of sound in copper.",
  "The config file is written in a language only Tuesday understands.",
  "A wizard cast a networking spell and it backfired.",
  "The disk is full of good intentions.",
  "Someone deployed on a Friday and the universe noticed.",
  "The API key was rotated into another dimension.",
  "It's Mercury in retrograde for microservices.",
  "The thermostat and the load balancer are in a fight.",
  "A squirrel is now load-testing the power cable.",
  "We're waiting for the moon to align with the CDN.",
  "The webhook sent itself a strongly worded letter.",
  "Someone typed 'rm' and meant to type something, anything else.",
  "The service mesh got tangled in itself.",
  "A single semicolon achieved main character energy.",
  "The uptime monitor is technically also down.",
  "We patched the patch that patched the previous patch.",
  "The server room's feng shui was recently disturbed.",
  "It's not down, it's just very, very slow at being up.",
];

export const BOFH_FALLBACK_EXCUSES: TextSnippet[] = BOFH_FALLBACK_STRINGS.map((text, index) => ({
  id: `bofh-fallback-${index + 1}`,
  text,
  work: "BOFH Excuses",
  author: "bofh.bombeck.io",
  sourceUrl: "https://bofh.bombeck.io/",
  rights: "API content; verify downstream use before redistribution.",
  creditLine: "Source: bofh.bombeck.io",
  attributionRequired: false,
  notes: "Network source with bundled fallback text.",
}));

/** BOFH excuses API — https://bofh.bombeck.io. CORS-open, ~1000 req/15min. */
export const bofhTextSource: TextSource = {
  id: "bofh",
  label: "BOFH Excuses",
  async prefetch(count: number): Promise<TextSnippet[]> {
    const response = await fetch(`${API_URL}?count=${count}`);
    if (!response.ok) throw new Error(`bofh excuses request failed: ${response.status}`);
    const body = (await response.json()) as BofhResponse;
    const excuses: Array<TextSnippet | null> =
      body.data?.map((entry, index) =>
        entry.excuse
          ? {
              id: `bofh-${entry.id ?? index}`,
              text: entry.excuse,
              work: "BOFH Excuses",
              author: "bofh.bombeck.io",
              sourceUrl: "https://bofh.bombeck.io/",
              rights: "API content; verify downstream use before redistribution.",
              creditLine: "Source: bofh.bombeck.io",
              attributionRequired: false,
              notes: "Live network source.",
            }
          : null,
      ) ?? [];
    const usable = excuses.filter((entry): entry is TextSnippet => entry !== null);
    if (usable.length === 0) throw new Error("bofh excuses response had no usable phrases");
    return usable;
  },
};
