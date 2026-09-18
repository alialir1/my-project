<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ضغط استجابات JSON لتسريع النقل
if (ob_get_level() === 0 && function_exists('ob_gzhandler')) { ob_start('ob_gzhandler'); }

const ONSHORT_BASE = 'https://onshort.net';
const ONSHORT_HOME = 'https://onshort.net/ar/';
const ONSHORT_ALL  = 'https://onshort.net/ar/all-series/';
const ONSHORT_CACHE_DIR = __DIR__ . '/.cache/';
const ONSHORT_CACHE_TTL = 90;
const ONSHORT_UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

if (!is_dir(ONSHORT_CACHE_DIR)) {
    @mkdir(ONSHORT_CACHE_DIR, 0755, true);
}

function jsonOut(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/* ---------------- general helpers ---------------- */

function cacheGet(string $key, int $ttl): ?string
{
    $file = ONSHORT_CACHE_DIR . md5($key) . '.dat';
    if (is_file($file) && (time() - (int) filemtime($file)) < $ttl) {
        return (string) file_get_contents($file);
    }
    return null;
}

function cacheSet(string $key, string $body): void
{
    @file_put_contents(ONSHORT_CACHE_DIR . md5($key) . '.dat', $body);
}

function cachedText(string $key, callable $fetch): string
{
    $file = ONSHORT_CACHE_DIR . md5($key) . '.html';
    if (is_file($file) && (time() - (int) filemtime($file)) < ONSHORT_CACHE_TTL) {
        return (string) file_get_contents($file);
    }
    $body = (string) $fetch();
    if ($body !== '') {
        @file_put_contents($file, $body);
    }
    return $body;
}

function fetchRaw(string $url, array $extraHeaders = [], int $timeout = 25): array
{
    $ch = curl_init($url);
    $headers = [
        'Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language: ar-IQ,ar;q=0.9,en;q=0.7',
        'Referer: ' . ONSHORT_HOME,
        'User-Agent: ' . ONSHORT_UA,
        'Cookie: dom3ic8zudi28v8lr6fgphwffqoz0j6c=22b0527e-2e52-4511-b2a1-afa776b14b54%3A1%3A1',
    ];
    foreach ($extraHeaders as $header) {
        $headers[] = $header;
    }
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 4,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER     => $headers,
    ]);
    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error  = curl_error($ch);
    curl_close($ch);
    return [$body === false ? '' : (string) $body, $status, $error];
}

function fetchRemote(string $url): string
{
    [$body, $status] = fetchRaw($url, [], 25);
    return ($body !== '' && $status >= 200 && $status < 400) ? $body : '';
}

/* ---------------- DOM parsing (sections/cards) ---------------- */

function textContent(?DOMNode $node): string
{
    if (!$node) return '';
    return trim(preg_replace('/\s+/u', ' ', $node->textContent ?? '') ?? '');
}

function firstNode(DOMXPath $xpath, string $query, DOMNode $context): ?DOMNode
{
    $nodes = $xpath->query($query, $context);
    return ($nodes && $nodes->length) ? $nodes->item(0) : null;
}

function imageUrl(?DOMNode $image): string
{
    if (!$image instanceof DOMElement) return '';
    foreach (['src', 'data-src', 'data-lazy-src'] as $attribute) {
        $value = trim($image->getAttribute($attribute));
        if ($value !== '') return $value;
    }
    return '';
}

