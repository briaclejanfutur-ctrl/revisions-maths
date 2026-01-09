const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastOrigin = "";

const decode = (str) => {
    try {
        let b = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

const HTML_UI = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>APEX ULTRA V7 // INSTANT</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #000; margin: 0; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
        #nav { background: #050505; padding: 10px; display: flex; gap: 10px; border-bottom: 2px solid #00ffcc; }
        input { flex: 1; background: #111; border: 1px solid #222; color: #00ffcc; padding: 8px 15px; border-radius: 5px; outline: none; }
        button { background: #00ffcc; color: #000; font-weight: 900; padding: 8px 20px; border-radius: 5px; cursor: pointer; }
        iframe { flex: 1; border: none; background: #fff; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#00ffcc; font-weight:bold; padding-top:5px">APEX_V7</div>
        <input type="text" id="url" placeholder="URL CIBLE (ex: m.youtube.com)">
        <button onclick="go()">EXECUTE</button>
    </div>
    <iframe id="view"></iframe>
    <script>
        function go() {
            let v = document.getElementById('url').value;
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/stream/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL INSTANTANÉ (PIPING DIRECT)
fastify.all('/stream/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Bad Stream");
    
    const urlObj = new URL(target);
    lastOrigin = urlObj.origin;

    try {
        const response = await axios({
            method: req.method,
            url: target,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1', // UA Mobile pour plus de légèreté
                'Range': req.headers.range
            },
            validateStatus: false
        });

        // Suppression agressive des blocages
        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        
        res.status(response.status);
        res.headers(headers);

        // LE SECRET : On "pipe" directement le flux sans le lire
        return res.send(response.data);

    } catch (e) {
        return res.status(500).send("Apex Stream Error");
    }
});

// Réparateur de liens automatique
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastOrigin) return res.status(404).send();
    try {
        const response = await axios({
            method: req.method,
            url: lastOrigin + req.url,
            responseType: 'stream',
            validateStatus: false
        });
        res.headers(response.headers);
        return res.send(response.data);
    } catch (e) { res.status(404).send(); }
});

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
