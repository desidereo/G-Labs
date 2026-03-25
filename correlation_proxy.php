<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=3600');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(30);

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_correlation.json';
$cacheTtl = 3600;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$useCurl = function_exists('curl_init');

function corrFetch($url) {
    global $useCurl;
    if ($useCurl) {
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
        if ($code >= 200 && $code < 300 && $body !== false && $body !== '') return $body;
        $useCurl = false;
    }
    $ctx = stream_context_create([
        'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $r = @file_get_contents($url, false, $ctx);
    return ($r !== false && $r !== '') ? $r : false;
}

$currencies = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
$endDate = date('Y-m-d');
$startDate = date('Y-m-d', strtotime('-35 days'));
$url = "https://api.frankfurter.app/{$startDate}..{$endDate}?from=USD&to=" . implode(',', $currencies);
$raw = corrFetch($url);

if ($raw === false) {
    echo json_encode(['status' => 'error', 'message' => 'fetch failed', 'pairs' => [], 'matrix' => []]);
    exit;
}
$data = json_decode($raw, true);
if (!isset($data['rates']) || !is_array($data['rates'])) {
    echo json_encode(['status' => 'error', 'message' => 'bad response', 'pairs' => [], 'matrix' => []]);
    exit;
}

$dates = array_keys($data['rates']);
sort($dates);

$pairNames = [];
foreach ($currencies as $cur) {
    $pairNames[] = ($cur === 'JPY') ? 'USD/JPY' : $cur . '/USD';
}

$pairReturns = [];
foreach ($pairNames as $idx => $pair) {
    $cur = $currencies[$idx];
    $prices = [];
    foreach ($dates as $d) {
        if (isset($data['rates'][$d][$cur])) {
            $prices[] = ($cur === 'JPY')
                ? floatval($data['rates'][$d][$cur])
                : 1.0 / floatval($data['rates'][$d][$cur]);
        }
    }
    $returns = [];
    for ($i = 1; $i < count($prices); $i++) {
        if ($prices[$i - 1] != 0) {
            $returns[] = ($prices[$i] - $prices[$i - 1]) / $prices[$i - 1];
        }
    }
    $pairReturns[$pair] = $returns;
}

function pearson($x, $y) {
    $n = min(count($x), count($y));
    if ($n < 5) return null;
    $x = array_slice($x, 0, $n);
    $y = array_slice($y, 0, $n);
    $mx = array_sum($x) / $n;
    $my = array_sum($y) / $n;
    $num = 0; $dx = 0; $dy = 0;
    for ($i = 0; $i < $n; $i++) {
        $a = $x[$i] - $mx;
        $b = $y[$i] - $my;
        $num += $a * $b;
        $dx += $a * $a;
        $dy += $b * $b;
    }
    $denom = sqrt($dx * $dy);
    return $denom > 0 ? round($num / $denom, 3) : 0;
}

$matrix = [];
foreach ($pairNames as $i => $p1) {
    $matrix[$p1] = [];
    foreach ($pairNames as $j => $p2) {
        if ($i === $j) {
            $matrix[$p1][$p2] = 1.0;
        } else {
            $r1 = isset($pairReturns[$p1]) ? $pairReturns[$p1] : [];
            $r2 = isset($pairReturns[$p2]) ? $pairReturns[$p2] : [];
            $matrix[$p1][$p2] = pearson($r1, $r2);
        }
    }
}

$out = json_encode([
    'status'    => 'ok',
    'period'    => '30d',
    'pairs'     => $pairNames,
    'matrix'    => $matrix,
    'updatedAt' => gmdate('c')
], JSON_UNESCAPED_SLASHES);

if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'matrix' => []]);