function parseSeriesCard(DOMXPath $xpath, DOMNode $card, string $sectionKey): ?array
{
    if (!$card instanceof DOMElement) return null;
    $link = firstNode($xpath, './/a[contains(concat(" ", normalize-space(@class), " "), " series-card__link ")]', $card);
    $titleNode = firstNode($xpath, './/div[contains(concat(" ", normalize-space(@class), " "), " series-card__copy ")]//h3', $card);
    $image = firstNode($xpath, './/div[contains(concat(" ", normalize-space(@class), " "), " series-card__poster ")]//img', $card);
    $title = textContent($titleNode);
    if ($title === '') return null;

    $episodeText = textContent(firstNode($xpath, './/*[contains(concat(" ", normalize-space(@class), " "), " episode-pill ")]', $card));
    preg_match('/\d+/u', $episodeText, $episodeMatch);
    $format = textContent(firstNode($xpath, './/*[contains(concat(" ", normalize-space(@class), " "), " format-pill ")]', $card));
    $platformNode = firstNode($xpath, './/*[contains(concat(" ", normalize-space(@class), " "), " platform-badge ")]', $card);
    $platform = $platformNode instanceof DOMElement ? trim($platformNode->getAttribute('title')) : '';
    if ($platform === '') {
        $platform = textContent(firstNode($xpath, './/div[contains(concat(" ", normalize-space(@class), " "), " series-card__copy ")]//span', $card));
    }
    if (preg_match('/idrama/i', $platform . ' ' . $title)) return null;

    return [
        'id' => $card->getAttribute('data-series-card'),
        'title' => $title,
        'url' => $link instanceof DOMElement ? $link->getAttribute('href') : '',
        'poster' => imageUrl($image),
        'episodes' => isset($episodeMatch[0]) ? (int) $episodeMatch[0] : null,
        'platform' => $platform ?: 'ONShort',
        'format' => $format,
        'section' => $sectionKey,
        'source' => 'onshort',
    ];
}

function parseSections(string $html): array
{
    if ($html === '') return [];
    libxml_use_internal_errors(true);
    $document = new DOMDocument();
    $document->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
    libxml_clear_errors();
    $xpath = new DOMXPath($document);
    $sectionNodes = $xpath->query('//section[contains(concat(" ", normalize-space(@class), " "), " app-section ")]');
    $sections = [];
    if (!$sectionNodes) return $sections;

    foreach ($sectionNodes as $section) {
        $heading = textContent(firstNode($xpath, './/h2', $section));
        $kicker = textContent(firstNode($xpath, './/*[contains(concat(" ", normalize-space(@class), " "), " red-kicker ")]', $section));
        if ($heading === '') continue;
        $haystack = mb_strtolower($heading . ' ' . $kicker);
        $classes = $section instanceof DOMElement ? ' ' . $section->getAttribute('class') . ' ' : '';
        $key = str_contains($classes, ' app-section--all ')
            ? 'all'
            : (str_contains($haystack, 'مدبلج') || str_contains($haystack, 'dubbed')
            ? 'dubbed'
            : (str_contains($haystack, 'مترجم') || str_contains($haystack, 'subtitled') ? 'subtitled' : 'latest'));
        $cards = [];
        $cardNodes = $xpath->query('.//article[contains(concat(" ", normalize-space(@class), " "), " series-card ")]', $section);
        if ($cardNodes) {
            foreach ($cardNodes as $card) {
                $parsed = parseSeriesCard($xpath, $card, $key);
                if ($parsed) $cards[] = $parsed;
            }
        }
        $sections[$key] = [
            'key' => $key,
            'kicker' => $kicker,
            'title' => $heading,
            'items' => $cards,
            'count' => count($cards),
        ];
    }

    return array_values($sections);
}

/* ---------------- series page / player config ---------------- */

function seriesPageUrl(string $post): string
{
    return ONSHORT_BASE . '/?p=' . urlencode($post);
}

function getSeriesHtml(string $post, bool $fresh = false): string
{
    $key = 'series-page|' . $post;
    if (!$fresh) {
        $cached = cacheGet($key, ONSHORT_CACHE_TTL);
        if ($cached !== null) return $cached;
    }
    [$body, $status] = fetchRaw(seriesPageUrl($post));
    if ($status >= 200 && $status < 400 && $body !== '') {
        cacheSet($key, $body);
        return $body;
    }
    return '';
}

