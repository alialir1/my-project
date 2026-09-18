<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ضغط استجابات JSON لتسريع النقل
if (ob_get_level() === 0 && function_exists('ob_gzhandler')) { ob_start('ob_gzhandler'); }

const BASE_API    = 'https://anyshort.net/v1';
const CACHE_DIR   = __DIR__ . '/.cache_as/';
const TOKEN_FILE  = CACHE_DIR . 'token.json';
const DEVICE_FILE = CACHE_DIR . 'device.txt';
const CACHE_TTL   = 300;
const TOKEN_TTL   = 1500;
const USER_AGENT  = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0755, true);

function getDeviceId(): string {
    return is_file(DEVICE_FILE) ? trim(file_get_contents(DEVICE_FILE)) : '';
}
function saveDeviceId(string $id): void {
    if ($id !== '') @file_put_contents(DEVICE_FILE, $id);
}

function getToken(bool $forceNew = false): ?string {
    if (!$forceNew && is_file(TOKEN_FILE)) {
        $d = json_decode(file_get_contents(TOKEN_FILE), true);
        if (is_array($d) && isset($d['token'], $d['expires_at']) && time() < (int)$d['expires_at']) {
            return $d['token'];
        }
    }
    $deviceId = getDeviceId();
    $body = ['platform' => 'web'];
    if ($deviceId !== '') $body['device_id'] = $deviceId;

    $ch = curl_init(BASE_API . '/auth/session');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => [
            'Host: anyshort.net',
            'Content-Type: application/json',
            'Accept: */*',
            'Accept-Language: ar-IQ,ar;q=0.9',
            'Origin: https://anyshort.net',
            'Referer: https://anyshort.net/ar/',
            'User-Agent: ' . USER_AGENT,
        ],
        CURLOPT_POSTFIELDS     => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($code !== 200 || $resp === false) return null;

    $json = json_decode($resp, true);
    $token = $json['data']['access_token'] ?? null;
    $newDeviceId = $json['data']['device_id'] ?? null;
    if (!$token) return null;
    if ($newDeviceId) saveDeviceId($newDeviceId);

    @file_put_contents(TOKEN_FILE, json_encode([
        'token' => $token, 'expires_at' => time() + TOKEN_TTL, 'saved_at' => time(),
    ], JSON_UNESCAPED_UNICODE));
    return $token;
}

function apiRequest(string $path, array $params = [], string $method = 'GET', ?array $body = null, bool $retry = true): array {
    $token = getToken();
    if (!$token) return ['error' => true, 'message' => 'فشل الحصول على التوكن'];

    $url = BASE_API . $path;
    if (!empty($params)) $url .= '?' . http_build_query($params);

    $headers = [
        'Host: anyshort.net',
        'Authorization: Bearer ' . $token,
        'Accept: */*',
        'Accept-Language: ar-IQ,ar;q=0.9',
        'Origin: https://anyshort.net',
        'Referer: https://anyshort.net/ar/',
        'User-Agent: ' . USER_AGENT,
        'sec-fetch-site: same-origin',
        'sec-fetch-mode: cors',
        'sec-fetch-dest: empty',
    ];
    if ($body !== null) $headers[] = 'Content-Type: application/json';

    $ch = curl_init($url);
    $opt = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_ENCODING       => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_HTTPHEADER     => $headers,
    ];
    if ($method !== 'GET') {
        $opt[CURLOPT_CUSTOMREQUEST] = $method;
        if ($body !== null) $opt[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opt);

    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

    if ($code === 401 && $retry) {
        getToken(true);
        return apiRequest($path, $params, $method, $body, false);
    }
    if ($code !== 200 || $resp === false) {
        return ['error' => true, 'http' => $code, 'body' => substr((string)$resp, 0, 800)];
    }
    return json_decode($resp, true) ?: ['error' => true, 'message' => 'JSON غير صالح'];
}

function withCache(string $key, int $ttl, callable $fn): array {
    $file = CACHE_DIR . md5($key) . '.json';
    if (is_file($file) && (time() - filemtime($file)) < $ttl) {
        $cached = json_decode(file_get_contents($file), true);
        if (is_array($cached)) { $cached['_cached'] = true; return $cached; }
    }
    $result = $fn();
    if (is_array($result) && !isset($result['error'])) {
        @file_put_contents($file, json_encode($result, JSON_UNESCAPED_UNICODE));
    }
    if (!is_array($result)) $result = ['error' => true, 'message' => 'رد غير متوقع'];
    $result['_cached'] = false;
    return $result;
}

function jsonOut(array $data): void {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}
function badRequest(string $msg): void {
    http_response_code(400);
    jsonOut(['error' => true, 'message' => $msg]);
}

