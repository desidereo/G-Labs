const https = require('https');
https.get('https://www.mql5.com/en/users/gcash01/seller', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const regex = /href="\/en\/market\/product\/(\d+)[^"]*"[^>]*title="([^"]+)"/g;
    const matches = [...data.matchAll(regex)];
    const unique = new Set();
    matches.forEach(m => unique.add(m[1] + ' - ' + m[2]));
    unique.forEach(u => console.log(u));
  });
});
