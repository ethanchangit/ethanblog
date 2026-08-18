/**
 * 推文引用：从作者给的 URL 解析 status id，构建期读本地缓存或走
 * syndication 端点拉正文。不接官方 X API，不在浏览器发请求。
 *
 * 缓存目录 src/data/tweet-cache/<id>.json 是 lab / CI 的离线真相；
 * 文章里未缓存的链接在构建时拉取，失败则降级为只有 X logo 可点的原文入口。
 * 视频优先抽出 mp4，供卡片在页内播放。
 */
export interface TweetPhoto {
  src: string;
  alt: string;
  /** 视频封面；有 `videoSrc` 时在页内播放。 */
  video?: boolean;
  /** 可直接给原生 `<video>` 的 mp4。 */
  videoSrc?: string;
}

export interface TweetQuote {
  text: string;
  name: string;
  screenName: string;
}

export interface TweetSnapshot {
  id: string;
  url: string;
  text: string;
  createdAt?: string;
  name: string;
  screenName: string;
  /** 作者头像；构建期写入缓存，渲染时升到 x96。 */
  avatar?: string;
  verified?: boolean;
  photos: TweetPhoto[];
  quoted?: TweetQuote;
  /** 拉取失败时为 true：组件仍渲染可点击的原文入口。 */
  unavailable?: boolean;
}

export interface ParsedTweet {
  id: string;
  url: string;
  screenName?: string;
}