$action = $_GET['action'] ?? 'help';
$lang   = $_GET['lang']   ?? 'ar';
$t0     = microtime(true);

$simpleActions = [
    'session'   => fn() => ['token' => getToken(isset($_GET['force'])), 'device_id' => getDeviceId()],
    'config'    => fn() => withCache('config', CACHE_TTL,      fn() => apiRequest('/config')),
    'home'      => fn() => withCache("home|$lang", CACHE_TTL,  fn() => apiRequest('/home', ['lang' => $lang])),
    'tags'      => fn() => withCache("tags|$lang", 1800,        fn() => apiRequest('/tags', ['lang' => $lang])),
    'languages' => fn() => withCache("langs|$lang", 3600,       fn() => apiRequest('/languages', ['lang' => $lang])),
    'sources'   => fn() => withCache("src|$lang", 3600,         fn() => apiRequest('/sources', ['lang' => $lang])),
];

if (isset($simpleActions[$action])) {
    $result = $simpleActions[$action]();
    if (!is_array($result)) $result = ['error' => true, 'message' => 'رد غير متوقع'];
    $result['_elapsed_ms'] = round((microtime(true) - $t0) * 1000);
    jsonOut($result);
}

$params = ['lang' => $lang];
foreach (['cursor', 'sort', 'limit', 'offset', 'q', 'sub_lang'] as $k) {
    if (isset($_GET[$k]) && $_GET[$k] !== '') $params[$k] = $_GET[$k];
}

$result = null;

switch ($action) {

    case 'browse':
        $result = withCache('browse|' . json_encode($params), CACHE_TTL,
            fn() => apiRequest('/browse', $params));
        break;

    case 'search':
        if (empty($params['q'])) badRequest('أضف ?q=نص البحث');
        $result = withCache('search|' . json_encode($params), 120,
            fn() => apiRequest('/search', $params));
        break;

    case 'title':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) badRequest('أضف ?id=رقم المسلسل');
        $result = withCache("title|$id|$lang", 600,
            fn() => apiRequest("/titles/$id", ['lang' => $lang]));
        break;

    case 'episodes':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) badRequest('أضف ?id=رقم المسلسل');
        $result = apiRequest("/titles/$id/episodes", $params);
        break;

    case 'play':
        $eid = $_GET['eid'] ?? '';
        if ($eid === '') badRequest('أضف ?eid=رقم الحلقة');
        $video = withCache("play|$eid|$lang", 1800,
            fn() => apiRequest("/episodes/$eid/play", $params));
        if (!empty($_GET['with_sub'])) {
            $subs = withCache("sub|$eid|$lang", 1800,
                fn() => apiRequest("/episodes/$eid/subtitles", ['lang' => $lang]));
            $video['subtitles'] = $subs['data'] ?? [];
        }
        $result = $video;
        break;

    case 'subtitles':
        $eid = $_GET['eid'] ?? '';
        if ($eid === '') badRequest('أضف ?eid=رقم الحلقة');
        $result = withCache("sub|$eid|$lang", 1800,
            fn() => apiRequest("/episodes/$eid/subtitles", ['lang' => $lang]));
        break;

    case 'tag_titles':
        $id = (int)($_GET['id'] ?? 0);
        if (!$id) badRequest('أضف ?id=رقم التصنيف');
        $result = apiRequest("/tags/$id/titles", $params);
        break;

    case 'collection':
        $id = $_GET['id'] ?? '';
        if ($id === '') badRequest('أضف ?id=رقم المجموعة');
        $result = withCache("coll|$id|$lang", 600,
            fn() => apiRequest("/collections/$id", ['lang' => $lang]));
        break;

    default:
        $result = [
            'api'     => 'AnyShort',
            'version' => '2.1',
            'actions' => [
                'session', 'config', 'home', 'browse', 'search', 'tags',
                'tag_titles', 'title', 'episodes', 'play', 'subtitles',
                'collection', 'languages', 'sources'
            ],
            'examples' => [
                '?action=session',
                '?action=home&lang=ar',
                '?action=browse&lang=ar&limit=50',
                '?action=title&id=36936',
                '?action=episodes&id=36936',
                '?action=play&eid=1917829',
                '?action=play&eid=1917829&with_sub=1',
                '?action=subtitles&eid=1917829',
                '?action=search&q=انتقام',
                '?action=tags&lang=ar',
                '?action=tag_titles&id=137',
            ],
        ];
}

if (!is_array($result)) $result = ['error' => true, 'message' => 'رد غير متوقع'];
$result['_elapsed_ms'] = round((microtime(true) - $t0) * 1000);
jsonOut($result);