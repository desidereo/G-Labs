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

function corrFetch($url, $timeout = 10) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) G-Labs/1.0',
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code >= 200 && $code < 300 && $body !== false && $body !== '') return $body;
    }
    $ctx = stream_context_create([
        'http' => ['timeout' => $timeout, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $r = @file_get_contents($url, false, $ctx);
    return ($r !== false && $r !== '') ? $r : false;
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

$currencies = ['EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
$allDates = null;
$provider = 'none';

// --- Provider 1: Frankfurter (generous timeout for 35-day range) ---
$endDate = date('Y-m-d');
$startDate = date('Y-m-d', strtotime('-35 days'));
$raw = corrFetch("https://api.frankfurter.app/{$startDate}..{$endDate}?from=USD&to=" . implode(',', $currencies), 15);
if ($raw !== false) {
    $data = json_decode($raw, true);
    if (isset($data['rates']) && is_array($data['rates']) && count($data['rates']) >= 5) {
        $allDates = $data['rates'];
        $provider = 'frankfurter';
    }
}

// --- Provider 2: ECB 90-day XML ---
if (!$allDates) {
    $ecbXml = corrFetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml', 10);
    if ($ecbXml !== false) {
        libxml_use_internal_errors(true);
        $doc = @simplexml_load_string($ecbXml);
        if ($doc) {
            $parsed = [];
            foreach ($doc->Cube->Cube as $dayCube) {
                $date = (string)$dayCube['time'];
                if (!$date) continue;
                $dayRates = [];
                $usdVal = 0;
                foreach ($dayCube->Cube as $c) {
                    $cur = (string)$c['currency'];
                    $rate = (float)$c['rate'];
                    if ($cur === 'USD') $usdVal = $rate;
                    if (in_array($cur, $currencies)) $dayRates[$cur] = $rate;
                }
                if ($usdVal > 0 && count($dayRates) > 0) {
                    $usdBased = [];
                    foreach ($dayRates as $cur => $eurRate) {
                        $usdBased[$cur] = $eurRate / $usdVal;
                    }
                    $usdBased['EUR'] = 1.0 / $usdVal;
                    $parsed[$date] = $usdBased;
                }
            }
            if (count($parsed) >= 5) { $allDates = $parsed; $provider = 'ecb'; }
        }
    }
}

if (!$allDates || count($allDates) < 5) {
    echo json_encode(['status' => 'error', 'message' => 'no data from any provider', 'pairs' => [], 'matrix' => []]);
    exit;
}

ksort($allDates);
$dates = array_keys($allDates);

$pairNames = [];
foreach ($currencies as $cur) {
    $pairNames[] = ($cur === 'JPY') ? 'USD/JPY' : $cur . '/USD';
}

$pairReturns = [];
foreach ($pairNames as $idx => $pair) {
    $cur = $currencies[$idx];
    $prices = [];
    foreach ($dates as $d) {
        if (isset($allDates[$d][$cur])) {
            $prices[] = ($cur === 'JPY')
                ? floatval($allDates[$d][$cur])
                : 1.0 / floatval($allDates[$d][$cur]);
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
    'provider'  => $provider,
    'dateCount' => count($dates),
    'period'    => '30d',
    'pairs'     => $pairNames,
    'matrix'    => $matrix,
    'updatedAt' => gmdate('c')
], JSON_UNESCAPED_SLASHES);

if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'matrix' => []]);
