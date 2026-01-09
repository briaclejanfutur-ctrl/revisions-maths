const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTargetOrigin = "";

// Système de décodage furtif
const decode = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

const HTML_UI = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>APEX // GOD MODE</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #000; margin: 0; overflow: hidden; height: 100vh; display: flex; flex-direction: column; }
        #nav { background: #080808; padding: 10px 20px; display: flex; gap: 15px; border-bottom: 1px solid #00ffcc33; align-items: center; z-index: 100; }
        input { flex: 1; background: #000; border: 1px solid #00ffcc55; color: #00ffcc; padding: 10px; border-radius: 5px; outline: none; font-family: monospace; }
        button { background: #00ffcc; color: #000; border: none; padding: 10px 25px; font-weight: 900; cursor: pointer; border-radius: 5px; transition: 0.3s; }
        button:hover { box-shadow: 0 0 15px #00ffcc; }
        iframe { flex: 1; border: none; background: #fff; }
        #panic { position: fixed; inset: 0; background: white; z-index: 9999; display: none; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#00ffcc; font-weight:bold; font-family:monospace; letter-spacing:2px">APEX_GODMODE</div>
        <input type="text" id="url" placeholder="URL SÉCURISÉE (YouTube, TikTok, Reddit...)" autocomplete="off">
        <button onclick="go()">EXECUTE</button>
    </div>
    <iframe id="view"></iframe>
    <div id="panic"><iframe src="https://www.google.com/classroom" style="width:100%; height:100%; border:none"></iframe></div>

    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            // Cryptage XOR 42
            const encoded = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/tunnel/' + encodeURIComponent(encoded);
        }
        window.addEventListener('keydown', e => {
            if(e.key.toLowerCase() === 'p') {
                const p = document.getElementById('panic');
                p.style.display = (p.style.display === 'block') ? 'none' : 'block';
            }
        });
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL MAITRE
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Bad Stream");
    lastTargetOrigin = new URL(target).origin;
    return doProxy(target, req, res);
});

// CATCH-ALL : Répare les liens cassés du site cible
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTargetOrigin) return res.status(404).send("Restart Proxy");
    const repairUrl = lastTargetOrigin + req.url;
    return doProxy(repairUrl, req, res);
});

async function doProxy(url, req, res) {
    try {
        // ON RÉCUPÈRE LES HEADERS DU NAVIGATEUR (IMPORTANT POUR LA VIDÉO)
        const requestHeaders = { ...req.headers };
        delete requestHeaders.host;
        delete requestHeaders.referer;

        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                ...requestHeaders,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': lastTargetOrigin + '/'
            },
            validateStatus: false,
            maxRedirects: 10
        });

        const responseHeaders = { ...response.headers };
        
        // --- BYPASS DE SÉCURITÉ ---
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['content-encoding'];
        delete responseHeaders['transfer-encoding'];

        res.headers(responseHeaders);
        res.status(response.status);

        // Injection HTML pour forcer les liens
        if (responseHeaders['content-type'] && responseHeaders['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const base = `<base href="${lastTargetOrigin}/">`;
                const script = `<script>
                    // Empêcher le site de sortir du proxy
                    window.onbeforeunload = function() { return null; };
                </script>`;
                html = html.replace('<head>', '<head>' + base + script);
                res.send(html);
            });
        } else {
            // TRANSFERT EN DIRECT (INDISPENSABLE POUR LES VIDÉOS TIKTOK/YOUTUBE)
            return res.send(response.data);
        }
    } catch (e) {
        return res.status(500).send("Apex Godmode Error: " + e.message);
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
