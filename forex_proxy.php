<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(30);

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_forex.json';
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

function glFetch($url, $timeout = 10) {
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

function parseEcb90d($xml) {
    libxml_use_internal_errors(true);
    $doc = @simplexml_load_string($xml);
    if (!$doc) return false;
    $ns = $doc->getNamespaces(true);
    $cubeRoot = $doc->Cube->Cube ?? null;
    if (!$cubeRoot) return false;

    $allDates = [];
    foreach ($doc->Cube->Cube as $dayCube) {
        $date = (string)$dayCube['time'];
        if (!$date) continue;
        $rates = [];
        foreach ($dayCube->Cube as $c) {
            $cur = (string)$c['currency'];
            $rate = (float)$c['rate'];
            if ($cur && $rate > 0) $rates[$cur] = $rate;
        }
        if (count($rates) > 0) $allDates[$date] = $rates;
    }
    return count($allDates) > 0 ? $allDates : false;
}

function buildFromDateMap($allDates) {
    ksort($allDates);
    $dates = array_keys($allDates);
    $latestDate = end($dates);
    $prevDate = count($dates) >= 2 ? $dates[count($dates) - 2] : null;
    $latest = $allDates[$latestDate];
    $prev = $prevDate ? $allDates[$prevDate] : null;

    if (!isset($latest['USD']) || $latest['USD'] <= 0) return false;
    $usdRate = $latest['USD'];
    $prevUsd = ($prev && isset($prev['USD'])) ? $prev['USD'] : null;

    $pairDefs = [
        ['pair' => 'EUR/USD', 'cur' => 'EUR', 'invert' => true],
        ['pair' => 'GBP/USD', 'cur' => 'GBP', 'invert' => true],
        ['pair' => 'USD/JPY', 'cur' => 'JPY', 'invert' => false],
        ['pair' => 'USD/CHF', 'cur' => 'CHF', 'invert' => false],
        ['pair' => 'USD/CAD', 'cur' => 'CAD', 'invert' => false],
        ['pair' => 'AUD/USD', 'cur' => 'AUD', 'invert' => true],
        ['pair' => 'NZD/USD', 'cur' => 'NZD', 'invert' => true],
    ];

    $pairs = [];
    foreach ($pairDefs as $def) {
        $cur = $def['cur'];
        if ($cur === 'EUR') {
            $rate = round($usdRate, 5);
            $change = null;
            if ($prevUsd) {
                $prevR = $prevUsd;
                if ($prevR > 0) $change = round(($rate - $prevR) / $prevR * 100, 3);
            }
            if ($def['invert']) $rate = round(1 / $rate, 5);
        } else {
            if (!isset($latest[$cur])) continue;
            $rateVsEur = $latest[$cur];
            $rateVsUsd = $rateVsEur / $usdRate;
            if ($def['invert']) {
                $rate = round(1 / $rateVsUsd, 5);
            } else {
                $rate = round($rateVsUsd, $cur === 'JPY' ? 3 : 5);
            }
            $change = null;
            if ($prev && $prevUsd && isset($prev[$cur])) {
                $prevRateVsUsd = $prev[$cur] / $prevUsd;
                $prevRate = $def['invert'] ? (1 / $prevRateVsUsd) : $prevRateVsUsd;
                if ($prevRate > 0) $change = round(($rate - $prevRate) / $prevRate * 100, 3);
            }
        }
        $pairs[] = ['pair' => $def['pair'], 'rate' => $rate, 'change' => $change];
    }
    return ['pairs' => $pairs, 'dates' => ['latest' => $latestDate, 'previous' => $prevDate]];
}

$result = null;

// --- Provider 1: Frankfurter range (fast timeout) ---
$curs = 'EUR,GBP,JPY,CHF,CAD,AUD,NZD';
$endDate = date('Y-m-d');
$startDate = date('Y-m-d', strtotime('-7 days'));
$raw = glFetch("https://api.frankfurter.app/{$startDate}..{$endDate}?from=USD&to={$curs}", 12);
if ($raw !== false) {
    $data = json_decode($raw, true);
    if (isset($data['rates']) && is_array($data['rates']) && count($data['rates']) >= 1) {
        $allDates = [];
        foreach ($data['rates'] as $date => $rates) {
            $usdRates = [];
            foreach ($rates as $c => $v) $usdRates[$c] = $v;
            $allDates[$date] = $usdRates;
        }
        ksort($allDates);
        $dates = array_keys($allDates);
        $latestDate = end($dates);
        $prevDate = count($dates) >= 2 ? $dates[count($dates) - 2] : null;
        $latestRates = $allDates[$latestDate];
        $prevRates = $prevDate ? $allDates[$prevDate] : null;

        $pairDefs = [
            ['pair' => 'EUR/USD', 'cur' => 'EUR', 'invert' => true],
            ['pair' => 'GBP/USD', 'cur' => 'GBP', 'invert' => true],
            ['pair' => 'USD/JPY', 'cur' => 'JPY', 'invert' => false],
            ['pair' => 'USD/CHF', 'cur' => 'CHF', 'invert' => false],
            ['pair' => 'USD/CAD', 'cur' => 'CAD', 'invert' => false],
            ['pair' => 'AUD/USD', 'cur' => 'AUD', 'invert' => true],
            ['pair' => 'NZD/USD', 'cur' => 'NZD', 'invert' => true],
        ];
        $pairs = [];
        foreach ($pairDefs as $def) {
            $cur = $def['cur'];
            if (!isset($latestRates[$cur])) continue;
            $rate = $def['invert'] ? round(1 / $latestRates[$cur], 5) : round($latestRates[$cur], $cur === 'JPY' ? 3 : 5);
            $change = null;
            if ($prevRates && isset($prevRates[$cur])) {
                $prevRate = $def['invert'] ? (1 / $prevRates[$cur]) : $prevRates[$cur];
                if ($prevRate > 0) $change = round(($rate - $prevRate) / $prevRate * 100, 3);
            }
            $pairs[] = ['pair' => $def['pair'], 'rate' => $rate, 'change' => $change];
        }
        if (count($pairs)) $result = ['pairs' => $pairs, 'provider' => 'frankfurter', 'dates' => ['latest' => $latestDate, 'previous' => $prevDate]];
    }
}

// --- Provider 2: ECB 90-day XML (Frankfurter's actual data source) ---
if (!$result) {
    $ecbXml = glFetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml', 10);
    if ($ecbXml !== false) {
        $allDates = parseEcb90d($ecbXml);
        if ($allDates) {
            $built = buildFromDateMap($allDates);
            if ($built && count($built['pairs'])) {
                $result = ['pairs' => $built['pairs'], 'provider' => 'ecb', 'dates' => $built['dates']];
            }
        }
    }
}

// --- Provider 3: exchangerate-api.com (latest only, no change data) ---
if (!$result) {
    $erRaw = glFetch('https://open.er-api.com/v6/latest/USD', 8);
    if ($erRaw !== false) {
        $erData = json_decode($erRaw, true);
        if (isset($erData['rates'])) {
            $r = $erData['rates'];
            $pairs = [];
            if (isset($r['EUR'])) $pairs[] = ['pair' => 'EUR/USD', 'rate' => round(1 / $r['EUR'], 5), 'change' => null];
            if (isset($r['GBP'])) $pairs[] = ['pair' => 'GBP/USD', 'rate' => round(1 / $r['GBP'], 5), 'change' => null];
            if (isset($r['JPY'])) $pairs[] = ['pair' => 'USD/JPY', 'rate' => round($r['JPY'], 3),       'change' => null];
            if (isset($r['CHF'])) $pairs[] = ['pair' => 'USD/CHF', 'rate' => round($r['CHF'], 5),       'change' => null];
            if (isset($r['CAD'])) $pairs[] = ['pair' => 'USD/CAD', 'rate' => round($r['CAD'], 5),       'change' => null];
            if (isset($r['AUD'])) $pairs[] = ['pair' => 'AUD/USD', 'rate' => round(1 / $r['AUD'], 5), 'change' => null];
            if (isset($r['NZD'])) $pairs[] = ['pair' => 'NZD/USD', 'rate' => round(1 / $r['NZD'], 5), 'change' => null];
            if (count($pairs)) $result = ['pairs' => $pairs, 'provider' => 'exchangerate-api', 'dates' => null];
        }
    }
}

if (!$result) {
    echo json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
    exit;
}

$pairs = $result['pairs'];

// Calculate strength from changes
$curScores = ['USD' => [], 'EUR' => [], 'GBP' => [], 'JPY' => [], 'CHF' => [], 'CAD' => [], 'AUD' => [], 'NZD' => []];
foreach ($pairs as $p) {
    if ($p['change'] === null) continue;
    $parts = explode('/', $p['pair']);
    $curScores[$parts[0]][] = $p['change'];
    $curScores[$parts[1]][] = -$p['change'];
}

$raw_scores = [];
$hasChange = false;
foreach ($curScores as $cur => $moves) {
    $raw_scores[$cur] = count($moves) ? array_sum($moves) / count($moves) : 0;
    if (count($moves) > 0) $hasChange = true;
}

$strength = [];
if ($hasChange) {
    $minS = min($raw_scores); $maxS = max($raw_scores); $rangeS = $maxS - $minS;
    if ($rangeS > 0) {
        foreach ($raw_scores as $cur => $v) {
            $strength[$cur] = round(($v - $minS) / $rangeS * 100, 1);
        }
    } else {
        foreach ($raw_scores as $cur => $v) {
            $strength[$cur] = 50 + round($v * 10, 1);
        }
    }
} else {
    foreach ($raw_scores as $cur => $v) {
        $strength[$cur] = null;
    }
}

$out = json_encode([
    'status' => 'ok',
    'pairs' => $pairs,
    'strength' => $strength,
    'provider' => $result['provider'] ?? 'unknown',
    'dates' => $result['dates'] ?? null,
    'updatedAt' => gmdate('c')
]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
