<?php
header('Content-Type: text/html; charset=utf-8');
error_reporting(E_ALL);
ini_set('display_errors', 1);
echo '<pre style="font-family:monospace;background:#111;color:#0f0;padding:20px;font-size:13px">';
echo "=== G-Labs Proxy Diagnostics ===\n";
echo "Server time: " . date('Y-m-d H:i:s T') . "\n";
echo "PHP version: " . phpversion() . "\n";
echo "curl: " . (function_exists('curl_init') ? 'YES' : 'NO') . "\n";
echo "curl_multi: " . (function_exists('curl_multi_init') ? 'YES' : 'NO') . "\n";
echo "allow_url_fopen: " . ini_get('allow_url_fopen') . "\n";
echo "max_execution_time: " . ini_get('max_execution_time') . "\n\n";

$tmpDir = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);
echo "Temp dir: {$tmpDir}\n";
echo "Temp writable: " . (is_writable($tmpDir) ? 'YES' : 'NO') . "\n\n";

$caches = [
    'forex'       => 'g_labs_forex.json',
    'crypto'      => 'g_labs_crypto.json',
    'fear_greed'  => 'g_labs_fear_greed.json',
    'correlation' => 'g_labs_correlation.json',
];

echo "=== Cache Files ===\n";
foreach ($caches as $name => $file) {
    $path = $tmpDir . DIRECTORY_SEPARATOR . $file;
    if (file_exists($path)) {
        $age = time() - filemtime($path);
        $size = filesize($path);
        echo "{$name}: EXISTS  age={$age}s  size={$size}b\n";
    } else {
        echo "{$name}: MISSING\n";
    }
}

echo "\n=== Clearing all caches ===\n";
foreach ($caches as $name => $file) {
    $path = $tmpDir . DIRECTORY_SEPARATOR . $file;
    if (file_exists($path)) {
        @unlink($path);
        echo "Deleted: {$file}\n";
    }
}

$stocksPattern = $tmpDir . DIRECTORY_SEPARATOR . 'g_labs_stocks_*.json';
foreach (glob($stocksPattern) as $f) {
    @unlink($f);
    echo "Deleted: " . basename($f) . "\n";
}

$newsPattern = $tmpDir . DIRECTORY_SEPARATOR . 'g_labs_wnews_*.json';
foreach (glob($newsPattern) as $f) {
    @unlink($f);
    echo "Deleted: " . basename($f) . "\n";
}

echo "\n=== Testing Frankfurter (forex + strength source) ===\n";
$startDate = date('Y-m-d', strtotime('-7 days'));
$endDate = date('Y-m-d');
$testUrl = "https://api.frankfurter.app/{$startDate}..{$endDate}?from=USD&to=EUR,GBP,JPY";
echo "URL: {$testUrl}\n";

$raw = false;
if (function_exists('curl_init')) {
    $ch = curl_init($testUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT      => 'G-Labs/1.0',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $body = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "curl HTTP {$code}";
    if ($err) echo " error: {$err}";
    echo "\n";
    if ($code >= 200 && $code < 300 && $body) {
        $raw = $body;
        $data = json_decode($body, true);
        if (isset($data['rates'])) {
            $dates = array_keys($data['rates']);
            sort($dates);
            echo "Dates returned: " . implode(', ', $dates) . "\n";
            echo "Latest: " . end($dates) . "\n";
            $prev = count($dates) >= 2 ? $dates[count($dates)-2] : 'N/A';
            echo "Previous: {$prev}\n";
            $last = end($dates);
            echo "Latest EUR: " . ($data['rates'][$last]['EUR'] ?? 'missing') . "\n";
            if ($prev !== 'N/A') {
                echo "Prev EUR: " . ($data['rates'][$prev]['EUR'] ?? 'missing') . "\n";
            }
        } else {
            echo "No rates key in response\n";
            echo substr($body, 0, 300) . "\n";
        }
    } else {
        echo "curl failed, body length: " . strlen($body ?: '') . "\n";
    }
} else {
    echo "curl not available, trying file_get_contents\n";
    $ctx = stream_context_create([
        'http' => ['timeout' => 10, 'header' => "User-Agent: G-Labs/1.0\r\n"],
        'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);
    $body = @file_get_contents($testUrl, false, $ctx);
    echo "file_get_contents: " . ($body !== false ? "OK (" . strlen($body) . " bytes)" : "FAILED") . "\n";
}

echo "\n=== Testing CoinGecko (crypto source) ===\n";
$cgUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
if (function_exists('curl_init')) {
    $ch = curl_init($cgUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>8, CURLOPT_SSL_VERIFYPEER=>false, CURLOPT_USERAGENT=>'G-Labs/1.0']);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "curl HTTP {$code}: " . substr($body ?: 'empty', 0, 200) . "\n";
}

echo "\n=== Testing alternative.me (fear/greed source) ===\n";
$fgUrl = 'https://api.alternative.me/fng/?limit=1';
if (function_exists('curl_init')) {
    $ch = curl_init($fgUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>8, CURLOPT_SSL_VERIFYPEER=>false, CURLOPT_USERAGENT=>'G-Labs/1.0']);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    echo "curl HTTP {$code}: " . substr($body ?: 'empty', 0, 200) . "\n";
}

echo "\n=== All caches cleared. Reload Trader Hub to test fresh data. ===\n";
echo '</pre>';
