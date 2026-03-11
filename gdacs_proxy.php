<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=600');
header('Access-Control-Allow-Origin: *');

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_gdacs.json';
$cacheTtl = 600;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$url = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH';
$ctx = stream_context_create([
    'http' => ['timeout' => 15, 'header' => "User-Agent: G-Labs-Intel/1.0\r\nAccept: application/json\r\n"],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
    echo json_encode(['status' => 'error', 'events' => []]);
    exit;
}

$data = json_decode($raw, true);
$events = [];

if (isset($data['features']) && is_array($data['features'])) {
    foreach (array_slice($data['features'], 0, 40) as $f) {
        $coords = $f['geometry']['coordinates'] ?? null;
        if (!$coords || count($coords) < 2) continue;
        $p = $f['properties'] ?? [];
        $events[] = [
            'lat' => floatval($coords[1]),
            'lng' => floatval($coords[0]),
            'name' => $p['name'] ?? ($p['eventname'] ?? 'Event'),
            'type' => $p['eventtype'] ?? '',
            'alertlevel' => $p['alertlevel'] ?? 'green',
            'severity' => $p['severitydata']['severity'] ?? '',
            'date' => $p['fromdate'] ?? ''
        ];
    }
}

if (empty($events) && isset($data['results']) && is_array($data['results'])) {
    foreach (array_slice($data['results'], 0, 40) as $r) {
        if (!isset($r['latitude'], $r['longitude'])) continue;
        $events[] = [
            'lat' => floatval($r['latitude']),
            'lng' => floatval($r['longitude']),
            'name' => $r['eventname'] ?? 'Event',
            'type' => $r['eventtype'] ?? '',
            'alertlevel' => $r['alertlevel'] ?? 'green',
            'severity' => $r['severity'] ?? '',
            'date' => $r['fromdate'] ?? ''
        ];
    }
}

$out = json_encode(['status' => 'ok', 'count' => count($events), 'events' => $events, 'updatedAt' => gmdate('c')]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'events' => []]);
