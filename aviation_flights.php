<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 70;
$limit = max(10, min($limit, 100));
$region = isset($_GET['region']) ? strtolower(trim($_GET['region'])) : 'eu';
$region = preg_replace('/[^a-z]/', '', $region);

function fetchJsonFromUrl($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: G-Labs-AviationBot/1.0\r\n"
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

function regionBounds($region) {
    if ($region === 'me') return ['lamin' => 12, 'lomin' => 30, 'lamax' => 42, 'lomax' => 62];
    if ($region === 'global') return ['lamin' => -60, 'lomin' => -170, 'lamax' => 80, 'lomax' => 170];
    return ['lamin' => 35, 'lomin' => -10, 'lamax' => 60, 'lomax' => 30];
}

function normalizeAviationstack($data, $limit) {
    if (!isset($data['data']) || !is_array($data['data'])) return [];
    $rows = [];
    foreach ($data['data'] as $f) {
        if (!isset($f['live']) || !is_array($f['live'])) continue;
        $lat = isset($f['live']['latitude']) ? floatval($f['live']['latitude']) : null;
        $lon = isset($f['live']['longitude']) ? floatval($f['live']['longitude']) : null;
        if (!is_finite($lat) || !is_finite($lon)) continue;
        $callsign = isset($f['flight']['iata']) && $f['flight']['iata'] ? $f['flight']['iata'] : (isset($f['flight']['icao']) ? $f['flight']['icao'] : 'UNK');
        $dep = isset($f['departure']['iata']) && $f['departure']['iata'] ? $f['departure']['iata'] : 'UNK';
        $arr = isset($f['arrival']['iata']) && $f['arrival']['iata'] ? $f['arrival']['iata'] : 'UNK';
        $alt = isset($f['live']['altitude']) ? intval($f['live']['altitude']) : null;
        $rows[] = [
            'callsign' => trim($callsign),
            'lat' => $lat,
            'lon' => $lon,
            'origin' => $dep . '→' . $arr,
            'altitude' => $alt,
            'provider' => 'aviationstack'
        ];
        if (count($rows) >= $limit) break;
    }
    return $rows;
}

function normalizeOpenSky($data, $limit) {
    if (!isset($data['states']) || !is_array($data['states'])) return [];
    $rows = [];
    foreach ($data['states'] as $state) {
        if (!isset($state[5], $state[6])) continue;
        $lon = $state[5];
        $lat = $state[6];
        if (!is_numeric($lat) || !is_numeric($lon)) continue;
        $rows[] = [
            'callsign' => trim($state[1] ?? 'UNK'),
            'lat' => floatval($lat),
            'lon' => floatval($lon),
            'origin' => $state[2] ?? 'Unknown',
            'altitude' => isset($state[7]) && is_numeric($state[7]) ? intval($state[7]) : null,
            'provider' => 'opensky'
        ];
        if (count($rows) >= $limit) break;
    }
    return $rows;
}

$cacheKey = 'g_labs_aviation_' . $region . '_' . $limit . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 90;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$flights = [];
$provider = '';
$aviationKey = getenv('AVIATIONSTACK_API_KEY');
if ($aviationKey) {
    $aviationUrl = 'http://api.aviationstack.com/v1/flights?access_key=' . urlencode($aviationKey) . '&flight_status=active&limit=' . intval($limit);
    $aviationData = fetchJsonFromUrl($aviationUrl);
    $flights = normalizeAviationstack($aviationData, $limit);
    if (count($flights)) $provider = 'aviationstack';
}

if (!count($flights)) {
    $b = regionBounds($region);
    $openSkyUrl = 'https://opensky-network.org/api/states/all?lamin=' . $b['lamin'] . '&lomin=' . $b['lomin'] . '&lamax=' . $b['lamax'] . '&lomax=' . $b['lomax'];
    $openSkyData = fetchJsonFromUrl($openSkyUrl);
    $flights = normalizeOpenSky($openSkyData, $limit);
    if (count($flights)) $provider = 'opensky';
}

if (!count($flights)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'No flight stream available',
        'provider' => 'none',
        'updatedAt' => gmdate('c'),
        'flights' => []
    ]);
    exit;
}

$payload = [
    'status' => 'ok',
    'provider' => $provider,
    'updatedAt' => gmdate('c'),
    'count' => count($flights),
    'flights' => $flights
];
$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'provider' => 'none',
        'flights' => []
    ]);
    exit;
}
@file_put_contents($cachePath, $json);
echo $json;
?>
