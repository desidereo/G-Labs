<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);

$category = isset($_GET['cat']) ? trim($_GET['cat']) : 'all';

$cacheKey = 'g_labs_wnews_' . preg_replace('/[^a-z0-9]/', '', $category) . '.json';
$cachePath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $cacheKey;
$cacheTtl = 300;
if (file_exists($cachePath) && (time() - filemtime($cachePath) < $cacheTtl)) {
    $cached = @file_get_contents($cachePath);
    if ($cached) { echo $cached; exit; }
}

$feedsByCategory = [
    'world' => [
        'Reuters'       => 'https://feeds.reuters.com/reuters/topNews',
        'BBC World'     => 'http://feeds.bbci.co.uk/news/world/rss.xml',
        'AP News'       => 'https://feeds.ap.org/rss/TopNews',
        'Al Jazeera'    => 'https://www.aljazeera.com/xml/rss/all.xml',
        'NPR'           => 'https://feeds.npr.org/1001/rss.xml',
        'DW News'       => 'https://rss.dw.com/xml/rss-en-world',
        'France 24'     => 'https://www.france24.com/en/rss',
        'The Guardian'  => 'https://www.theguardian.com/world/rss',
    ],
    'markets' => [
        'CNBC Markets'    => 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
        'CNBC World'      => 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'MarketWatch'     => 'https://feeds.marketwatch.com/marketwatch/topstories/',
        'Investing.com'   => 'https://www.investing.com/rss/news.rss',
        'Yahoo Finance'   => 'https://finance.yahoo.com/news/rssindex',
        'FT Markets'      => 'https://www.ft.com/rss/home',
        'Seeking Alpha'   => 'https://seekingalpha.com/market_currents.xml',
        'Barrons'         => 'https://www.barrons.com/market-data/rss',
    ],
    'forex' => [
        'ForexLive'       => 'https://www.forexlive.com/feed/news',
        'FXStreet'        => 'https://www.fxstreet.com/rss',
        'DailyFX'         => 'https://www.dailyfx.com/feeds/all',
    ],
    'crypto' => [
        'CoinDesk'        => 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'CoinTelegraph'   => 'https://cointelegraph.com/rss',
        'Decrypt'         => 'https://decrypt.co/feed',
        'The Block'       => 'https://www.theblock.co/rss.xml',
    ],
    'commodities' => [
        'OilPrice.com'    => 'https://oilprice.com/rss/main',
        'Kitco Gold'      => 'https://www.kitco.com/rss/gold.xml',
        'Mining.com'      => 'https://www.mining.com/feed/',
    ],
    'geopolitics' => [
        'Defense One'     => 'https://www.defenseone.com/rss/',
        'War on Rocks'    => 'https://warontherocks.com/feed/',
        'Foreign Affairs' => 'https://www.foreignaffairs.com/rss.xml',
        'CSIS'            => 'https://www.csis.org/analysis/feed',
        'Brookings'       => 'https://www.brookings.edu/feed/',
    ],
];

$selectedFeeds = [];
if ($category === 'all') {
    foreach ($feedsByCategory as $feeds) $selectedFeeds = array_merge($selectedFeeds, $feeds);
} elseif (isset($feedsByCategory[$category])) {
    $selectedFeeds = $feedsByCategory[$category];
} else {
    foreach ($feedsByCategory as $feeds) $selectedFeeds = array_merge($selectedFeeds, $feeds);
}

$items = [];
$ctx = stream_context_create([
    'http' => [
        'timeout' => 6,
        'header' => "User-Agent: G-Labs-WorldNews/1.0\r\nAccept: application/rss+xml, application/xml, text/xml\r\n",
        'ignore_errors' => true
    ],
    'ssl' => ['verify_peer' => true, 'verify_peer_name' => true]
]);

foreach ($selectedFeeds as $source => $url) {
    $xml = @file_get_contents($url, false, $ctx);
    if ($xml === false || strlen($xml) < 100) continue;
    libxml_use_internal_errors(true);
    $doc = @simplexml_load_string($xml);
    if (!$doc) continue;

    if (isset($doc->channel->item)) {
        foreach ($doc->channel->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? ''));
            $desc = trim(strip_tags((string)($e->description ?? '')));
            if (strlen($desc) > 200) $desc = substr($desc, 0, 200) . '...';
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => $desc, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        continue;
    }
    if (isset($doc->entry)) {
        foreach ($doc->entry as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = '';
            if (isset($e->link)) {
                foreach ($e->link as $lnk) {
                    $rel = (string)($lnk['rel'] ?? 'alternate');
                    if ($rel === 'alternate' || $rel === '') { $link = (string)($lnk['href'] ?? ''); break; }
                }
                if ($link === '' && isset($e->link[0])) $link = (string)($e->link[0]['href'] ?? (string)$e->link[0]);
            }
            $desc = trim(strip_tags((string)($e->summary ?? $e->content ?? '')));
            if (strlen($desc) > 200) $desc = substr($desc, 0, 200) . '...';
            $date = trim((string)($e->published ?? $e->updated ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => $desc, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        continue;
    }
    if (isset($doc->item)) {
        foreach ($doc->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? $e->date ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => '', 'publishedAt' => $date, 'timestamp' => $ts];
        }
    }
}

usort($items, function ($a, $b) { return ($b['timestamp'] ?? 0) - ($a['timestamp'] ?? 0); });

$seen = [];
$unique = [];
foreach ($items as $item) {
    $key = strtolower(preg_replace('/[^a-z0-9]/', '', $item['title']));
    if (isset($seen[$key])) continue;
    $seen[$key] = true;
    $unique[] = $item;
    if (count($unique) >= 80) break;
}

$out = ['status' => 'ok', 'category' => $category, 'count' => count($unique), 'items' => $unique, 'updatedAt' => gmdate('c')];
$json = json_encode($out, JSON_UNESCAPED_SLASHES);
if ($json) @file_put_contents($cachePath, $json);
echo $json ?: json_encode(['status' => 'error', 'items' => []]);
