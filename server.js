const fastify = require('fastify')({ logger: false });
const axios = require('axios');
const { PassThrough } = require('stream');

const XOR_KEY = 42;
let lastTargetOrigin = "";

// Cryptage XOR professionnel
const encode = (str) => {
    let xored = str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    return Buffer.from(xored).toString('base64');
};

const decode = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

const HTML_UI = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>APEX ULTRA // CORE</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;800&display=swap" rel="stylesheet">
    <style>
        body { background: #000; margin: 0; overflow: hidden; height: 100vh; font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; }
        #nav-bar { background: #050505; border-bottom: 2px solid #00ffcc; padding: 12px 25px; display: flex; gap: 20px; align-items: center; z-index: 999; box-shadow: 0 0 20px rgba(0, 255, 204, 0.2); }
        .logo { color: #00ffcc; font-weight: 800; font-size: 1.2rem; letter-spacing: -1px; text-transform: uppercase; }
        #urlInput { flex: 1; background: #000; border: 1px solid #333; color: #00ffcc; padding: 10px 20px; border-radius: 8px; outline: none; transition: 0.3s; font-size: 0.9rem; }
        #urlInput:focus { border-color: #00ffcc; box-shadow: 0 0 10px rgba(0, 255, 204, 0.1); }
        .btn-connect { background: #00ffcc; color: #000; font-weight: 800; padding: 10px 30px; border-radius: 8px; cursor: pointer; border: none; font-size: 0.8rem; text-transform: uppercase; }
        .btn-connect:hover { filter: brightness(1.2); box-shadow: 0 0 15px #00ffcc; }
        #frame-container { flex: 1; position: relative; background: #fff; }
        iframe { width: 100%; height: 100%; border: none; }
        #panic-view { position: fixed; inset: 0; background: white; z-index: 10000; display: none; }
    </style>
</head>
<body>
    <div id="nav-bar">
        <div class="logo">Apex_Ultra</div>
        <input type="text" id="urlInput" placeholder="Saisir l'adresse de destination (ex: youtube.com)..." spellcheck="false">
        <button class="btn-connect" onclick="launch()">Execute</button>
    </div>

    <div id="frame-container">
        <div id="welcome" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#111; z-index:10">
             <div style="font-size:15vw; font-weight:900; letter-spacing:-1vw">APEX</div>
             <div style="color:#00ffcc; font-size:0.7rem; letter-spacing:1em; margin-top:-2rem">STEALTH BYPASS ACTIVE</div>
        </div>
        <iframe id="viewport"></iframe>
    </div>

    <div id="panic-view"><iframe src="https://www.google.fr/search?q=cours+de+maths+lycee" style="width:100%; height:100%"></iframe></div>

    <script>
        const urlInput = document.getElementById('urlInput');
        const viewport = document.getElementById('viewport');
        const welcome = document.getElementById('welcome');

        function launch() {
            let val = urlInput.value.trim();
            if(!val) return;
            if(!val.startsWith('http')) val = 'https://' + val;

            // Cryptage XOR (Clé 42)
            const encoded = btoa(val.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            
            welcome.style.display = 'none';
            viewport.src = '/tunnel/' + encodeURIComponent(encoded);
        }

        urlInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') launch(); });

        window.addEventListener('keydown', (e) => {
            if(e.key.toLowerCase() === 'p') {
                const p = document.getElementById('panic-view');
                p.style.display = (p.style.display === 'block') ? 'none' : 'block';
            }
        });
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// TUNNEL MAITRE (STREAMING PUR)
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Bad Payload");
    lastTargetOrigin = new URL(target).origin;
    return proxyLogic(target, req, res);
});

// CATCH-ALL : Répare les requêtes perdues (images, scripts, api)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTargetOrigin || req.url.startsWith('/tunnel/')) return res.status(404).send("Target Lost");
    return proxyLogic(lastTargetOrigin + req.url, req, res);
});

async function proxyLogic(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Range': req.headers.range // Crucial pour la lecture vidéo (YouTube/TikTok)
            },
            validateStatus: false,
            maxRedirects: 15
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        
        res.status(response.status);
        res.headers(headers);

        // Si c'est du HTML, on injecte une base URL pour les liens
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            const pt = new PassThrough();
            let html = '';
            response.data.on('data', chunk => html += chunk.toString());
            response.data.on('end', () => {
                const injection = `<base href="${lastTargetOrigin}/"><script>console.log("Apex Ultra Active");</script>`;
                html = html.replace('<head>', '<head>' + injection);
                res.send(html);
            });
        } else {
            // Pour les vidéos/images, on "pipe" directement le flux (ultra rapide)
            return res.send(response.data);
        }
    } catch (e) {
        return res.status(500).send("Apex Core Error: " + e.message);
    }
}

const port = process.env.PORT || 10000;
fastify.listen({ port: port, host: '0.0.0.0' }, () => {
    console.log("APEX ULTRA SYSTEM ONLINE");
});
