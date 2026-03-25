<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_fear_greed.json';
$cacheTtl = 3600;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$url = 'https://api.alternative.me/fng/?limit=1';
$raw = false;

if (function_exists('curl_init')) {
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
    if ($code >= 200 && $code < 300 && $body) $raw = $body;
}

if ($raw === false) {
    $ctx = stream_context_create([
        'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $raw = @file_get_contents($url, false, $ctx);
}

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
