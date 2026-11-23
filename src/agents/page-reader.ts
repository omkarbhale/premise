import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

/**
 * Reading a web page in parts, for the researcher (decision 0300). In the first real runs the
 * researcher fetched the one page that decided the outcome twice and got the same cut-off summary
 * both times, with no way to read the rest. premise fetches the page itself, turns it into plain
 * text, and hands it out one part at a time.
 *
 * premise only reads public pages for it: plain http or https, never this machine or a private
 * network address (checked on every redirect too), a size cap, and a time limit. The page is data
 * the researcher reads; nothing in it instructs anyone.
 */

/** What a fetch gives back; a seam so tests never touch the network. */
export interface FetchedPage {
  status: number;
  contentType: string;
  /** Where a redirect points, for 3xx answers. */
  location?: string;
  body: string;
}
/** Fetches a page, connecting only to `address`: the one premise checked is the one it reaches. */
export type PageFetcher = (
  url: string,
  address: string,
  signal: AbortSignal,
) => Promise<FetchedPage>;
/** Resolves a host name to its addresses; a seam so tests never touch the network. */
export type HostResolver = (host: string) => Promise<string[]>;

export type PageState =
  | { state: "ready"; text: string; part: number; parts: number; url: string }
  | { state: "loading" }
  | { state: "failed"; problem: string };

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 5;
const KEEP = 30;

/** An IPv6 literal as its 16 bytes; null when it is not one. */
function ipv6Bytes(address: string): number[] | null {
  let a = address;
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted) {
    if (isIP(dotted[1]!) !== 4) return null;
    const [w, x, y, z] = dotted[1]!.split(".").map(Number) as [number, number, number, number];
    a = `${a.slice(0, dotted.index)}${((w << 8) | x).toString(16)}:${((y << 8) | z).toString(16)}`;
  }
  const halves = a.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.flatMap((g) => [Number.parseInt(g, 16) >> 8, Number.parseInt(g, 16) & 255]);
}

/** Whether an address is this machine, a private network or otherwise not public. */
export function privateAddress(address: string): boolean {
  const a = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(a) === 4) {
    const [x, y] = a.split(".").map(Number) as [number, number];
    return (
      x === 0 ||
      x === 10 ||
      x === 127 ||
      (x === 100 && y >= 64 && y <= 127) ||
      (x === 169 && y === 254) ||
      (x === 172 && y >= 16 && y <= 31) ||
      (x === 192 && y === 168) ||
      x >= 224
    );
  }
  if (isIP(a) === 6) {
    const b = ipv6Bytes(a);
    if (!b) return true;
    const zeros = (n: number) => b.slice(0, n).every((v) => v === 0);
    const embedded = () => privateAddress(b.slice(12).join("."));
    if (zeros(10) && b[10] === 255 && b[11] === 255) return embedded();
    if (zeros(12))
      return (
        b.slice(12).every((v) => v === 0) ||
        (b[15] === 1 && b.slice(12, 15).every((v) => v === 0)) ||
        embedded()
      );
    if (
      b[0] === 0 &&
      b[1] === 0x64 &&
      b[2] === 0xff &&
      b[3] === 0x9b &&
      b.slice(4, 12).every((v) => v === 0)
    ) {
      return embedded();
    }
    return (b[0]! & 0xfe) === 0xfc || (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) || b[0] === 0xff;
  }
  return false;
}

