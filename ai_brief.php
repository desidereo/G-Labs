<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

// Heuristic AI brief: build 2-3 sentence summary from headline titles (no API key).
// POST body: { "titles": ["headline 1", "headline 2", ...] } or leave empty to fetch from GDELT internally.

$titles = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!empty($input['titles']) && is_array($input['titles'])) {
        $titles = array_slice($input['titles'], 0, 30);
    }
}
if (empty($titles)) {
    $url = 'https://api.gdeltproject.org/api/v1/gkg_geojson?QUERY=forex+OR+oil+OR+shipping+OR+sanctions+OR+conflict&TIMESPAN=120&MAXROWS=25';
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'timeout' => 8, 'header' => "User-Agent: G-Labs-Intel/1.0\r\n"]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw) {
        $data = json_decode($raw, true);
        if (!empty($data['features'])) {
            foreach ($data['features'] as $f) {
                $t = $f['properties']['title'] ?? $f['properties']['allnames'] ?? '';
                if ($t) $titles[] = $t;
            }
        }
    }
}

$stopwords = ['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','this','that','these','those','it','its'];
$themeKeywords = [
    'Fed' => ['fed','federal reserve','rates','interest rate','inflation','powell'],
    'Markets' => ['stock','market','trading','earnings','revenue','ipo','equity'],
    'Oil' => ['oil','opec','brent','wti','crude','energy','gas'],
    'Conflict' => ['war','attack','military','conflict','sanctions','nato','russia','ukraine'],
    'Central banks' => ['ecb','central bank','euro','dollar','currency'],
    'Trade' => ['trade','tariff','china','export','import']
];
$counts = [];
$allWords = [];
foreach ($titles as $title) {
    $words = preg_split('/\s+/', strtolower($title), -1, PREG_SPLIT_NO_EMPTY);
    foreach ($words as $w) {
        $w = preg_replace('/[^a-z0-9]/', '', $w);
        if (strlen($w) < 3 || in_array($w, $stopwords)) continue;
        $allWords[$w] = ($allWords[$w] ?? 0) + 1;
    }
    foreach ($themeKeywords as $theme => $keywords) {
        foreach ($keywords as $kw) {
            if (strpos($title, $kw) !== false || strpos(strtolower($title), $kw) !== false) {
                $counts[$theme] = ($counts[$theme] ?? 0) + 1;
                break;
            }
        }
    }
}
arsort($counts);
$topThemes = array_slice(array_keys($counts), 0, 4);
$sentences = [];
if (!empty($topThemes)) {
    $sentences[] = 'Today\'s focus: ' . implode(', ', array_map(function($t) use ($counts) { return $t . ' (' . $counts[$t] . ')'; }, $topThemes)) . '.';
}
if (count($counts) >= 2) {
    $sentences[] = 'Key themes: ' . implode(', ', array_slice($topThemes, 0, 3)) . '.';
}
if (empty($sentences)) {
    $sentences[] = 'Monitoring global event streams. No dominant theme in latest headlines.';
}
$summary = implode(' ', $sentences);

echo json_encode([
    'status' => 'ok',
    'summary' => $summary,
    'themes' => $counts,
    'updatedAt' => gmdate('c')
]);
