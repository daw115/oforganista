// Prosty serwer HTTP dla Windows 7 + Node 13
// Z wbudowanym proxy do OpenLP (obejscie CORS)
// Uzycie: node serve.js
// Opcjonalnie: node serve.js --db "C:\sciezka\do\songs.sqlite"
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = 8080;
var OPENLP_DEFAULT_PORT = 4316;

// Parse --db argument for local OpenLP database path
var LOCAL_DB_PATH = null;
for (var i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--db' && process.argv[i + 1]) {
    LOCAL_DB_PATH = process.argv[i + 1];
    i++;
  }
}

// Try to auto-detect OpenLP database if no --db flag
if (!LOCAL_DB_PATH) {
  var homedir = process.env.USERPROFILE || process.env.HOME || '';
  var possiblePaths = [
    path.join(homedir, 'AppData', 'Roaming', 'openlp', 'data', 'songs', 'songs.sqlite'),
    path.join(homedir, 'AppData', 'Roaming', 'openlp', 'songs', 'songs.sqlite'),
    path.join(homedir, '.local', 'share', 'openlp', 'songs', 'songs.sqlite'),
    path.join(homedir, '.openlp', 'data', 'songs', 'songs.sqlite'),
  ];
  for (var p = 0; p < possiblePaths.length; p++) {
    if (fs.existsSync(possiblePaths[p])) {
      LOCAL_DB_PATH = possiblePaths[p];
      break;
    }
  }
}

var mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.sqlite': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

var server = http.createServer(function (req, res) {
  var url = req.url.split('?');
  var pathname = url[0];
  var query = url[1] || '';

  // ─── LOCAL DB: /local-db → serwuje plik SQLite z dysku ───
  if (pathname === '/local-db') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (!LOCAL_DB_PATH || !fs.existsSync(LOCAL_DB_PATH)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Nie znaleziono bazy OpenLP',
        searched: LOCAL_DB_PATH || 'brak sciezki',
        hint: 'Uruchom z parametrem: node serve.cjs --db "C:\\sciezka\\do\\songs.sqlite"'
      }));
      return;
    }

    fs.readFile(LOCAL_DB_PATH, function (err, data) {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length,
        'X-DB-Path': LOCAL_DB_PATH
      });
      res.end(data);
    });
    return;
  }

  // ─── LOCAL DB INFO: /local-db-info → informacja o sciezce ───
  if (pathname === '/local-db-info') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      available: !!LOCAL_DB_PATH && fs.existsSync(LOCAL_DB_PATH),
      path: LOCAL_DB_PATH || null,
    }));
    return;
  }

  // ─── AUTO-BRIDGE: /auto-bridge → sygnał dla aplikacji że działa lokalnie ───
  if (pathname === '/auto-bridge') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      localServer: true,
      bridgeMode: true,
      openLpHost: '127.0.0.1',
      openLpPort: OPENLP_DEFAULT_PORT,
      timestamp: Date.now()
    }));
    return;
  }

  // ─── PROXY do OpenLP: /openlp-proxy/<ip>/<port>/reszta/sciezki ───
  if (pathname.indexOf('/openlp-proxy/') === 0) {
    var parts = pathname.replace('/openlp-proxy/', '').split('/');
    var targetIp = parts[0] || '127.0.0.1';
    var targetPort = parseInt(parts[1], 10) || OPENLP_DEFAULT_PORT;
    var targetPath = '/' + parts.slice(2).join('/');
    if (query) targetPath += '?' + query;

    var options = {
      hostname: targetIp,
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    };

    var proxyReq = http.request(options, function (proxyRes) {
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', function (err) {
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: err.message }));
    });

    proxyReq.on('timeout', function () {
      proxyReq.abort();
      res.writeHead(504, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ error: 'Timeout' }));
    });

    // Forward body for POST/PUT
    if (req.method === 'POST' || req.method === 'PUT') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    return;
  }

  // ─── Statyczne pliki (SPA) ───
  var filePath = '.' + (pathname === '/' ? '/index.html' : pathname);

  // SPA fallback - jesli plik nie istnieje, zwroc index.html
  if (!fs.existsSync(filePath)) {
    filePath = './index.html';
  }

  var ext = path.extname(filePath).toLowerCase();
  var contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, function (err, content) {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + filePath);
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('===========================================');
  console.log('  Serwer dziala na http://localhost:' + PORT);
  console.log('  Proxy OpenLP: /openlp-proxy/<ip>/<port>/...');
  console.log('  WebSocket projektor: ws://localhost:' + PORT + '/ws-projector');
  if (LOCAL_DB_PATH) {
    console.log('  Baza OpenLP: ' + LOCAL_DB_PATH);
  } else {
    console.log('  Baza OpenLP: nie znaleziono (uzyj --db)');
  }
  console.log('===========================================');
  console.log('');
  console.log('Aby zatrzymac serwer, nacisnij Ctrl+C');
});

// ─── WebSocket: synchronizacja rzutnika ───
// Wymaga: npm install ws (lub uzyj wbudowanego w Node 21+)
try {
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({ server: server });
  var latestState = null;
  var clients = [];

  wss.on('connection', function (ws) {
    clients.push(ws);
    // Send current state to new client
    if (latestState) {
      ws.send(latestState);
    }

    ws.on('message', function (data) {
      var msg = typeof data === 'string' ? data : data.toString();
      latestState = msg;
      // Broadcast to all other clients
      for (var i = 0; i < clients.length; i++) {
        if (clients[i] !== ws && clients[i].readyState === 1) {
          clients[i].send(msg);
        }
      }
    });

    ws.on('close', function () {
      clients = clients.filter(function (c) { return c !== ws; });
    });
  });

  console.log('  WebSocket projektor: aktywny');
} catch (e) {
  console.log('  WebSocket projektor: niedostepny (zainstaluj: npm install ws)');
}
