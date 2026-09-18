<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Range, Origin, Accept, Content-Type');
header('Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$url = trim((string)($_GET['url'] ?? ''));
if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo 'رابط الفيديو غير صالح';
    exit;
}

$parts = parse_url($url);
$host = strtolower((string)($parts['host'] ?? ''));
$path = strtolower((string)($parts['path'] ?? ''));
$query = strtolower((string)($parts['query'] ?? ''));

// مضيفو الفيديو المسموحون
$videoAllowed = $host === 'v-mps.crazymaplestudios.com'
    || str_ends_with($host, '.mydramawave.com') || $host === 'mydramawave.com'
    || str_ends_with($host, '.netshort.com') || $host === 'netshort.com'
    || str_ends_with($host, '.tiktokcdn.com') || $host === 'tiktokcdn.com';

// الترجمات من onshort.net: مسار نقاط الترجمة فقط (وليس أي صفحة HTML)
$isSubtitlePath = $host === 'onshort.net'
    && str_contains($path, 'admin-ajax.php')
    && (str_contains($query, 'action=osns_subtitle') || str_contains($query, 'action=osdw_subtitle'));

if (!in_array(strtolower((string)($parts['scheme'] ?? '')), ['http', 'https'], true) || (!$videoAllowed && !$isSubtitlePath)) {
    http_response_code(403);
    echo 'مصدر الفيديو غير مسموح';
    exit;
}

$isSubtitle = $isSubtitlePath;

/* مخزن مؤقت محلي لمقاطع الفيديو الصغيرة (مقاطع HLS) لتشغيل فوري عند التكرار */
const SEG_CACHE_DIR = __DIR__ . '/.cache_seg/';
const SEG_CACHE_TTL = 0;
if (!is_dir(SEG_CACHE_DIR)) @mkdir(SEG_CACHE_DIR, 0755, true);

function segCacheHit(string $url): ?string {
    $file = SEG_CACHE_DIR . md5($url) . '.bin';
    if (is_file($file) && (time() - (int) filemtime($file)) < SEG_CACHE_TTL) {
        return (string) file_get_contents($file);
    }
    return null;
}

function segCacheSet(string $url, string $body): void {
    if ($body === '' || strlen($body) > 8388608) return;
    @file_put_contents(SEG_CACHE_DIR . md5($url) . '.bin', $body);
}

function upstream(string $url, ?string $range = null): array {
    // إحالة مرجعية مناسبة للمصدر: onshort للترجمات، وanyshort لفيديو NetShort
    $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?? ''));
    $referer = ($host === 'onshort.net' || str_ends_with($host, 'onshort.net') || str_ends_with($host, 'netshort.com') || $host === 'netshort.com')
        ? 'https://onshort.net/'
        : 'https://anyshort.net/';
    $headers = [
        'Accept: */*',
        'Accept-Encoding: identity',
        'Referer: ' . $referer,
        'Origin: ' . rtrim($referer, '/'),
        'User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
    ];
    if ($range !== null) $headers[] = 'Range: ' . $range;

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    $body = curl_exec($ch);
    $info = curl_getinfo($ch);
    $error = curl_error($ch);
    curl_close($ch);
    return [$body, $info, $error];
}

function absoluteUrl(string $base, string $reference): string {
    if (preg_match('#^https?://#i', $reference)) return $reference;
    $baseParts = parse_url($base);
    $scheme = $baseParts['scheme'] ?? 'https';
    $host = $baseParts['host'] ?? '';
    $port = isset($baseParts['port']) ? ':' . $baseParts['port'] : '';
    if (str_starts_with($reference, '//')) return $scheme . ':' . $reference;
    if (str_starts_with($reference, '/')) return $scheme . '://' . $host . $port . $reference;
    $path = $baseParts['path'] ?? '/';
    $directory = rtrim(str_replace('\\', '/', dirname($path)), '/');
    $combined = ($directory ? $directory . '/' : '/') . $reference;
    $segments = [];
    foreach (explode('/', $combined) as $segment) {
        if ($segment === '' || $segment === '.') continue;
        if ($segment === '..') { array_pop($segments); continue; }
        $segments[] = $segment;
    }
    return $scheme . '://' . $host . $port . '/' . implode('/', $segments);
}

