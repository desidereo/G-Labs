<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');

$cacheKey = 'g_labs_world_news.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$feeds = [
    'Reuters'     => 'https://feeds.reuters.com/reuters/topNews',
    'BBC'         => 'http://feeds.bbci.co.uk/news/world/rss.xml',
    'AP'          => 'https://feeds.ap.org/rss/TopNews',
    'Al Jazeera'  => 'https://www.aljazeera.com/xml/rss/all.xml',
    'NPR'         => 'https://feeds.npr.org/1001/rss.xml',
    'DW'          => 'https://rss.dw.com/xml/rss-en-world',
    'CNBC'        => 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    'Bloomberg'   => 'https://feeds.bloomberg.com/markets/news.rss',
];

$items = [];
$ctx = stream_context_create([
    'http' => [
        'timeout' => 8,
        'header' => "User-Agent: G-Labs-WorldNews/1.0\r\nAccept: application/rss+xml, application/xml, text/xml\r\n",
        'ignore_errors' => true
    ],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);

foreach ($feeds as $source => $url) {
    $xml = @file_get_contents($url, false, $ctx);
    if ($xml === false || strlen($xml) < 100) continue;

    libxml_use_internal_errors(true);
    $doc = @simplexml_load_string($xml);
    if (!$doc) continue;

    // RSS 2.0: <rss><channel><item>
    if (isset($doc->channel->item)) {
        foreach ($doc->channel->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        continue;
    }

    // Atom: <feed><entry>
    if (isset($doc->entry)) {
        foreach ($doc->entry as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = '';
            if (isset($e->link)) {
                foreach ($e->link as $lnk) {
                    $rel = (string)($lnk['rel'] ?? 'alternate');
                    if ($rel === 'alternate' || $rel === '') {
                        $link = (string)($lnk['href'] ?? '');
                        break;
                    }
                }
                if ($link === '' && isset($e->link[0])) {
                    $link = (string)($e->link[0]['href'] ?? (string)$e->link[0]);
                }
            }
            $date = trim((string)($e->published ?? $e->updated ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        continue;
    }

    // RSS 1.0 / RDF: <rdf:RDF><item>
    if (isset($doc->item)) {
        foreach ($doc->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? $e->date ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'publishedAt' => $date, 'timestamp' => $ts];
        }
    }
}

usort($items, function ($a, $b) { return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0); });

// Deduplicate by normalised title
$seen = [];
$unique = [];
foreach ($items as $item) {
    $key = strtolower(preg_replace('/[^a-z0-9]/', '', $item['title']));
    if (isset($seen[$key])) continue;
    $seen[$key] = true;
    $unique[] = $item;
    if (count($unique) >= 50) break;
}

$out = ['status' => 'ok', 'count' => count($unique), 'items' => $unique, 'updatedAt' => gmdate('c')];
$json = json_encode($out, JSON_UNESCAPED_SLASHES);
if ($json) @file_put_contents($cachePath, $json);
echo $json ?: json_encode(['status' => 'error', 'items' => []]);