const TWEET_ID = /^\d{1,20}$/;
const STATUS_RE =
  /(?:twitter|x)\.com\/(?:(?:#!\/)?([A-Za-z0-9_]+)\/status(?:es)?|i\/web\/status|i\/status)\/(\d+)/i;

const cacheModules = import.meta.glob('../data/tweet-cache/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, TweetSnapshot>;

function cacheFor(id: string): TweetSnapshot | undefined {
  const suffix = `/tweet-cache/${id}.json`;
  for (const [path, data] of Object.entries(cacheModules)) {
    if (path.endsWith(suffix) || path.endsWith(`tweet-cache/${id}.json`)) {
      return data;
    }
  }
  return undefined;
}

/** 解析 twitter.com / x.com / mobile.* 的 /status/{id} 链接。 */
export function parseTweetUrl(raw: string): ParsedTweet | null {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, '').replace(/^mobile\./i, '');
  if (host !== 'twitter.com' && host !== 'x.com') return null;

  const match = `${host}${url.pathname}`.match(STATUS_RE);
  if (!match) return null;

  const screenName = match[1] && match[1].toLowerCase() !== 'i' ? match[1] : undefined;
  const id = match[2];
  if (!TWEET_ID.test(id)) return null;

  return {
    id,
    url: `https://x.com/${screenName ?? 'i'}/status/${id}`,
    screenName,
  };
}

interface SyndicationUser {
  name?: string;
  screen_name?: string;
  profile_image_url_https?: string;
  verified?: boolean;
  is_blue_verified?: boolean;
}

/** syndication 头像默认 `_normal`（48px）；卡片用 `_x96`。 */
export function hiresAvatar(src: string | undefined): string | undefined {
  if (!src) return undefined;
  return src.replace(/_normal(\.[a-z0-9]+)$/i, '_x96$1');
}

interface SyndicationVariant {
  type?: string;
  content_type?: string;
  src?: string;
  url?: string;
  bitrate?: number;
}

interface SyndicationPhoto {
  media_url_https?: string;
  ext_alt_text?: string;
  type?: string;
  video_info?: { variants?: SyndicationVariant[] };
}

interface SyndicationTweet {
  __typename?: string;
  id_str?: string;
  text?: string;
  created_at?: string;
  user?: SyndicationUser;
  photos?: SyndicationPhoto[];
  mediaDetails?: SyndicationPhoto[];
  quoted_tweet?: SyndicationTweet;
  video?: { poster?: string; variants?: SyndicationVariant[] };
}

/** react-tweet 同源的无鉴权 token，只用于构建期 syndication 请求。 */
function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
}

/** syndication 路径里常带 `1186x720`；`video.variants` 往往没有 bitrate。 */
function heightFromSrc(src: string): number {
  const match = src.match(/(\d+)x(\d+)/);
  return match ? Number(match[2]) : 0;
}

/** 优先取接近 720p 的渐进 mp4，避免 HLS（需要额外播放器）。 */
function bestMp4(variants: SyndicationVariant[] | undefined): string | undefined {
  const mp4s = (variants ?? [])
    .map((item) => ({
      src: item.src ?? item.url,
      type: item.type ?? item.content_type,
      bitrate: item.bitrate ?? 0,
    }))
    .filter((item): item is { src: string; type: string; bitrate: number } =>
      Boolean(item.src && (item.type === 'video/mp4' || item.src.includes('.mp4'))),
    );
  if (!mp4s.length) return undefined;

  const withBitrate = mp4s.filter((item) => item.bitrate > 0);
  const pool = withBitrate.length ? withBitrate : mp4s;
  const scored = [...pool].sort((a, b) => {
    const aScore = a.bitrate || heightFromSrc(a.src);
    const bScore = b.bitrate || heightFromSrc(b.src);
    return aScore - bScore;
  });
  const prefer720 = (item: (typeof scored)[number]) =>
    item.bitrate > 0 ? item.bitrate <= 2_200_000 : heightFromSrc(item.src) <= 720;
  return [...scored].reverse().find(prefer720)?.src ?? scored.at(-1)?.src;
}

function photosFrom(raw: SyndicationTweet): TweetPhoto[] {
  const out: TweetPhoto[] = [];
  const push = (src: string | undefined, alt: string, videoSrc?: string, video = false) => {
    if (!src) return;
    const existing = out.find((item) => item.src === src);
    if (existing) {
      if (video || videoSrc) existing.video = true;
      if (videoSrc && !existing.videoSrc) existing.videoSrc = videoSrc;
      return;
    }
    out.push({
      src,
      alt,
      ...(video || videoSrc ? { video: true } : {}),
      ...(videoSrc ? { videoSrc } : {}),
    });
  };

  for (const item of raw.photos ?? []) {
    const isVideo = item.type === 'video' || item.type === 'animated_gif';
    push(item.media_url_https, item.ext_alt_text ?? '', isVideo ? bestMp4(item.video_info?.variants) : undefined, isVideo);
  }
  for (const item of raw.mediaDetails ?? []) {
    const isVideo = item.type === 'video' || item.type === 'animated_gif';
    push(
      item.media_url_https,
      item.ext_alt_text ?? '',
      isVideo ? bestMp4(item.video_info?.variants) : undefined,
      isVideo,
    );
  }
  push(raw.video?.poster, '', bestMp4(raw.video?.variants), true);
  return out;
}

function quoteFrom(raw: SyndicationTweet | undefined): TweetQuote | undefined {
  if (!raw?.text || !raw.user?.screen_name) return undefined;
  return {
    text: raw.text,
    name: raw.user.name ?? raw.user.screen_name,
    screenName: raw.user.screen_name,
  };
}

function fallback(parsed: ParsedTweet): TweetSnapshot {
  return {
    id: parsed.id,
    url: parsed.url,
    text: '',
    name: parsed.screenName ?? '',
    screenName: parsed.screenName ?? '',
    photos: [],
    unavailable: true,
  };
}

function normalize(raw: SyndicationTweet, parsed: ParsedTweet): TweetSnapshot | null {
  if (!raw || raw.__typename === 'TweetTombstone' || !raw.text) return null;
  const screenName = raw.user?.screen_name ?? parsed.screenName ?? '';
  return {
    id: raw.id_str ?? parsed.id,
    url: `https://x.com/${screenName || 'i'}/status/${raw.id_str ?? parsed.id}`,
    text: raw.text,
    createdAt: raw.created_at,
    name: raw.user?.name ?? screenName,
    screenName,
    avatar: hiresAvatar(raw.user?.profile_image_url_https),
    verified: Boolean(raw.user?.verified || raw.user?.is_blue_verified),
    photos: photosFrom(raw),
    quoted: quoteFrom(raw.quoted_tweet),
  };
}

async function fetchSyndication(id: string): Promise<SyndicationTweet> {
  const url = new URL('https://cdn.syndication.twimg.com/tweet-result');
  url.searchParams.set('id', id);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('token', syndicationToken(id));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'ethanchang.io-tweet-embed' },
    });
    if (!res.ok) {
      throw new Error(`syndication ${res.status}`);
    }
    return (await res.json()) as SyndicationTweet;
  } finally {
    clearTimeout(timer);
  }
}

/** 优先读提交进仓库的缓存；没有再构建期拉取。失败不抛，交给组件降级。 */
export async function loadTweet(parsed: ParsedTweet): Promise<TweetSnapshot> {
  const cached = cacheFor(parsed.id);
  if (cached) return cached;

  try {
    const normalized = normalize(await fetchSyndication(parsed.id), parsed);
    return normalized ?? fallback(parsed);
  } catch {
    return fallback(parsed);
  }
}
