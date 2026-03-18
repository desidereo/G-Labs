<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_forex.json';
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$ctx = stream_context_create([
    'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs-Intel/1.0\r\n"],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);

$pairs = [];

$bases = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'USD', 'USD'];
$quotes = ['USD', 'USD', 'USD', 'USD', 'JPY', 'CHF', 'CAD'];

$url = 'https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,CHF,CAD,AUD,NZD';
$raw = @file_get_contents($url, false, $ctx);
if ($raw !== false) {
    $data = json_decode($raw, true);
    if (isset($data['rates']) && is_array($data['rates'])) {
        $rates = $data['rates'];
        if (isset($rates['EUR'])) $pairs[] = ['pair' => 'EUR/USD', 'rate' => round(1 / $rates['EUR'], 5), 'change' => null];
        if (isset($rates['GBP'])) $pairs[] = ['pair' => 'GBP/USD', 'rate' => round(1 / $rates['GBP'], 5), 'change' => null];
        if (isset($rates['JPY'])) $pairs[] = ['pair' => 'USD/JPY', 'rate' => round($rates['JPY'], 3), 'change' => null];
        if (isset($rates['CHF'])) $pairs[] = ['pair' => 'USD/CHF', 'rate' => round($rates['CHF'], 5), 'change' => null];
        if (isset($rates['CAD'])) $pairs[] = ['pair' => 'USD/CAD', 'rate' => round($rates['CAD'], 5), 'change' => null];
        if (isset($rates['AUD'])) $pairs[] = ['pair' => 'AUD/USD', 'rate' => round(1 / $rates['AUD'], 5), 'change' => null];
        if (isset($rates['NZD'])) $pairs[] = ['pair' => 'NZD/USD', 'rate' => round(1 / $rates['NZD'], 5), 'change' => null];
    }
}

$prevUrl = 'https://api.frankfurter.app/' . date('Y-m-d', strtotime('-1 day')) . '?from=USD&to=EUR,GBP,JPY,CHF,CAD,AUD,NZD';
$prevRaw = @file_get_contents($prevUrl, false, $ctx);
if ($prevRaw !== false) {
    $prevData = json_decode($prevRaw, true);
    if (isset($prevData['rates'])) {
        $pr = $prevData['rates'];
        foreach ($pairs as &$p) {
            $sym = $p['pair'];
            if ($sym === 'EUR/USD' && isset($pr['EUR'])) { $prev = 1 / $pr['EUR']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'GBP/USD' && isset($pr['GBP'])) { $prev = 1 / $pr['GBP']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'USD/JPY' && isset($pr['JPY'])) { $prev = $pr['JPY']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'USD/CHF' && isset($pr['CHF'])) { $prev = $pr['CHF']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'USD/CAD' && isset($pr['CAD'])) { $prev = $pr['CAD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'AUD/USD' && isset($pr['AUD'])) { $prev = 1 / $pr['AUD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
            elseif ($sym === 'NZD/USD' && isset($pr['NZD'])) { $prev = 1 / $pr['NZD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        }
        unset($p);
    }
}

$strength = [];
$curScores = ['USD' => [], 'EUR' => [], 'GBP' => [], 'JPY' => [], 'CHF' => [], 'CAD' => [], 'AUD' => [], 'NZD' => []];
foreach ($pairs as $p) {
    if ($p['change'] === null) continue;
    $parts = explode('/', $p['pair']);
    $base = $parts[0]; $quote = $parts[1];
    $curScores[$base][] = $p['change'];
    $curScores[$quote][] = -$p['change'];
}
$raw_scores = [];
foreach ($curScores as $cur => $moves) {
    $raw_scores[$cur] = count($moves) ? array_sum($moves) / count($moves) : 0;
}
$minS = min($raw_scores); $maxS = max($raw_scores); $rangeS = $maxS - $minS;
foreach ($raw_scores as $cur => $v) {
    $strength[$cur] = $rangeS > 0 ? round(($v - $minS) / $rangeS * 100, 1) : 50;
}

$out = json_encode(['status' => 'ok', 'pairs' => $pairs, 'strength' => $strength, 'updatedAt' => gmdate('c')]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
