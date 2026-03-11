<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_polymarket.json';
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$ctx = stream_context_create([
    'http' => ['timeout' => 12, 'header' => "User-Agent: G-Labs-Intel/1.0\r\nAccept: application/json\r\n"],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);

$url = 'https://gamma-api.polymarket.com/events?limit=12&active=true&closed=false&order=volume24hr&ascending=false';
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
    echo json_encode(['status' => 'error', 'markets' => []]);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    echo json_encode(['status' => 'error', 'markets' => []]);
    exit;
}

$markets = [];
foreach ($data as $ev) {
    $title = $ev['title'] ?? '';
    if (!$title) continue;
    $mkts = $ev['markets'] ?? [];
    $topMarket = null;
    $maxVol = 0;
    foreach ($mkts as $m) {
        $vol = floatval($m['volume24hr'] ?? 0);
        if ($vol >= $maxVol) { $maxVol = $vol; $topMarket = $m; }
    }
    if (!$topMarket) continue;
    $outcomes = json_decode($topMarket['outcomes'] ?? '[]', true) ?: [];
    $prices = json_decode($topMarket['outcomePrices'] ?? '[]', true) ?: [];
    $yesPrice = null;
    for ($i = 0; $i < count($outcomes); $i++) {
        if (strtolower($outcomes[$i]) === 'yes') {
            $yesPrice = isset($prices[$i]) ? round(floatval($prices[$i]) * 100, 1) : null;
            break;
        }
    }
    $markets[] = [
        'title' => $title,
        'slug' => $ev['slug'] ?? '',
        'yesPercent' => $yesPrice,
        'volume24h' => $maxVol,
        'liquidity' => floatval($topMarket['liquidityNum'] ?? 0),
        'endDate' => $topMarket['endDate'] ?? ''
    ];
}

$out = json_encode(['status' => 'ok', 'count' => count($markets), 'markets' => $markets, 'updatedAt' => gmdate('c')]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'markets' => []]);
