<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function fetchJsonData($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: G-Labs-PublicSignals/1.0\r\n"
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

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_public_signals.json';
if (file_exists($cachePath) && (time() - filemtime($cachePath) < 90)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$signals = [];

$cg = fetchJsonData('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
if ($cg) {
    $signals[] = ['name' => 'BTC/USD', 'value' => isset($cg['bitcoin']['usd']) ? floatval($cg['bitcoin']['usd']) : null, 'change24h' => isset($cg['bitcoin']['usd_24h_change']) ? floatval($cg['bitcoin']['usd_24h_change']) : null, 'source' => 'coingecko'];
    $signals[] = ['name' => 'ETH/USD', 'value' => isset($cg['ethereum']['usd']) ? floatval($cg['ethereum']['usd']) : null, 'change24h' => isset($cg['ethereum']['usd_24h_change']) ? floatval($cg['ethereum']['usd_24h_change']) : null, 'source' => 'coingecko'];
}

$fng = fetchJsonData('https://api.alternative.me/fng/?limit=1');
if ($fng && isset($fng['data'][0])) {
    $d = $fng['data'][0];
    $signals[] = ['name' => 'Crypto Fear & Greed', 'value' => isset($d['value']) ? intval($d['value']) : null, 'label' => $d['value_classification'] ?? '', 'source' => 'alternative_me'];
}

$weather = fetchJsonData('https://api.open-meteo.com/v1/forecast?latitude=29.76&longitude=-95.36&current=temperature_2m,wind_speed_10m&timezone=GMT');
if ($weather && isset($weather['current'])) {
    $cur = $weather['current'];
    $signals[] = ['name' => 'Houston Temp C', 'value' => isset($cur['temperature_2m']) ? floatval($cur['temperature_2m']) : null, 'source' => 'open_meteo'];
    $signals[] = ['name' => 'Houston Wind km/h', 'value' => isset($cur['wind_speed_10m']) ? floatval($cur['wind_speed_10m']) : null, 'source' => 'open_meteo'];
}

$iss = fetchJsonData('http://api.open-notify.org/iss-now.json');
if ($iss && isset($iss['iss_position'])) {
    $signals[] = ['name' => 'ISS Latitude', 'value' => isset($iss['iss_position']['latitude']) ? floatval($iss['iss_position']['latitude']) : null, 'source' => 'open_notify'];
    $signals[] = ['name' => 'ISS Longitude', 'value' => isset($iss['iss_position']['longitude']) ? floatval($iss['iss_position']['longitude']) : null, 'source' => 'open_notify'];
}

if (!count($signals)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'No public signals available',
        'updatedAt' => gmdate('c'),
        'signals' => []
    ]);
    exit;
}

$payload = [
    'status' => 'ok',
    'updatedAt' => gmdate('c'),
    'signals' => array_values($signals)
];
$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'signals' => []
    ]);
    exit;
}
@file_put_contents($cachePath, $json);
echo $json;
?>
