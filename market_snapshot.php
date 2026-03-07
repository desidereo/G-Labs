<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$symbolsRaw = isset($_GET['symbols']) ? strtoupper(trim($_GET['symbols'])) : 'SPY,QQQ,DIA,GLD,USO,EURUSD';
$symbolsRaw = preg_replace('/[^A-Z0-9,]/', '', $symbolsRaw);
$symbols = array_values(array_filter(array_unique(array_map('trim', explode(',', $symbolsRaw))), function ($s) {
    return strlen($s) >= 3 && strlen($s) <= 8;
}));
if (!count($symbols)) $symbols = ['SPY','QQQ','DIA','GLD','USO','EURUSD'];
if (count($symbols) > 10) $symbols = array_slice($symbols, 0, 10);

function fetchJsonPayload($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: G-Labs-MarketBot/1.0\r\n"
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true
        ]
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false || trim($raw) === '') return null;
    $json = json_decode($raw, true);
    return is_array($json) ? $json : null;
}

function normalizeMarketstack($data) {
    if (!isset($data['data']) || !is_array($data['data'])) return [];
    $rows = [];
    foreach ($data['data'] as $item) {
        if (!isset($item['symbol'], $item['close']) || !is_numeric($item['close'])) continue;
        $open = isset($item['open']) && is_numeric($item['open']) ? floatval($item['open']) : null;
        $close = floatval($item['close']);
        $changePct = null;
        if ($open && $open != 0) $changePct = (($close - $open) / $open) * 100;
        $rows[$item['symbol']] = [
            'symbol' => $item['symbol'],
            'price' => $close,
            'changePct' => $changePct
        ];
    }
    return array_values($rows);
}

function normalizeStooqCsv($csv) {
    $rows = [];
    $lines = preg_split('/\r\n|\r|\n/', trim($csv));
    if (!$lines || count($lines) < 2) return $rows;
    $header = str_getcsv($lines[0]);
    $idx = array_flip($header);
    foreach (array_slice($lines, 1) as $line) {
        if (trim($line) === '') continue;
        $cols = str_getcsv($line);
        if (!isset($idx['Symbol'], $idx['Close'], $idx['Open'])) continue;
        $symbol = strtoupper($cols[$idx['Symbol']] ?? '');
        $close = $cols[$idx['Close']] ?? '';
        $open = $cols[$idx['Open']] ?? '';
        if (!$symbol || !is_numeric($close)) continue;
        $closeF = floatval($close);
        $openF = is_numeric($open) ? floatval($open) : 0.0;
        $changePct = $openF > 0 ? (($closeF - $openF) / $openF) * 100 : null;
        $rows[] = [
            'symbol' => $symbol,
            'price' => $closeF,
            'changePct' => $changePct
        ];
    }
    return $rows;
}

$cacheKey = 'g_labs_stocks_' . implode('', $symbols) . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 120;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$provider = '';
$rows = [];
$marketstackKey = getenv('MARKETSTACK_API_KEY');
if ($marketstackKey) {
    $url = 'http://api.marketstack.com/v1/eod/latest?access_key=' . urlencode($marketstackKey) . '&symbols=' . urlencode(implode(',', $symbols));
    $json = fetchJsonPayload($url);
    $rows = normalizeMarketstack($json);
    if (count($rows)) $provider = 'marketstack';
}

if (!count($rows)) {
    $stooqSymbols = array_map(function ($s) { return strtolower($s) . '.us'; }, array_filter($symbols, function ($s) { return preg_match('/^[A-Z]{2,5}$/', $s); }));
    if (count($stooqSymbols)) {
        $csvUrl = 'https://stooq.com/q/l/?s=' . implode(',', $stooqSymbols) . '&f=sd2t2ohlcv&h&e=csv';
        $ctx = stream_context_create(['http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs-MarketBot/1.0\r\n"]]);
        $csv = @file_get_contents($csvUrl, false, $ctx);
        if ($csv !== false) {
            $rows = normalizeStooqCsv($csv);
            if (count($rows)) $provider = 'stooq';
        }
    }
}

if (!count($rows)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load market snapshot',
        'provider' => 'none',
        'updatedAt' => gmdate('c'),
        'data' => []
    ]);
    exit;
}

$payload = [
    'status' => 'ok',
    'provider' => $provider ?: 'feed',
    'updatedAt' => gmdate('c'),
    'data' => $rows
];
$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'provider' => 'none',
        'data' => []
    ]);
    exit;
}
@file_put_contents($cachePath, $json);
echo $json;
?>
