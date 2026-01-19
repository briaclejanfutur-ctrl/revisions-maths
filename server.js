const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTargetOrigin = "";

// Décodeur furtif
const decode = (str) => {
    try {
        let b = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

// Encodeur pour l'injection
const encode = (url) => {
    const xored = url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    return Buffer.from(xored).toString('base64');
};

const HTML_UI = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Portail de Révisions - Académie</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f9fafb; margin: 0; font-family: system-ui; height: 100vh; display: flex; flex-direction: column; }
        #nav { background: #111827; padding: 12px 20px; display: flex; gap: 15px; align-items: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        input { flex: 1; padding: 10px 15px; border-radius: 8px; border: 1px solid #374151; background: #1f2937; color: white; outline: none; font-size: 14px; }
        input:focus { border-color: #3b82f6; ring: 2px #3b82f6; }
        button { background: #2563eb; color: white; padding: 10px 25px; border-radius: 8px; font-weight: 600; transition: 0.2s; }
        button:hover { background: #1d4ed8; }
        iframe { flex: 1; border: none; background: white; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:white; font-weight:800; font-size:18px; letter-spacing:-0.5px">EDU_CORE</div>
        <input type="text" id="url" placeholder="Rechercher une ressource ou entrer un lien...">
        <button onclick="go()">Lancer</button>
    </div>
    <iframe id="view"></iframe>

    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/tunnel/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// TUNNEL MAITRE AVEC INJECTION DE SCRIPT
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux corrompu");
    
    const urlObj = new URL(target);
    lastTargetOrigin = urlObj.origin;

    try {
        const response = await axios({
            method: req.method,
            url: target,
            data: req.body,
            responseType: 'arraybuffer',
            headers: {
                ...req.headers,
                'host': urlObj.host,
                'referer': urlObj.origin,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: false
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.status(response.status);
        res.headers(headers);

        // --- LA MAGIE DE RÉÉCRITURE ---
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let html = response.data.toString();
            
            // Injection du script qui "force" les liens à rester dans le proxy
            const rewriterScript = `
            <base href="${lastTargetOrigin}/">
            <script>
            (function() {
                const XOR_KEY = 42;
                function proxyUrl(url) {
                    if (!url || url.startsWith('data:') || url.startsWith('javascript:')) return url;
                    let fullUrl = new URL(url, window.location.href).href;
                    const xored = fullUrl.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
                    return window.location.origin + '/tunnel/' + btoa(xored);
                }

                // Intercepte les clics sur les liens
                document.addEventListener('click', e => {
                    const a = e.target.closest('a');
                    if (a && a.href) {
                        e.preventDefault();
                        window.location.href = proxyUrl(a.href);
                    }
                }, true);

                // Intercepte les formulaires
                document.addEventListener('submit', e => {
                    const form = e.target;
                    form.action = proxyUrl(form.action);
                }, true);
            })();
            </script>`;

            html = html.replace('<head>', '<head>' + rewriterScript);
            return res.send(html);
        }

        return res.send(response.data);
    } catch (e) {
        return res.status(500).send("Erreur de tunnel");
    }
});

// CATCH-ALL : Répare les requêtes de jeux/vidéos (fichiers .ts, .m3u8, .wasm)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTargetOrigin) return res.status(404).send();
    const repairUrl = lastTargetOrigin + req.url;
    
    try {
        const response = await axios({
            method: req.method,
            url: repairUrl,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0' },
            validateStatus: false
        });
        res.headers(response.headers);
        return res.send(response.data);
    } catch (e) { res.status(404).send(); }
});

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
