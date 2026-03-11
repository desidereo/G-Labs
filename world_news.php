<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

$cacheKey = 'g_labs_world_news.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 300; // 5 min
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$feeds = [
    'Reuters' => 'https://feeds.reuters.com/reuters/topNews',
    'BBC' => 'http://feeds.bbci.co.uk/news/world/rss.xml',
    'AP' => 'https://feeds.ap.org/rss/TopNews',
    'Al Jazeera' => 'https://www.aljazeera.com/xml/rss/all.xml',
    'NPR' => 'https://feeds.npr.org/1001/rss.xml',
    'DW' => 'https://rss.dw.com/xml/rss-en-world',
];

$items = [];
$ctx = stream_context_create([
    'http' => [
        'timeout' => 8,
        'header' => "User-Agent: G-Labs-WorldNews/1.0\r\n"
    ]
]);

foreach ($feeds as $source => $url) {
    $xml = @file_get_contents($url, false, $ctx);
    if ($xml === false) continue;
    libxml_use_internal_errors(true);
    $doc = @simplexml_load_string($xml);
    if (!$doc) continue;
    $channel = $doc->channel ?? $doc;
    $entries = $channel->item ?? $channel->entry ?? [];
    foreach ($entries as $e) {
        $title = trim((string)($e->title ?? ''));
        if ($title === '') continue;
        $link = trim((string)($e->link ?? $e->link['href'] ?? ''));
        $date = trim((string)($e->pubDate ?? $e->published ?? ''));
        $ts = $date ? @strtotime($date) : time();
        $items[] = [
            'title' => $title,
            'url' => $link,
            'source' => $source,
            'publishedAt' => $date,
            'timestamp' => $ts
        ];
    }
}

usort($items, function ($a, $b) { return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0); });
$items = array_slice($items, 0, 50);
$out = ['status' => 'ok', 'items' => $items, 'updatedAt' => gmdate('c')];
$json = json_encode($out);
if ($json) @file_put_contents($cachePath, $json);
echo $json ?: json_encode(['status' => 'error', 'items' => []]);
