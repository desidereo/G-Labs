<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$query = isset($_GET['query']) ? trim($_GET['query']) : 'forex OR oil OR shipping OR sanctions OR conflict';
$timespan = isset($_GET['timespan']) ? intval($_GET['timespan']) : 120;
$timespan = max(15, min($timespan, 720));
$maxRows = isset($_GET['limit']) ? intval($_GET['limit']) : 60;
$maxRows = max(10, min($maxRows, 120));

function fetchJsonPayload($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: G-Labs-GDELTBot/1.0\r\n"
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

$cacheKey = 'g_labs_gdelt_' . md5($query . '_' . $timespan . '_' . $maxRows) . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 120;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$url = 'https://api.gdeltproject.org/api/v1/gkg_geojson?QUERY=' . urlencode($query) . '&TIMESPAN=' . urlencode(strval($timespan)) . '&MAXROWS=' . urlencode(strval($maxRows));
$data = fetchJsonPayload($url);
$events = [];
if ($data && isset($data['features']) && is_array($data['features'])) {
    foreach ($data['features'] as $f) {
        if (!isset($f['geometry']['coordinates']) || !is_array($f['geometry']['coordinates'])) continue;
        $coords = $f['geometry']['coordinates'];
        if (count($coords) < 2 || !is_numeric($coords[0]) || !is_numeric($coords[1])) continue;
        $prop = isset($f['properties']) && is_array($f['properties']) ? $f['properties'] : [];
        $name = $prop['name'] ?? ($prop['location'] ?? 'Location');
        $title = $prop['title'] ?? ($prop['allnames'] ?? 'GDELT Event');
        $urlRef = $prop['url'] ?? '';
        $eventDate = $prop['date'] ?? ($prop['seendate'] ?? ($prop['datetime'] ?? gmdate('c')));
        $events[] = [
            'lat' => floatval($coords[1]),
            'lng' => floatval($coords[0]),
            'name' => strval($name),
            'title' => strval($title),
            'url' => strval($urlRef),
            'source' => 'gdelt',
            'updatedAt' => gmdate('c'),
            'date' => strval($eventDate)
        ];
    }
}

if (!count($events)) {
    echo json_encode([
        'status' => 'error',
        'message' => 'No GDELT events available',
        'query' => $query,
        'updatedAt' => gmdate('c'),
        'events' => []
    ]);
    exit;
}

$payload = [
    'status' => 'ok',
    'query' => $query,
    'updatedAt' => gmdate('c'),
    'count' => count($events),
    'events' => $events
];
$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'events' => []
    ]);
    exit;
}
@file_put_contents($cachePath, $json);
echo $json;
?>
