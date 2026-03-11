<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('Access-Control-Allow-Origin: *');

$cacheKey = 'g_labs_fear_greed.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 3600; // 1 hour
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$url = 'https://api.alternative.me/fng/?limit=1';
$ctx = stream_context_create([
    'http' => [
        'method' => 'GET',
        'timeout' => 10,
        'header' => "User-Agent: G-Labs-Intel/1.0\r\n"
    ]
]);
$raw = @file_get_contents($url, false, $ctx);
$out = ['status' => 'error', 'value' => null, 'classification' => null, 'updatedAt' => gmdate('c')];
if ($raw !== false) {
    $json = json_decode($raw, true);
    if (!empty($json['data'][0])) {
        $d = $json['data'][0];
        $out = [
            'status' => 'ok',
            'value' => isset($d['value']) ? intval($d['value']) : null,
            'classification' => $d['value_classification'] ?? null,
            'updatedAt' => gmdate('c')
        ];
        @file_put_contents($cachePath, json_encode($out));
    }
}
echo json_encode($out);