/** A page's HTML as plain text: no scripts, styles or tags, blocks on their own lines. */
export function pageText(body: string, contentType: string): string {
  if (!/html/i.test(contentType) && !/^\s*</.test(body)) return body.replace(/\r\n?/g, "\n").trim();
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return body
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/pre|\/section|\/article|hr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16) || 32);
      }
      if (name.startsWith("#")) return String.fromCodePoint(Number(name.slice(1)) || 32);
      return entities[name.toLowerCase()] ?? whole;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function realFetch(url: string, address: string, signal: AbortSignal): Promise<FetchedPage> {
  const target = new URL(url);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const family = isIP(address.replace(/^\[|\]$/g, "")) === 6 ? 6 : 4;
  return new Promise<FetchedPage>((resolve, reject) => {
    const req = request(
      target,
      {
        signal,
        headers: { "user-agent": "premise page reader", accept: "text/html, text/plain, */*" },
        lookup: (_host, options, done) => {
          const ip = address.replace(/^\[|\]$/g, "");
          if ((options as { all?: boolean }).all) {
            (done as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [
              { address: ip, family },
            ]);
          } else done(null, ip, family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        const contentType = String(res.headers["content-type"] ?? "");
        const done = (body: string) =>
          resolve({ status, contentType, ...(location && { location }), body });
        if (status >= 300 && status < 400) {
          res.resume();
          done("");
          return;
        }
        const decoder = new TextDecoder();
        let body = "";
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.byteLength;
          body += decoder.decode(chunk, { stream: true });
          if (size > MAX_BYTES) res.destroy();
        });
        res.on("close", () => done(body + decoder.decode()));
        res.on("error", () => done(body));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function realResolve(host: string): Promise<string[]> {
  return (await lookup(host, { all: true })).map((a) => a.address);
}

export interface PageReaderOptions {
  fetch?: PageFetcher;
  resolve?: HostResolver;
  /** Characters in one part. */
  partChars: number;
  timeoutMs?: number;
}

export class PageReader {
  private readonly pages = new Map<string, { text?: string; problem?: string; url?: string }>();
  private readonly loading = new Map<string, Promise<void>>();

  constructor(private readonly options: PageReaderOptions) {}

  /** Whether an address may be read at all, and why not; null when it may. */
  static refusal(address: string): string | null {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return "That is not a web address. Give the whole address, starting with https://.";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "premise reads only http and https pages.";
    }
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || privateAddress(host)) {
      return "premise reads only public pages, never this machine or a private network.";
    }
    return null;
  }

  /** Fetch a page and keep its text; repeated calls for the same address share one fetch. */
  load(address: string): Promise<void> {
    const key = address.trim();
    if (this.pages.has(key)) return Promise.resolve();
    const running = this.loading.get(key);
    if (running) return running;
    const done = this.fetchText(key)
      .then(
        ({ text, url }) => this.keep(key, { text, url }),
        (error: unknown) => this.keep(key, { problem: (error as Error).message }),
      )
      .finally(() => this.loading.delete(key));
    this.loading.set(key, done);
    return done;
  }

  /** One part of a page, from what was fetched; undefined when it was never asked for. */
  read(address: string, part = 1): PageState | undefined {
    const key = address.trim();
    const page = this.pages.get(key);
    if (!page) return this.loading.has(key) ? { state: "loading" } : undefined;
    if (page.problem !== undefined) return { state: "failed", problem: page.problem };
    const text = page.text ?? "";
    const size = Math.max(1000, this.options.partChars);
    const parts = Math.max(1, Math.ceil(text.length / size));
    const n = Math.min(Math.max(1, Math.floor(part)), parts);
    return {
      state: "ready",
      text: text.slice((n - 1) * size, n * size),
      part: n,
      parts,
      url: page.url ?? key,
    };
  }

  private keep(key: string, page: { text?: string; problem?: string; url?: string }): void {
    this.pages.set(key, page);
    while (this.pages.size > KEEP) this.pages.delete(this.pages.keys().next().value!);
  }

  private async fetchText(address: string): Promise<{ text: string; url: string }> {
    const fetcher = this.options.fetch ?? realFetch;
    const resolve = this.options.resolve ?? realResolve;
    let url = address;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const refused = PageReader.refusal(url);
      if (refused) throw new Error(refused);
      const host = new URL(url).hostname;
      const bare = host.replace(/^\[|\]$/g, "");
      const addresses = isIP(bare) ? [bare] : await resolve(host);
      if (addresses.length === 0 || addresses.some(privateAddress)) {
        throw new Error(
          "premise reads only public pages, never this machine or a private network.",
        );
      }
      const signal = AbortSignal.timeout(this.options.timeoutMs ?? 20_000);
      const page = await fetcher(url, addresses[0]!, signal);
      if (page.status >= 300 && page.status < 400 && page.location) {
        url = new URL(page.location, url).toString();
        continue;
      }
      if (page.status >= 400) throw new Error(`The site answered ${page.status}.`);
      const text = pageText(page.body.slice(0, MAX_BYTES), page.contentType);
      if (!text) throw new Error("The page has no text premise can read.");
      return { text, url };
    }
    throw new Error(`The page redirected more than ${MAX_REDIRECTS} times.`);
  }
}
