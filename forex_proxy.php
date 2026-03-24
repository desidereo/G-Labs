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

$useCurl = function_exists('curl_init');

function glFetch($url) {
    global $useCurl;
    if ($useCurl) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
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
        'http' => ['timeout' => 8, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $r = @file_get_contents($url, false, $ctx);
    return ($r !== false && $r !== '') ? $r : false;
}

$curs = 'EUR,GBP,JPY,CHF,CAD,AUD,NZD';

$raw = glFetch("https://api.frankfurter.app/latest?from=USD&to={$curs}");
if ($raw === false) {
    echo json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
    exit;
}
$data = json_decode($raw, true);
$rates = (isset($data['rates']) && is_array($data['rates'])) ? $data['rates'] : [];

if (!$rates) {
    echo json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
    exit;
}

$pairs = [];
if (isset($rates['EUR'])) $pairs[] = ['pair' => 'EUR/USD', 'rate' => round(1 / $rates['EUR'], 5), 'change' => null];
if (isset($rates['GBP'])) $pairs[] = ['pair' => 'GBP/USD', 'rate' => round(1 / $rates['GBP'], 5), 'change' => null];
if (isset($rates['JPY'])) $pairs[] = ['pair' => 'USD/JPY', 'rate' => round($rates['JPY'], 3),       'change' => null];
if (isset($rates['CHF'])) $pairs[] = ['pair' => 'USD/CHF', 'rate' => round($rates['CHF'], 5),       'change' => null];
if (isset($rates['CAD'])) $pairs[] = ['pair' => 'USD/CAD', 'rate' => round($rates['CAD'], 5),       'change' => null];
if (isset($rates['AUD'])) $pairs[] = ['pair' => 'AUD/USD', 'rate' => round(1 / $rates['AUD'], 5), 'change' => null];
if (isset($rates['NZD'])) $pairs[] = ['pair' => 'NZD/USD', 'rate' => round(1 / $rates['NZD'], 5), 'change' => null];

$todayDate = isset($data['date']) ? $data['date'] : date('Y-m-d');
$dow = date('N', strtotime($todayDate));
$skipDays = ($dow == 1) ? 3 : (($dow <= 2) ? 2 : 1);

$prevDate = date('Y-m-d', strtotime("-{$skipDays} day", strtotime($todayDate)));
$prevRaw = glFetch("https://api.frankfurter.app/{$prevDate}?from=USD&to={$curs}");
$pr = null;
if ($prevRaw !== false) {
    $prevData = json_decode($prevRaw, true);
    if (isset($prevData['rates']) && is_array($prevData['rates'])) {
        $returnedDate = isset($prevData['date']) ? $prevData['date'] : '';
        if ($returnedDate !== $todayDate) {
            $pr = $prevData['rates'];
        }
    }
}

if ($pr) {
    foreach ($pairs as &$p) {
        $sym = $p['pair'];
        if ($sym === 'EUR/USD' && isset($pr['EUR'])) { $prev = 1 / $pr['EUR']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'GBP/USD' && isset($pr['GBP'])) { $prev = 1 / $pr['GBP']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'USD/JPY' && isset($pr['JPY'])) { $prev = $pr['JPY']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'USD/CHF' && isset($pr['CHF'])) { $prev = $pr['CHF']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'USD/CAD' && isset($pr['CAD'])) { $prev = $pr['CAD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'AUD/USD' && isset($pr['AUD'])) { $prev = 1 / $pr['AUD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
        elseif ($sym === 'NZD/USD' && isset($pr['NZD'])) { $prev = 1 / $pr['NZD']; $p['change'] = round(($p['rate'] - $prev) / $prev * 100, 3); }
    }
    unset($p);
}

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

$out = json_encode(['status' => 'ok', 'pairs' => $pairs, 'strength' => $strength, 'updatedAt' => gmdate('c')]);
if ($out) @file_put_contents($cachePath, $out);
echo $out ?: json_encode(['status' => 'error', 'pairs' => [], 'strength' => []]);
