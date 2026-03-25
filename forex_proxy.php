<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(30);

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_forex.json';
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$useCurl = function_exists('curl_init');

function glFetch($url) {
    global $useCurl;
    if ($useCurl) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) G-Labs/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code >= 200 && $code < 300 && $body !== false && $body !== '') return $body;
        $useCurl = false;
    }
    $ctx = stream_context_create([
        'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $r = @file_get_contents($url, false, $ctx);
    return ($r !== false && $r !== '') ? $r : false;
}

$curs = 'EUR,GBP,JPY,CHF,CAD,AUD,NZD';
$endDate = date('Y-m-d');
$startDate = date('Y-m-d', strtotime('-7 days'));
$url = "https://api.frankfurter.app/{$startDate}..{$endDate}?from=USD&to={$curs}";
$raw = glFetch($url);

if ($raw === false) {
    echo json_encode(['status' => 'error', 'msg' => 'fetch_failed', 'pairs' => [], 'strength' => []]);
    exit;
}

$data = json_decode($raw, true);
if (!isset($data['rates']) || !is_array($data['rates']) || count($data['rates']) < 1) {
    echo json_encode(['status' => 'error', 'msg' => 'no_rates', 'pairs' => [], 'strength' => []]);
    exit;
}

$dates = array_keys($data['rates']);
sort($dates);
$latestDate = end($dates);
$prevDate = count($dates) >= 2 ? $dates[count($dates) - 2] : null;

$latestRates = $data['rates'][$latestDate];
$prevRates = $prevDate ? $data['rates'][$prevDate] : null;

$pairDefs = [
    ['pair' => 'EUR/USD', 'cur' => 'EUR', 'invert' => true],
    ['pair' => 'GBP/USD', 'cur' => 'GBP', 'invert' => true],
    ['pair' => 'USD/JPY', 'cur' => 'JPY', 'invert' => false],
    ['pair' => 'USD/CHF', 'cur' => 'CHF', 'invert' => false],
    ['pair' => 'USD/CAD', 'cur' => 'CAD', 'invert' => false],
    ['pair' => 'AUD/USD', 'cur' => 'AUD', 'invert' => true],
    ['pair' => 'NZD/USD', 'cur' => 'NZD', 'invert' => true],
];

$pairs = [];
foreach ($pairDefs as $def) {
    $cur = $def['cur'];
    if (!isset($latestRates[$cur])) continue;

    $rate = $def['invert'] ? round(1 / $latestRates[$cur], 5) : round($latestRates[$cur], $cur === 'JPY' ? 3 : 5);
    $change = null;

    if ($prevRates && isset($prevRates[$cur])) {
        $prevRate = $def['invert'] ? (1 / $prevRates[$cur]) : $prevRates[$cur];
        if ($prevRate > 0) {
            $change = round(($rate - $prevRate) / $prevRate * 100, 3);
        }
    }

    $pairs[] = ['pair' => $def['pair'], 'rate' => $rate, 'change' => $change];
}

$curScores = ['USD' => [], 'EUR' => [], 'GBP' => [], 'JPY' => [], 'CHF' => [], 'CAD' => [], 'AUD' => [], 'NZD' => []];
foreach ($pairs as $p) {
    if ($p['change'] === null) continue;
    $parts = explode('/', $p['pair']);
    $curScores[$parts[0]][] = $p['change'];
    $curScores[$parts[1]][] = -$p['change'];
}

$raw_scores = [];
$hasChange = false;
foreach ($curScores as $cur => $moves) {
    $raw_scores[$cur] = count($moves) ? array_sum($moves) / count($moves) : 0;
    if (count($moves) > 0) $hasChange = true;
}

$strength = [];
if ($hasChange) {
    $minS = min($raw_scores); $maxS = max($raw_scores); $rangeS = $maxS - $minS;
    if ($rangeS > 0) {
        foreach ($raw_scores as $cur => $v) {
            $strength[$cur] = round(($v - $minS) / $rangeS * 100, 1);
        }
    } else {
        foreach ($raw_scores as $cur => $v) {
            $strength[$cur] = 50 + round($v * 10, 1);
        }
    }
} else {
    foreach ($raw_scores as $cur => $v) {
        $strength[$cur] = null;
    }
}

$out = json_encode([
    'status' => 'ok',
    'pairs' => $pairs,
    'strength' => $strength,
    'dates' => ['latest' => $latestDate, 'previous' => $prevDate],
    'updatedAt' => gmdate('c')
]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
