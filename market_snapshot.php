<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=120');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(30);

$symbolsRaw = isset($_GET['symbols']) ? strtoupper(trim($_GET['symbols'])) : 'SPY,QQQ,DIA,GLD,USO';
$symbolsRaw = preg_replace('/[^A-Z0-9,]/', '', $symbolsRaw);
$symbols = array_values(array_filter(array_unique(array_map('trim', explode(',', $symbolsRaw))), function ($s) {
    return strlen($s) >= 2 && strlen($s) <= 8;
}));
if (!count($symbols)) $symbols = ['SPY','QQQ','DIA','GLD','USO'];
if (count($symbols) > 10) $symbols = array_slice($symbols, 0, 10);

$cacheKey = 'g_labs_stocks_' . md5(implode(',', $symbols)) . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 120;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function curlGet($url, $ua, $timeout = 8) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => $ua,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_ENCODING       => '',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ($code >= 200 && $code < 400 && $body) ? $body : false;
    }
    $ctx = stream_context_create([
        'http' => ['timeout' => $timeout, 'header' => "User-Agent: $ua\r\n", 'ignore_errors' => true],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
    ]);
    return @file_get_contents($url, false, $ctx);
}

$provider = '';
$rows = [];

// --- Provider 1: Stooq CSV (free, no key) ---
$stooqSymbols = array_map(function ($s) { return strtolower($s) . '.us'; }, array_filter($symbols, function ($s) { return preg_match('/^[A-Z]{2,5}$/', $s); }));
if (count($stooqSymbols)) {
    $csvUrl = 'https://stooq.com/q/l/?s=' . implode(',', $stooqSymbols) . '&f=sd2t2ohlcv&h&e=csv';
    $csv = curlGet($csvUrl, $ua, 8);
    if ($csv !== false && strlen($csv) > 50) {
        $lines = preg_split('/\r\n|\r|\n/', trim($csv));
        if (count($lines) >= 2) {
            $header = str_getcsv($lines[0]);
            $idx = array_flip($header);
            foreach (array_slice($lines, 1) as $line) {
                if (trim($line) === '') continue;
                $cols = str_getcsv($line);
                if (!isset($idx['Symbol'], $idx['Close'])) continue;
                $symbol = strtoupper(str_replace('.US', '', $cols[$idx['Symbol']] ?? ''));
                $close = $cols[$idx['Close']] ?? '';
                $open = $cols[$idx['Open']] ?? '';
                if (!$symbol || !is_numeric($close)) continue;
                $closeF = floatval($close);
                $openF = is_numeric($open) ? floatval($open) : 0;
                $changePct = $openF > 0 ? round((($closeF - $openF) / $openF) * 100, 3) : null;
                $rows[] = ['symbol' => $symbol, 'price' => $closeF, 'changePct' => $changePct];
            }
            if (count($rows)) $provider = 'stooq';
        }
    }
}

// --- Provider 2: Yahoo Finance v8 (free, no key) ---
if (!count($rows)) {
    $ySymbols = implode(',', $symbols);
    $yahooUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($symbols[0]) . '?interval=1d&range=2d';
    foreach ($symbols as $sym) {
        $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' . urlencode($sym) . '?interval=1d&range=2d';
        $raw = curlGet($url, $ua, 6);
        if ($raw === false) continue;
        $j = @json_decode($raw, true);
        if (!isset($j['chart']['result'][0])) continue;
        $r = $j['chart']['result'][0];
        $meta = $r['meta'] ?? [];
        $price = $meta['regularMarketPrice'] ?? null;
        $prevClose = $meta['chartPreviousClose'] ?? $meta['previousClose'] ?? null;
        if ($price && is_numeric($price)) {
            $changePct = ($prevClose && $prevClose > 0) ? round(($price - $prevClose) / $prevClose * 100, 3) : null;
            $rows[] = ['symbol' => strtoupper($sym), 'price' => floatval($price), 'changePct' => $changePct];
        }
    }
    if (count($rows)) $provider = 'yahoo';
}

// --- Provider 3: Marketstack (needs API key) ---
if (!count($rows)) {
    $msKey = getenv('MARKETSTACK_API_KEY');
    if ($msKey) {
        $url = 'http://api.marketstack.com/v1/eod/latest?access_key=' . urlencode($msKey) . '&symbols=' . urlencode(implode(',', $symbols));
        $raw = curlGet($url, $ua, 8);
        if ($raw) {
            $data = @json_decode($raw, true);
            if (isset($data['data']) && is_array($data['data'])) {
                foreach ($data['data'] as $item) {
                    if (!isset($item['symbol'], $item['close']) || !is_numeric($item['close'])) continue;
                    $open = isset($item['open']) && is_numeric($item['open']) ? floatval($item['open']) : null;
                    $close = floatval($item['close']);
                    $changePct = ($open && $open > 0) ? round(($close - $open) / $open * 100, 3) : null;
                    $rows[] = ['symbol' => $item['symbol'], 'price' => $close, 'changePct' => $changePct];
                }
                if (count($rows)) $provider = 'marketstack';
            }
        }
    }
}

$payload = [
    'status' => count($rows) ? 'ok' : 'error',
    'provider' => $provider ?: 'none',
    'updatedAt' => gmdate('c'),
    'data' => $rows
];

$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json && count($rows) > 0) @file_put_contents($cachePath, $json);
echo $json ?: json_encode(['status' => 'error', 'provider' => 'none', 'data' => []]);
