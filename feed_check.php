<?php
/**
 * Feed diagnostic for G-Labs Intel.
 * Upload with your other PHP files, then open in browser: https://yoursite.com/feed_check.php
 * Shows why feeds might be broken on cPanel.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$out = [
    'ok' => true,
    'php_version' => PHP_VERSION,
    'checks' => [],
    'tips' => []
];

// 1. Can PHP fetch external URLs?
$allowFopen = ini_get('allow_url_fopen');
$out['checks']['allow_url_fopen'] = $allowFopen;
if (!$allowFopen) {
    $out['ok'] = false;
    $out['tips'][] = 'allow_url_fopen is OFF. GDELT, RSS, and other feeds need it. Ask host to enable it or use cPanel PHP options.';
}

// 2. Try GDELT API
$gdeltUrl = 'https://api.gdeltproject.org/api/v1/gkg_geojson?QUERY=oil&TIMESPAN=60&MAXROWS=5';
$ctx = stream_context_create(['http' => ['timeout' => 15, 'header' => "User-Agent: G-Labs-Check/1.0\r\n"], 'ssl' => ['verify_peer' => true]]);
$raw = @file_get_contents($gdeltUrl, false, $ctx);
if ($raw === false) {
    $out['checks']['gdelt'] = 'FAIL: could not fetch (allow_url_fopen or network blocked?)';
    $out['ok'] = false;
    $out['tips'][] = 'Server cannot reach api.gdeltproject.org. Check firewall / outbound HTTP.';
} else {
    $j = json_decode($raw, true);
    $count = isset($j['features']) && is_array($j['features']) ? count($j['features']) : 0;
    $out['checks']['gdelt'] = $count ? "OK ($count events)" : 'OK but 0 events (API may be rate-limited or changed)';
}

// 3. Try one RSS feed
$rssUrl = 'https://feeds.reuters.com/reuters/topNews';
$raw2 = @file_get_contents($rssUrl, false, $ctx);
if ($raw2 === false || strlen($raw2) < 200) {
    $out['checks']['rss'] = 'FAIL: could not fetch Reuters RSS';
    $out['ok'] = false;
    $out['tips'][] = 'Server cannot fetch RSS. Check allow_url_fopen and that outbound HTTP is allowed.';
} else {
    $out['checks']['rss'] = 'OK (' . strlen($raw2) . ' bytes)';
}

// 4. Same folder as this script (for relative fetch)
$out['checks']['document_root'] = isset($_SERVER['DOCUMENT_ROOT']) ? $_SERVER['DOCUMENT_ROOT'] : 'unknown';
$out['checks']['script_path'] = __FILE__;

// 5. List PHP files in same directory (so user can confirm they uploaded)
$dir = dirname(__FILE__);
$files = @scandir($dir) ?: [];
$phpFiles = array_filter($files, function ($f) { return strtolower(substr($f, -4)) === '.php'; });
$out['checks']['php_files_here'] = array_values($phpFiles);

if ($out['ok']) {
    $out['tips'][] = 'Server can reach GDELT and RSS. If feeds still broken in the dashboard, open the page from the same URL (e.g. https://yoursite.com/global_intel.html) so fetch() uses the same path for .php files.';
} else {
    $out['tips'][] = 'Fix the issues above, then reload the dashboard.';
}

echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