function proxyUrl(string $url): string {
    return 'stream.php?url=' . rawurlencode($url);
}

function rewritePlaylist(string $playlist, string $baseUrl): string {
    $lines = preg_split("/\r\n|\n|\r/", $playlist);
    $rewritten = [];
    foreach ($lines as $line) {
        if (preg_match('/URI="([^"]+)"/i', $line, $match)) {
            $target = absoluteUrl($baseUrl, $match[1]);
            $line = str_replace($match[1], proxyUrl($target), $line);
        } elseif ($line !== '' && !str_starts_with($line, '#')) {
            $line = proxyUrl(absoluteUrl($baseUrl, trim($line)));
        }
        $rewritten[] = $line;
    }
    return implode("\n", $rewritten);
}

$isPlaylist = preg_match('/\.m3u8(?:$|[?#])/i', $url) === 1 || (string)($_GET['hls'] ?? '') === '1';
if ($isPlaylist) {
    [$body, $info, $error] = upstream($url);
    if ($body === false || ($info['http_code'] ?? 0) < 200 || ($info['http_code'] ?? 0) >= 400) {
        http_response_code(502);
        echo 'تعذر تحميل قائمة الفيديو';
        exit;
    }
    header('Content-Type: application/vnd.apple.mpegurl; charset=UTF-8');
    header('Cache-Control: no-store');
    echo rewritePlaylist((string)$body, (string)($info['url'] ?? $url));
    exit;
}

if ($isSubtitle) {
    [$body, $info, $error] = upstream($url);
    if ($body === false || ($info['http_code'] ?? 0) < 200 || ($info['http_code'] ?? 0) >= 400) {
        http_response_code(502);
        echo 'تعذر تحميل ملف الترجمة';
        exit;
    }
    $contentType = (string)($info['content_type'] ?? '');
    if ($contentType === '' || !preg_match('/vtt|plain|octet-stream/i', $contentType)) {
        $contentType = 'text/vtt; charset=UTF-8';
    }
    header('Content-Type: ' . $contentType);
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    echo $body;
    exit;
}

$range = $_SERVER['HTTP_RANGE'] ?? null;
if ($range === null) {
    $hit = segCacheHit($url);
    if ($hit !== null) {
        header('Content-Type: video/mp4');
        header('Accept-Ranges: bytes');
        header('Content-Length: ' . strlen($hit));
        header('Cache-Control: public, max-age=300');
        echo $hit;
        exit;
    }
}
if ($range !== null) {
    http_response_code(206);
    header('Accept-Ranges: bytes');
}

$upstreamReferer = ($host === 'onshort.net' || str_ends_with($host, 'onshort.net') || str_ends_with($host, 'netshort.com') || $host === 'netshort.com')
    ? 'https://onshort.net/'
    : 'https://anyshort.net/';
$headers = [
    'Accept: */*',
    'Accept-Encoding: identity',
    'Referer: ' . $upstreamReferer,
    'Origin: ' . rtrim($upstreamReferer, '/'),
    'User-Agent: Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
];
if ($range !== null) $headers[] = 'Range: ' . $range;

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 0,
    CURLOPT_ENCODING => '',
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_HEADERFUNCTION => static function ($ch, string $line): int {
        $length = strlen($line);
        $trimmed = trim($line);
        if (preg_match('/^Content-(Length|Range|Type):/i', $trimmed) || preg_match('/^Accept-Ranges:/i', $trimmed)) {
            header($trimmed);
        }
        return $length;
    },
    CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$buffer, $url, $range): int {
        echo $chunk;
        flush();
        if ($range === null && strlen($buffer) < 8388608) $buffer .= $chunk;
        return strlen($chunk);
    },
]);
header('Content-Type: video/mp4');
header('Cache-Control: no-store');
$buffer = '';
$ok = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
if ($range === null && $ok !== false && $status === 200 && $buffer !== '' && strlen($buffer) <= 8388608) {
    segCacheSet($url, $buffer);
}
curl_close($ch);

if ($ok === false || $status >= 400 || $status === 0) {
    if (!headers_sent()) http_response_code(502);
}
