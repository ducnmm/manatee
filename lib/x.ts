const BASE = process.env.TWITTERAPI_IO_BASE_URL ?? 'https://api.twitterapi.io';
const DEFAULT_LOOKBACK_SEC = 30;

export type XTweet = {
  id: string;
  text: string;
  author: string;
  url: string;
};

type SearchResponse = {
  tweets?: Array<{
    id: string;
    text?: string;
    author?: { userName?: string };
    url?: string;
  }>;
};

/** Twitter snowflake from unix ms — used so the poller never executes pre-boot tweets. */
export function tweetIdFromUnixMs(ms: number): string {
  const twitterEpoch = 1288834974657n;
  return ((BigInt(ms) - twitterEpoch) << 22n).toString();
}

export function buildMentionQuery(bot: string, sinceUnix: number, untilUnix: number): string {
  const handle = bot.replace(/^@/, '');
  return `(@${handle} OR from:${handle}) (send OR register) since_time:${sinceUnix} until_time:${untilUnix}`;
}

export async function searchMentions(sinceId?: string, sinceUnix?: number): Promise<XTweet[]> {
  const key = process.env.TWITTERAPI_IO_API_KEY;
  if (!key) {
    throw new Error('TWITTERAPI_IO_API_KEY not set');
  }
  const bot = process.env.X_BOT_HANDLE ?? 'ManateeWallet';
  const now = Math.floor(Date.now() / 1000);
  const from = sinceUnix ?? now - DEFAULT_LOOKBACK_SEC;
  const query = buildMentionQuery(bot, from, now);
  const url = new URL('/twitter/tweet/advanced_search', BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('queryType', 'Latest');

  const res = await fetch(url, { headers: { 'X-API-Key': key } });
  if (!res.ok) {
    throw new Error(`twitterapi.io ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as SearchResponse;
  const tweets = (body.tweets ?? [])
    .map((t) => ({
      id: t.id,
      text: t.text ?? '',
      author: (t.author?.userName ?? '').replace(/^@/, '').toLowerCase(),
      url: t.url ?? `https://x.com/i/status/${t.id}`,
    }))
    .filter((t) => t.id && t.author);

  if (!sinceId) {
    return tweets;
  }
  return tweets.filter((t) => BigInt(t.id) > BigInt(sinceId));
}

export async function fetchTweetById(id: string): Promise<XTweet> {
  const key = process.env.TWITTERAPI_IO_API_KEY;
  if (!key) {
    throw new Error('TWITTERAPI_IO_API_KEY not set — paste the command text instead');
  }
  const url = new URL('/twitter/tweets', BASE);
  url.searchParams.set('tweet_ids', id);
  const res = await fetch(url, { headers: { 'X-API-Key': key } });
  if (!res.ok) {
    throw new Error(`twitterapi.io ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as SearchResponse;
  const t = body.tweets?.[0];
  if (!t?.id) {
    throw new Error(`tweet ${id} not found`);
  }
  return {
    id: t.id,
    text: t.text ?? '',
    author: (t.author?.userName ?? '').replace(/^@/, '').toLowerCase(),
    url: t.url ?? `https://x.com/i/status/${t.id}`,
  };
}

export function tweetIdFromUrl(raw: string): string | undefined {
  const m = raw.trim().match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i);
  return m?.[1];
}

export async function createTweet(text: string, replyToTweetId?: string): Promise<string> {
  const key = process.env.TWITTERAPI_IO_API_KEY;
  const cookies = process.env.TWITTERAPI_IO_LOGIN_COOKIES;
  const proxy = process.env.TWITTERAPI_IO_PROXY;
  if (!key || !cookies || !proxy) {
    throw new Error('tweet needs TWITTERAPI_IO_API_KEY + LOGIN_COOKIES + PROXY');
  }
  const body: Record<string, string> = {
    login_cookies: cookies,
    proxy,
    tweet_text: text,
  };
  if (replyToTweetId) {
    body.reply_to_tweet_id = replyToTweetId;
  }
  const res = await fetch(`${BASE}/twitter/create_tweet_v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`create_tweet_v2 HTTP ${res.status}: ${raw}`);
  }
  const parsed = JSON.parse(raw) as { status?: string; msg?: string; tweet_id?: string };
  if (!parsed.status || parsed.status.toLowerCase() !== 'success' || !parsed.tweet_id) {
    throw new Error(`create_tweet_v2 failed: ${parsed.msg ?? raw}`);
  }
  return parsed.tweet_id;
}

export async function replyToTweet(tweetId: string, text: string): Promise<string> {
  return createTweet(text, tweetId);
}
