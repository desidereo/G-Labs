<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=60');
header('Access-Control-Allow-Origin: *');

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_crypto.json';
$cacheTtl = 60;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$ids = 'bitcoin,ethereum,solana,binancecoin,ripple,cardano,dogecoin,avalanche-2,chainlink,polygon';
$url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids={$ids}&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=1h,24h,7d";
$ctx = stream_context_create([
    'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs-Intel/1.0\r\nAccept: application/json\r\n"],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
    echo json_encode(['status' => 'error', 'coins' => []]);
    exit;
}
$data = json_decode($raw, true);
if (!is_array($data)) {
    echo json_encode(['status' => 'error', 'coins' => []]);
    exit;
}

$coins = [];
foreach ($data as $c) {
    $coins[] = [
        'id' => $c['id'] ?? '',
        'symbol' => strtoupper($c['symbol'] ?? ''),
        'name' => $c['name'] ?? '',
        'price' => $c['current_price'] ?? null,
        'change1h' => $c['price_change_percentage_1h_in_currency'] ?? null,
        'change24h' => $c['price_change_percentage_24h'] ?? null,
        'change7d' => $c['price_change_percentage_7d_in_currency'] ?? null,
        'marketCap' => $c['market_cap'] ?? null,
        'volume24h' => $c['total_volume'] ?? null,
        'image' => $c['image'] ?? ''
    ];
}

$out = json_encode(['status' => 'ok', 'coins' => $coins, 'updatedAt' => gmdate('c')]);
if ($out) @file_put_contents($cachePath, $out);
echo $out;
