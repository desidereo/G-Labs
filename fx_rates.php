<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$base = isset($_GET['base']) ? strtoupper(trim($_GET['base'])) : 'USD';
$symbolsRaw = isset($_GET['symbols']) ? strtoupper(trim($_GET['symbols'])) : 'EUR,GBP,JPY,CHF,CAD,AUD,NZD';
$base = preg_replace('/[^A-Z]/', '', $base);
$symbolsRaw = preg_replace('/[^A-Z,]/', '', $symbolsRaw);
$symbols = array_values(array_filter(array_unique(array_map('trim', explode(',', $symbolsRaw))), function ($s) {
    return strlen($s) === 3;
}));

if (strlen($base) !== 3) $base = 'USD';
if (!in_array($base, $symbols, true)) $symbols[] = $base;
if (count($symbols) > 12) $symbols = array_slice($symbols, 0, 12);

function fetchJson($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 8,
            'header' => "User-Agent: G-Labs-FXBot/1.0\r\n"
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

function normalizeFixerRates($fixerData, $requestedBase, $symbols) {
    if (!isset($fixerData['success']) || !$fixerData['success'] || !isset($fixerData['rates']) || !is_array($fixerData['rates'])) return null;

    $rates = $fixerData['rates'];
    $providerBase = 'EUR';
    if (!isset($rates[$requestedBase]) && $requestedBase !== $providerBase) return null;

    $normalized = [];
    if ($requestedBase === $providerBase) {
        foreach ($symbols as $s) {
            if ($s === $providerBase) $normalized[$s] = 1.0;
            elseif (isset($rates[$s])) $normalized[$s] = floatval($rates[$s]);
        }
    } else {
        $baseFactor = floatval($rates[$requestedBase]);
        if ($baseFactor <= 0) return null;
        foreach ($symbols as $s) {
            if ($s === $requestedBase) $normalized[$s] = 1.0;
            elseif (isset($rates[$s])) $normalized[$s] = floatval($rates[$s]) / $baseFactor;
        }
    }

    return [
        'provider' => 'fixer',
        'base' => $requestedBase,
        'timestamp' => isset($fixerData['timestamp']) ? intval($fixerData['timestamp']) : time(),
        'rates' => $normalized
    ];
}

function normalizeExchangeHostRates($data, $requestedBase, $symbols) {
    if (!isset($data['rates']) || !is_array($data['rates'])) return null;
    $rates = [];
    foreach ($symbols as $s) {
        if ($s === $requestedBase) $rates[$s] = 1.0;
        elseif (isset($data['rates'][$s])) $rates[$s] = floatval($data['rates'][$s]);
    }
    return [
        'provider' => 'exchangerate_host',
        'base' => $requestedBase,
        'timestamp' => isset($data['timestamp']) ? intval($data['timestamp']) : time(),
        'rates' => $rates
    ];
}

$cacheKey = 'g_labs_fx_' . $base . '_' . implode('', $symbols) . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 120;

if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$result = null;
$fixerKey = getenv('FIXER_API_KEY');
if ($fixerKey) {
    $fixerUrl = 'https://data.fixer.io/api/latest?access_key=' . urlencode($fixerKey) . '&symbols=' . urlencode(implode(',', array_unique(array_merge($symbols, [$base]))));
    $fixerData = fetchJson($fixerUrl);
    $result = normalizeFixerRates($fixerData, $base, $symbols);
}

if (!$result) {
    $fallbackUrl = 'https://api.exchangerate.host/latest?base=' . urlencode($base) . '&symbols=' . urlencode(implode(',', $symbols));
    $fallbackData = fetchJson($fallbackUrl);
    $result = normalizeExchangeHostRates($fallbackData, $base, $symbols);
}

if (!$result || !isset($result['rates']) || !count($result['rates'])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Unable to load forex rates',
        'base' => $base,
        'updatedAt' => gmdate('c'),
        'rates' => []
    ]);
    exit;
}

$payload = [
    'status' => 'ok',
    'provider' => $result['provider'],
    'base' => $result['base'],
    'updatedAt' => gmdate('c', $result['timestamp']),
    'rates' => $result['rates']
];

$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'base' => $base,
        'rates' => []
    ]);
    exit;
}

@file_put_contents($cachePath, $json);
echo $json;
?>