function extractAttr(string $tag, string $name): string
{
    $quoted = preg_quote($name, '/');
    if (preg_match('/\b' . $quoted . '\s*=\s*["\']([^"\']*)["\']/u', $tag, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    return '';
}

function playerConfig(string $html): array
{
    if (!preg_match('/<div\b(?=[^>]*\bid\s*=\s*["\']onshort-player["\'])[^>]*>/iu', $html, $m)) return [];
    $tag = $m[0];
    return [
        'post'         => extractAttr($tag, 'data-post'),
        'transport'    => extractAttr($tag, 'data-transport'),
        'runtime'      => extractAttr($tag, 'data-runtime'),
        'ticket'       => extractAttr($tag, 'data-player-ticket'),
        'endpoint'     => extractAttr($tag, 'data-player-endpoint') ?: (ONSHORT_BASE . '/wp-json/onshort-player/v1/episode'),
        'endpoint_alt' => extractAttr($tag, 'data-player-endpoint-alt'),
        'title'        => extractAttr($tag, 'data-title'),
        'cover'        => extractAttr($tag, 'data-cover'),
    ];
}

function metaContent(string $html, string $property): string
{
    $quoted = preg_quote($property, '/');
    if (preg_match('/<meta[^>]*(?:property|name)="' . $quoted . '"[^>]*content="([^"]*)"/u', $html, $m)
        || preg_match('/<meta[^>]*content="([^"]*)"[^>]*(?:property|name)="' . $quoted . '"/u', $html, $m)) {
        return html_entity_decode($m[1], ENT_QUOTES);
    }
    return '';
}

/* ---------------- episodes ---------------- */

function episodeNumbersFromHtml(string $html): array
{
    if (!preg_match('/<div class="episode-strip"[^>]*>(.*?)<\/div>/us', $html, $strip)) return [];
    preg_match_all('/data-episode="(\d+)"/u', $strip[1], $numbers);
    $list = array_values(array_unique(array_map('intval', $numbers[1])));
    sort($list);
    return $list;
}

function episodeNumbersFromRange(string $html): array
{
    if (!preg_match('/class="episode-range"[^>]*>([^<]+)</u', $html, $range)) return [];
    if (!preg_match('/(\d+)\s*-\s*(\d+)/u', $range[1], $bounds)) return [];
    $from = (int) $bounds[1];
    $to = (int) $bounds[2];
    if ($to < $from || $to - $from > 2000) return [];
    return range($from, $to);
}

function fetchRuntimeJson(string $runtimeUrl): array
{
    $key = 'runtime|' . md5($runtimeUrl);
    $cached = cacheGet($key, ONSHORT_CACHE_TTL);
    if ($cached !== null) {
        $json = json_decode($cached, true);
        if (is_array($json)) return $json;
    }
    $separator = str_contains($runtimeUrl, '?') ? '&' : '?';
    [$body, $status] = fetchRaw($runtimeUrl . $separator . '_t=' . (int) (microtime(true) * 1000), ['Accept: application/json']);
    if ($status !== 200 || $body === '') return [];
    cacheSet($key, $body);
    $json = json_decode($body, true);
    return is_array($json) ? $json : [];
}

function getEpisodeNumbers(string $post, array $config, string $html): array
{
    $numbers = episodeNumbersFromHtml($html);
    if ($numbers) return $numbers;
    if (($config['transport'] ?? '') === 'runtime' && ($config['runtime'] ?? '') !== '') {
        $runtime = fetchRuntimeJson($config['runtime']);
        if (isset($runtime['episode_index']) && is_array($runtime['episode_index'])) {
            $numbers = array_values(array_filter(array_map('intval', $runtime['episode_index'])));
            if ($numbers) return $numbers;
        }
        if ((int) ($runtime['total'] ?? 0) > 0) return range(1, (int) $runtime['total']);
    }
    return episodeNumbersFromRange($html);
}

/* ---------------- playback & subtitles ---------------- */

function streamBase(): string
{
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '/onshort/api.php');
    $root = rtrim(str_replace('\\', '/', dirname(dirname($script))), '/');
    return $root . '/anyshort/stream.php';
}

function proxyUrl(string $url): string
{
    return streamBase() . '?url=' . rawurlencode($url);
}

function normalizeSubtitles(array $subtitles): array
{
    $out = [];
    foreach ($subtitles as $index => $sub) {
        if (!is_array($sub)) continue;
        $url = (string) ($sub['url'] ?? '');
        if ($url === '') continue;
        $out[] = [
            'lang'  => (string) ($sub['lang'] ?? ('track-' . $index)),
            'label' => (string) ($sub['label'] ?? 'ترجمة'),
            'format' => (string) ($sub['format'] ?? 'vtt'),
            'url'   => proxyUrl($url),
        ];
    }
    usort($out, static fn ($a, $b) => (str_starts_with($b['lang'], 'ar') ? 1 : 0) - (str_starts_with($a['lang'], 'ar') ? 1 : 0));
    return $out;
}

function playbackPayload(mixed $value): ?array
{
    if (!is_array($value)) return null;
    foreach (['url', 'src', 'file', 'stream_url', 'play_url', 'playUrl'] as $key) {
        if (isset($value[$key]) && is_string($value[$key]) && filter_var($value[$key], FILTER_VALIDATE_URL)) {
            return [
                'url' => $value[$key],
                'subtitles' => is_array($value['subtitles'] ?? null) ? $value['subtitles'] : (is_array($value['tracks'] ?? null) ? $value['tracks'] : []),
                'expires_at' => $value['expires_at'] ?? $value['expiresAt'] ?? null,
                'qualities' => is_array($value['qualities'] ?? null) ? $value['qualities'] : (is_array($value['sources'] ?? null) ? array_keys($value['sources']) : []),
            ];
        }
    }
    foreach (['data', 'result', 'stream', 'video', 'source'] as $key) {
        $found = playbackPayload($value[$key] ?? null);
        if ($found) return $found;
    }
    foreach ($value as $child) {
        $found = playbackPayload($child);
        if ($found) return $found;
    }
    return null;
}

/** النوع الأول: مسلسلات NetShort — رابط MP4 مباشر عبر محلّل الحلقات. */
function resolveRuntimeEpisode(string $post, int $episode): array
{
    // ONShort's NetShort transport exposes fresh signed URLs in one runtime response.
    // Fetching this endpoint is faster and more reliable than resolving every episode separately.
    $runtimeUrl = ONSHORT_BASE . '/wp-json/onshort-netshort/v1/series/' . urlencode($post) . '/runtime?force=1&_t=' . (int) (microtime(true) * 1000);
    [$body, $status, $curlError] = fetchRaw($runtimeUrl, [
        'Accept: */*',
        'Cache-Control: no-cache',
        'Pragma: no-cache',
    ], 15);
    if ($status === 200 && $body !== '') {
        $json = json_decode($body, true);
        $episodeRows = [];
        if (is_array($json)) {
            $episodeRows = is_array($json['episodes'] ?? null) ? $json['episodes'] : [];
            if (!$episodeRows && is_array($json['data']['episodes'] ?? null)) $episodeRows = $json['data']['episodes'];
        }
        foreach ($episodeRows as $row) {
            if (!is_array($row) || (int)($row['episode'] ?? $row['ep'] ?? $row['number'] ?? 0) !== $episode) continue;
            $payload = playbackPayload($row);
            if ($payload) return [...$payload, 'message' => ''];
        }
        return ['url' => '', 'subtitles' => [], 'expires_at' => null, 'qualities' => [], 'message' => (string) ($json['message'] ?? 'الرابط غير متاح لهذه الحلقة')];
    }
    return ['url' => '', 'subtitles' => [], 'expires_at' => null, 'qualities' => [], 'message' => $curlError !== '' ? $curlError : ('HTTP ' . $status)];
}

/** النوع الثاني: مسلسلات ذات تذكرة — m3u8 عبر onshort-player/v1/episode. */
function resolveTicketedEpisode(array $config, string $pageUrl, int $episode, string $quality): array
{
    $endpoints = array_values(array_filter([$config['endpoint'], $config['endpoint_alt']]));
    $lastMessage = '';
    for ($attempt = 0; $attempt < 2; $attempt++) {
        $ticket = (string) $config['ticket'];
        if ($ticket === '') {
            $lastMessage = 'تذكرة المشغل غير موجودة في الصفحة';
            break;
        }
        foreach ($endpoints as $endpoint) {
            $url = $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . http_build_query([
                'post'    => (string) $config['post'],
                'episode' => $episode,
                '_t'      => (int) (microtime(true) * 1000),
            ]);
            if ($quality !== '') $url .= '&quality=' . urlencode($quality);
            [$body, $status, $curlError] = fetchRaw($url, [
                'Accept: application/json',
                'Referer: ' . $pageUrl,
                'X-ONShort-Player: 1',
                'X-ONShort-Ticket: ' . $ticket,
            ], 12);
            if ($status === 200 && $body !== '') {
                $json = json_decode($body, true);
                $payload = playbackPayload($json);
                if ($payload) {
                    return [...$payload, 'message' => ''];
                }
                $lastMessage = (string) ($json['message'] ?? 'رد غير متوقع من نقطة الحلقات');
            } else {
                $json = json_decode((string) $body, true);
                $lastMessage = (string) ($json['message'] ?? ($curlError !== '' ? $curlError : ('HTTP ' . $status)));
            }
        }
        if ($attempt === 0) {
            $freshHtml = getSeriesHtml((string) $config['post'], true);
            $freshConfig = $freshHtml !== '' ? playerConfig($freshHtml) : [];
            if (!empty($freshConfig)) $config = $freshConfig;
        }
    }
    return ['url' => '', 'subtitles' => [], 'expires_at' => null, 'qualities' => [], 'message' => $lastMessage ?: 'تعذر جلب رابط التشغيل'];
}

/* ---------------- router ---------------- */

$action = (string) ($_GET['action'] ?? 'home');

try {
    switch ($action) {
        case 'session': {
            jsonOut(['api' => 'ONShort', 'version' => '3.0', 'actions' => ['home', 'section', 'series_list', 'series', 'episodes', 'play']]);
        }

        case 'home':
        case 'sections': {
            $html = cachedText('home-ar', fn () => fetchRemote(ONSHORT_HOME));
            if ($html === '') {
                jsonOut(['error' => true, 'message' => 'تعذر الاتصال بمصدر ONShort حالياً.'], 502);
            }
            jsonOut([
                'source' => [
                    'key' => 'onshort',
                    'name' => 'ONShort',
                    'url' => ONSHORT_HOME,
                    'description' => 'مسلسلات قصيرة مدبلجة ومترجمة من مصدر ONShort، تُشغَّل داخل الموقع.',
                ],
                'sections' => parseSections($html),
            ]);
        }

        case 'section': {
            $key = (string) ($_GET['key'] ?? '');
            $html = cachedText('home-ar', fn () => fetchRemote(ONSHORT_HOME));
            foreach (parseSections($html) as $section) {
                if ($section['key'] === $key) jsonOut($section);
            }
            jsonOut(['error' => true, 'message' => 'القسم غير موجود.'], 404);
        }

        case 'series_list': {
            $page = max(1, (int) ($_GET['page'] ?? 1));
            $url = $page === 1 ? ONSHORT_ALL : ONSHORT_ALL . 'page/' . $page . '/';
            $cacheKey = 'all-series|' . $page;
            $html = cacheGet($cacheKey, ONSHORT_CACHE_TTL);
            if ($html === null) {
                [$html, $status] = fetchRaw($url, ['Accept: text/html']);
                if ($html === '' || $status >= 400) {
                    jsonOut(['error' => true, 'message' => 'تعذر جلب صفحة المسلسلات رقم ' . $page . ' من المصدر.'], 502);
                }
                cacheSet($cacheKey, $html);
            }
            libxml_use_internal_errors(true);
            $document = new DOMDocument();
            $document->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NOWARNING | LIBXML_NOERROR);
            libxml_clear_errors();
            $xpath = new DOMXPath($document);
            $items = [];
            $cardNodes = $xpath->query('//article[contains(concat(" ", normalize-space(@class), " "), " series-card ")]');
            if ($cardNodes) {
                foreach ($cardNodes as $card) {
                    $parsed = parseSeriesCard($xpath, $card, 'all');
                    if ($parsed) $items[] = $parsed;
                }
            }
            preg_match_all('/ar\/all-series\/page\/(\d+)\//u', $html, $pageMatches);
            $maxPage = max(array_merge([$page], array_map('intval', $pageMatches[1])));
            jsonOut([
                'page' => $page,
                'items' => $items,
                'count' => count($items),
                'pagination' => [
                    'current' => $page,
                    'max' => $maxPage,
                    'has_prev' => $page > 1,
                    'has_next' => $page < $maxPage,
                ],
            ]);
        }

        case 'series':
        case 'episodes': {
            $post = trim((string) ($_GET['post'] ?? ''));
            if ($post === '' || !ctype_digit($post)) {
                jsonOut(['error' => true, 'message' => 'أضف ?post=رقم المسلسل'], 400);
            }
            $html = getSeriesHtml($post);
            if ($html === '') {
                jsonOut(['error' => true, 'message' => 'تعذر جلب صفحة المسلسل من المصدر.'], 502);
            }
            $config = playerConfig($html);
            if (empty($config)) {
                jsonOut(['error' => true, 'message' => 'لم يتم العثور على مشغل في صفحة المسلسل.'], 502);
            }
            $title = $config['title'] !== '' ? $config['title'] : metaContent($html, 'og:title');
            $poster = $config['cover'] !== '' ? $config['cover'] : metaContent($html, 'og:image');
            jsonOut([
                'post' => $post,
                'title' => $title,
                'poster' => $poster,
                'description' => metaContent($html, 'og:description'),
                'transport' => $config['transport'],
                'episodes' => getEpisodeNumbers($post, $config, $html),
            ]);
        }

        case 'play': {
            $post = trim((string) ($_GET['post'] ?? ''));
            $episode = max(1, (int) ($_GET['ep'] ?? 1));
            $quality = preg_replace('/\D/', '', (string) ($_GET['quality'] ?? ''));
            if ($post === '' || !ctype_digit($post)) {
                jsonOut(['error' => true, 'message' => 'أضف ?post=رقم المسلسل&ep=رقم الحلقة'], 400);
            }
            $html = getSeriesHtml($post);
            if ($html === '') {
                jsonOut(['error' => true, 'message' => 'تعذر جلب صفحة المسلسل من المصدر.'], 502);
            }
            $config = playerConfig($html);
            if (empty($config)) {
                jsonOut(['error' => true, 'message' => 'لم يتم العثور على مشغل في صفحة المسلسل.'], 502);
            }
            $pageUrl = seriesPageUrl($post);

            if (($config['transport'] ?? '') === 'runtime') {
                $result = resolveRuntimeEpisode($post, $episode);
                if (($result['url'] ?? '') === '' && !empty($config['ticket'])) {
                    // بعض الصفحات تعلن runtime لكنها تُشغَّل بالتذكرة فعلياً
                    $result = resolveTicketedEpisode($config, $pageUrl, $episode, $quality);
                }
            } else {
                $result = resolveTicketedEpisode($config, $pageUrl, $episode, $quality);
            }

            if (($result['url'] ?? '') === '') {
                jsonOut(['error' => true, 'message' => (string) ($result['message'] ?? 'تعذر جلب رابط التشغيل.')], 502);
            }

            $sourceUrl = (string) $result['url'];
            $kind = preg_match('/\.m3u8(?:$|[?#])/i', $sourceUrl) ? 'hls' : 'mp4';
            jsonOut([
                'post' => $post,
                'episode' => $episode,
                'kind' => $kind,
                'url' => proxyUrl($sourceUrl) . ($kind === 'hls' ? '&hls=1' : ''),
                'direct_url' => $sourceUrl,
                'qualities' => array_values(array_filter(array_map('intval', (array) ($result['qualities'] ?? [])))),
                'subtitles' => normalizeSubtitles((array) ($result['subtitles'] ?? [])),
                'expires_at' => $result['expires_at'] ?? null,
                'transport' => $config['transport'],
            ]);
        }

        default: {
            jsonOut([
                'api' => 'ONShort',
                'version' => '3.0',
                'actions' => ['home', 'section', 'series_list', 'series', 'episodes', 'play'],
                'examples' => [
                    '?action=home',
                    '?action=series_list&page=2',
                    '?action=series&post=203884',
                    '?action=play&post=203884&ep=1',
                    '?action=play&post=185956&ep=1',
                ],
            ]);
        }
    }
} catch (Throwable $error) {
    jsonOut(['error' => true, 'message' => 'خطأ غير متوقع: ' . $error->getMessage()], 500);
}
