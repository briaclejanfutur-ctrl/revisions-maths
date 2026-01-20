const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let currentOrigin = "";

const decode = (str) => {
    try {
        let b = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

const HTML_UI = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>ENT - Portail Académique</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #0f172a; margin: 0; font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #1e293b; padding: 12px 25px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #3b82f6; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 1000; }
        #url { flex: 1; background: #0f172a; border: 1px solid #334155; color: #3b82f6; padding: 10px 20px; border-radius: 8px; outline: none; font-weight: 500; }
        #url:focus { border-color: #3b82f6; box-shadow: 0 0 10px rgba(59, 130, 246, 0.3); }
        button { background: #3b82f6; color: white; padding: 10px 30px; border-radius: 8px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: 0.2s; }
        button:hover { background: #2563eb; transform: scale(1.02); }
        #view-container { flex: 1; position: relative; background: white; }
        iframe { width: 100%; height: 100%; border: none; }
        .panic-active { display: none !important; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#3b82f6; font-weight:900; font-size:22px; letter-spacing:-1px">AETHER_MAX</div>
        <input type="text" id="url" placeholder="Saisir l'URL de la ressource (ex: m.youtube.com, crazygames.com)...">
        <button onclick="launch()">DÉVERROUILLER</button>
    </div>
    <div id="view-container">
        <iframe id="viewport"></iframe>
    </div>
    <script>
        function launch() {
            let val = document.getElementById('url').value.trim();
            if(!val) return;
            if(!val.startsWith('http')) val = 'https://' + val;
            const encoded = btoa(val.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('viewport').src = window.location.origin + '/gate/' + encodeURIComponent(encoded);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && launch());
        window.onkeydown = (e) => { if(e.key === "Escape") window.location.href = "https://www.google.fr"; };
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL MAITRE
fastify.all('/gate/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux invalide");

    const urlObj = new URL(target);
    currentOrigin = urlObj.origin;

    return doProxy(target, req, res);
});

// RÉPARATEUR DE LIENS (INDISPENSABLE POUR LES JEUX/VIDÉOS)
fastify.setNotFoundHandler(async (req, res) => {
    if (!currentOrigin || req.url.includes('favicon')) return res.status(404).send();
    return doProxy(currentOrigin + req.url, req, res);
});

async function doProxy(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'arraybuffer',
            headers: {
                ...req.headers,
                'host': new URL(url).host,
                'referer': currentOrigin,
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

        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let html = response.data.toString();
            // L'INJECTION SUPRÊME : RÉÉCRIT LE COMPORTEMENT DU NAVIGATEUR
            const script = `
            <base href="${currentOrigin}/">
            <script>
            (function() {
                const KEY = 42;
                const PROXY = (u) => {
                    if(!u || u.startsWith('data:') || u.startsWith('blob:')) return u;
                    try {
                        const full = new URL(u, window.location.href).href;
                        if(full.includes(window.location.host)) return u;
                        return window.location.origin + '/gate/' + btoa(full.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                    } catch(e) { return u; }
                };
                // Capture FETCH, XHR et CLICS
                const _f = window.fetch; window.fetch = (...a) => { a[0] = PROXY(a[0]); return _f(...a); };
                const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function() { arguments[1] = PROXY(arguments[1]); return _o.apply(this, arguments); };
                document.addEventListener('click', e => {
                    const a = e.target.closest('a');
                    if(a && a.href) { e.preventDefault(); window.location.href = PROXY(a.href); }
                }, true);
            })();
            </script>`;
            return res.send(html.replace('<head>', '<head>' + script));
        }
        return res.send(response.data);
    } catch (e) { return res.status(500).send("Erreur de Tunnel : " + e.message); }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
