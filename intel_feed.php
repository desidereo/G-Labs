<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$topic = isset($_GET['topic']) ? strtolower(trim($_GET['topic'])) : 'geopol';
$topic = preg_replace('/[^a-z0-9_\-]/', '', $topic);
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 8;
$limit = max(1, min($limit, 25));

$topicSources = [
    'geopol' => [
        'https://feeds.reuters.com/reuters/worldNews',
        'http://feeds.bbci.co.uk/news/world/rss.xml',
        'https://www.aljazeera.com/xml/rss/all.xml'
    ],
    'energy' => [
        'https://www.eia.gov/rss/todayinenergy.xml',
        'https://news.google.com/rss/search?q=oil+gas+opec&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'shipping' => [
        'https://www.maritime-executive.com/rss',
        'https://www.porttechnology.org/feed/',
        'https://news.google.com/rss/search?q=red+sea+shipping+disruption&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'cyber' => [
        'https://feeds.feedburner.com/TheHackersNews',
        'https://www.bleepingcomputer.com/feed/'
    ],
    'macro' => [
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'https://feeds.bloomberg.com/markets/news.rss',
        'https://finance.yahoo.com/news/rssindex'
    ],
    'ukraine' => [
        'https://news.google.com/rss/search?q=ukraine+war+frontline&hl=en-GB&gl=GB&ceid=GB:en',
        'https://feeds.reuters.com/reuters/worldNews'
    ],
    'iran' => [
        'https://news.google.com/rss/search?q=iran+israel+war&hl=en-GB&gl=GB&ceid=GB:en',
        'https://feeds.reuters.com/reuters/worldNews'
    ],
    'aviation' => [
        'https://news.google.com/rss/search?q=military+aviation+activity&hl=en-GB&gl=GB&ceid=GB:en',
        'https://news.google.com/rss/search?q=ads-b+aviation+tracking&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'weather' => [
        'https://www.gdacs.org/xml/rss_7d.xml',
        'https://news.google.com/rss/search?q=extreme+weather+alerts&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'humanitarian' => [
        'https://news.google.com/rss/search?q=displacement+crisis+unhcr&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'economy' => [
        'https://feeds.bloomberg.com/markets/news.rss',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html'
    ],
    'outages' => [
        'https://news.google.com/rss/search?q=internet+outage+global&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'minerals' => [
        'https://news.google.com/rss/search?q=critical+minerals+supply+chain&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'military' => [
        'https://news.google.com/rss/search?q=military+movements+global&hl=en-GB&gl=GB&ceid=GB:en'
    ],
    'protests' => [
        'https://news.google.com/rss/search?q=protests+global&hl=en-GB&gl=GB&ceid=GB:en'
    ]
];

if (!isset($topicSources[$topic])) {
    echo json_encode([
        'status' => 'error',
        'message' => 'Unknown topic',
        'topic' => $topic,
        'items' => []
    ]);
    exit;
}

function fetchUrlContent($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 8,
            'header' => "User-Agent: G-Labs-IntelBot/1.0\r\n"
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true
        ]
    ]);
    $raw = @file_get_contents($url, false, $ctx);
    return $raw === false ? '' : $raw;
}

function parseRssItems($xmlText, $sourceUrl) {
    $items = [];
    if (trim($xmlText) === '') return $items;

    libxml_use_internal_errors(true);
    $xml = @simplexml_load_string($xmlText);
    if ($xml === false) return $items;

    $sourceHost = parse_url($sourceUrl, PHP_URL_HOST);
    $sourceHost = $sourceHost ? preg_replace('/^www\./', '', $sourceHost) : 'source';

    if (isset($xml->channel->item)) {
        foreach ($xml->channel->item as $entry) {
            $title = trim((string)$entry->title);
            $link = trim((string)$entry->link);
            $pub = trim((string)$entry->pubDate);
            if ($title === '' || $link === '') continue;
            $items[] = [
                'title' => $title,
                'link' => $link,
                'pubDate' => $pub,
                'source' => $sourceHost
            ];
        }
    } elseif (isset($xml->entry)) {
        foreach ($xml->entry as $entry) {
            $title = trim((string)$entry->title);
            $pub = trim((string)$entry->updated);
            $link = '';
            if (isset($entry->link)) {
                foreach ($entry->link as $ln) {
                    $href = trim((string)$ln['href']);
                    if ($href !== '') {
                        $link = $href;
                        break;
                    }
                }
            }
            if ($title === '' || $link === '') continue;
            $items[] = [
                'title' => $title,
                'link' => $link,
                'pubDate' => $pub,
                'source' => $sourceHost
            ];
        }
    }

    return $items;
}

function scoreItem($title) {
    $t = strtolower($title);
    $score = 1;
    if (preg_match('/attack|strike|missile|explosion|escalat|sanction|disrupt|outage|blockade/', $t)) $score += 3;
    if (preg_match('/warning|risk|conflict|drone|military|cyber|hacked|earthquake|flood|storm/', $t)) $score += 2;
    if (preg_match('/ceasefire|deal|easing|stabil|agreement/', $t)) $score -= 1;
    if ($score >= 5) return 'high';
    if ($score >= 3) return 'medium';
    return 'low';
}

function toTimestamp($dateStr) {
    if (!$dateStr) return 0;
    $ts = strtotime($dateStr);
    return $ts ? $ts : 0;
}

$cacheKey = 'g_labs_intel_' . $topic . '_' . $limit . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 180;

if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) {
        echo $cached;
        exit;
    }
}

$all = [];
foreach ($topicSources[$topic] as $src) {
    $raw = fetchUrlContent($src);
    $parsed = parseRssItems($raw, $src);
    foreach ($parsed as $it) {
        $all[] = $it;
    }
}

$unique = [];
$seen = [];
foreach ($all as $item) {
    $key = strtolower(preg_replace('/\s+/', ' ', trim($item['title'])));
    if ($key === '' || isset($seen[$key])) continue;
    $seen[$key] = true;
    $item['severity'] = scoreItem($item['title']);
    $item['timestamp'] = toTimestamp($item['pubDate']);
    $unique[] = $item;
}

usort($unique, function ($a, $b) {
    if ($a['timestamp'] === $b['timestamp']) return 0;
    return ($a['timestamp'] > $b['timestamp']) ? -1 : 1;
});

$items = array_slice($unique, 0, $limit);

$payload = [
    'status' => 'ok',
    'topic' => $topic,
    'updatedAt' => gmdate('c'),
    'count' => count($items),
    'items' => $items
];

$json = json_encode($payload, JSON_UNESCAPED_SLASHES);
if ($json === false) {
    echo json_encode([
        'status' => 'error',
        'message' => 'JSON encoding failed',
        'topic' => $topic,
        'items' => []
    ]);
    exit;
}

@file_put_contents($cachePath, $json);
echo $json;
?>
