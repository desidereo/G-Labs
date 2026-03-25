<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');
header('Access-Control-Allow-Origin: *');
error_reporting(0);
ini_set('display_errors', 0);
set_time_limit(60);

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
        'BBC World'     => 'http://feeds.bbci.co.uk/news/world/rss.xml',
        'NPR'           => 'https://feeds.npr.org/1001/rss.xml',
        'DW News'       => 'https://rss.dw.com/xml/rss-en-world',
        'The Guardian'  => 'https://www.theguardian.com/world/rss',
        'Al Jazeera'    => 'https://www.aljazeera.com/xml/rss/all.xml',
    ],
    'markets' => [
        'CNBC Markets'    => 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
        'MarketWatch'     => 'https://feeds.marketwatch.com/marketwatch/topstories/',
        'Seeking Alpha'   => 'https://seekingalpha.com/market_currents.xml',
        'Yahoo Finance'   => 'https://finance.yahoo.com/news/rssindex',
    ],
    'forex' => [
        'ForexLive'       => 'https://www.forexlive.com/feed/news',
        'DailyFX'         => 'https://www.dailyfx.com/feeds/all',
    ],
    'crypto' => [
        'CoinDesk'        => 'https://www.coindesk.com/arc/outboundfeeds/rss/',
        'CoinTelegraph'   => 'https://cointelegraph.com/rss',
        'Decrypt'         => 'https://decrypt.co/feed',
    ],
    'commodities' => [
        'OilPrice.com'    => 'https://oilprice.com/rss/main',
        'Mining.com'      => 'https://www.mining.com/feed/',
    ],
    'geopolitics' => [
        'War on Rocks'    => 'https://warontherocks.com/feed/',
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

function parseXmlToItems($xml, $source) {
    if (!$xml || strlen($xml) < 100) return [];
    libxml_use_internal_errors(true);
    $doc = @simplexml_load_string($xml);
    if (!$doc) return [];
    $items = [];

    if (isset($doc->channel->item)) {
        foreach ($doc->channel->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? ''));
            $desc = trim(strip_tags((string)($e->description ?? '')));
            if (strlen($desc) > 200) $desc = substr($desc, 0, 200) . '...';
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false || $ts <= 0) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => $desc, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        return $items;
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
            if ($ts === false || $ts <= 0) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => $desc, 'publishedAt' => $date, 'timestamp' => $ts];
        }
        return $items;
    }
    if (isset($doc->item)) {
        foreach ($doc->item as $e) {
            $title = trim((string)($e->title ?? ''));
            if ($title === '') continue;
            $link = trim((string)($e->link ?? ''));
            $date = trim((string)($e->pubDate ?? $e->date ?? ''));
            $ts = $date ? @strtotime($date) : time();
            if ($ts === false || $ts <= 0) $ts = time();
            $items[] = ['title' => $title, 'url' => $link, 'source' => $source, 'desc' => '', 'publishedAt' => $date, 'timestamp' => $ts];
        }
    }
    return $items;
}

$items = [];
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

if (function_exists('curl_multi_init')) {
    $mh = curl_multi_init();
    $handles = [];
    foreach ($selectedFeeds as $source => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_USERAGENT      => $ua,
            CURLOPT_HTTPHEADER     => ['Accept: application/rss+xml, application/xml, text/xml, */*'],
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING       => '',
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[$source] = $ch;
    }

    $running = null;
    do {
        $status = curl_multi_exec($mh, $running);
        if ($running > 0) curl_multi_select($mh, 1);
    } while ($running > 0 && $status === CURLM_OK);

    foreach ($handles as $source => $ch) {
        $body = curl_multi_getcontent($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
        if ($code >= 200 && $code < 400 && $body) {
            $items = array_merge($items, parseXmlToItems($body, $source));
        }
    }
    curl_multi_close($mh);

} elseif (function_exists('curl_init')) {
    foreach ($selectedFeeds as $source => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => $ua,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING       => '',
        ]);
        $body = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code >= 200 && $code < 400 && $body) {
            $items = array_merge($items, parseXmlToItems($body, $source));
        }
    }

} else {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 4,
            'header' => "User-Agent: $ua\r\nAccept: application/rss+xml, application/xml, text/xml\r\n",
            'ignore_errors' => true
        ],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    foreach ($selectedFeeds as $source => $url) {
        $xml = @file_get_contents($url, false, $ctx);
        if ($xml !== false) $items = array_merge($items, parseXmlToItems($xml, $source));
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
if ($json && count($unique) > 0) @file_put_contents($cachePath, $json);
echo $json ?: json_encode(['status' => 'error', 'items' => []]);
