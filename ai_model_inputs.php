<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function fetchJsonSafe($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 10,
            'header' => "User-Agent: G-Labs-AIInputs/1.0\r\n"
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

function stddev($arr) {
    $n = count($arr);
    if ($n < 2) return 0.0;
    $mean = array_sum($arr) / $n;
    $sumSq = 0.0;
    foreach ($arr as $x) {
        $d = $x - $mean;
        $sumSq += $d * $d;
    }
    return sqrt($sumSq / ($n - 1));
}

function scoreTextSentiment($text) {
    $t = strtolower($text);
    $score = 0;
    if (preg_match('/surge|gain|rally|bullish|cooling inflation|rate cut|easing|upbeat/', $t)) $score += 2;
    if (preg_match('/drop|fall|selloff|bearish|hot inflation|hawkish|war|shock|crisis|recession/', $t)) $score -= 2;
    if (preg_match('/volatile|uncertain|risk|warning/', $t)) $score -= 1;
    return $score;
}

$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'g_labs_ai_inputs.json';
if (file_exists($cachePath) && (time() - filemtime($cachePath) < 180)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$features = [
    'eurusd_spot' => null,
    'eurusd_1d_momentum_pct' => null,
    'eurusd_10d_volatility_pct' => null,
    'news_sentiment_score' => 0,
    'news_headline_count' => 0,
    'finnhub_headline_count' => 0
];

$sources = [];
$avKey = getenv('ALPHAVANTAGE_API_KEY');
if (!$avKey) $avKey = 'demo';
$avUrl = 'https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=EUR&to_symbol=USD&outputsize=compact&apikey=' . urlencode($avKey);
$avData = fetchJsonSafe($avUrl);
if ($avData && isset($avData['Time Series FX (Daily)']) && is_array($avData['Time Series FX (Daily)'])) {
    $series = array_values($avData['Time Series FX (Daily)']);
    $closes = [];
    foreach ($series as $row) {
        if (isset($row['4. close']) && is_numeric($row['4. close'])) $closes[] = floatval($row['4. close']);
        if (count($closes) >= 20) break;
    }
    if (count($closes) >= 2) {
        $latest = $closes[0];
        $prev = $closes[1];
        $features['eurusd_spot'] = $latest;
        $features['eurusd_1d_momentum_pct'] = $prev != 0 ? (($latest - $prev) / $prev) * 100 : 0;
        $returns = [];
        for ($i = 0; $i < min(10, count($closes) - 1); $i++) {
            $r0 = $closes[$i];
            $r1 = $closes[$i + 1];
            if ($r1 != 0) $returns[] = (($r0 - $r1) / $r1) * 100;
        }
        $features['eurusd_10d_volatility_pct'] = stddev($returns);
        $sources[] = 'alpha_vantage';
    }
}

$newsKey = getenv('NEWSDATA_API_KEY');
if ($newsKey) {
    $newsUrl = 'https://newsdata.io/api/1/news?apikey=' . urlencode($newsKey) . '&q=' . urlencode('forex OR currency OR central bank') . '&language=en&size=10';
    $newsData = fetchJsonSafe($newsUrl);
    if ($newsData && isset($newsData['results']) && is_array($newsData['results'])) {
        $count = 0;
        $sent = 0;
        foreach ($newsData['results'] as $item) {
            $title = $item['title'] ?? '';
            if ($title === '') continue;
            $count++;
            $sent += scoreTextSentiment($title);
        }
        $features['news_headline_count'] = $count;
        $features['news_sentiment_score'] = $sent;
        $sources[] = 'newsdata';
    }
}

$finnKey = getenv('FINNHUB_API_KEY');
if ($finnKey) {
    $finnUrl = 'https://finnhub.io/api/v1/news?category=forex&token=' . urlencode($finnKey);
    $finnData = fetchJsonSafe($finnUrl);
    if ($finnData && is_array($finnData)) {
        $features['finnhub_headline_count'] = count($finnData);
        $sources[] = 'finnhub';
    }
}

$finageKey = getenv('FINAGE_API_KEY');
$finageCalendarCount = null;
if ($finageKey) {
    $finageUrl = 'https://api.finage.co.uk/last/news/forex?apikey=' . urlencode($finageKey);
    $finageData = fetchJsonSafe($finageUrl);
    if ($finageData && isset($finageData['results']) && is_array($finageData['results'])) {
        $finageCalendarCount = count($finageData['results']);
        $sources[] = 'finage';
    }
}

$payload = [
    'status' => 'ok',
    'updatedAt' => gmdate('c'),
    'sources' => $sources,
    'features' => $features,
    'finage_proxy_count' => $finageCalendarCount
];

$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'features' => []
    ]);
    exit;
}

@file_put_contents($cachePath, $json);
echo $json;
?>
