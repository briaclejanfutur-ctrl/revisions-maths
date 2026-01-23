const fastify = require('fastify')({ logger: false });
const axios = require('axios');
const { PassThrough } = require('stream');

const XOR_KEY = 42;
let lastTarget = "https://discord.com";

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
    <title>ENT - Portail de Communication Sécurisé</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #09090b; margin: 0; font-family: 'Inter', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #18181b; padding: 10px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #5865f2; z-index: 1000; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        input { flex: 1; background: #09090b; border: 1px solid #27272a; color: #a1a1aa; padding: 8px 15px; border-radius: 6px; outline: none; font-size: 13px; transition: 0.2s; }
        input:focus { border-color: #5865f2; color: white; }
        button { background: #5865f2; color: white; padding: 8px 20px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        button:hover { background: #4752c4; box-shadow: 0 0 15px rgba(88, 101, 242, 0.4); }
        #view-area { flex: 1; position: relative; background: #313338; }
        iframe { width: 100%; height: 100%; border: none; visibility: visible; }
        #loader { position: absolute; top:0; left:0; width:100%; height:3px; background: #5865f2; display:none; animation: slide 2s infinite; }
        @keyframes slide { 0% { left:-100%; width:100%; } 100% { left:100%; width:100%; } }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#5865f2; font-weight:900; font-size:18px;">PHANTOM_V12</div>
        <input type="text" id="target" placeholder="Cible (ex: discord.com/app)..." autocomplete="off">
        <button onclick="launch()">Lancer le Tunnel</button>
    </div>
    <div id="view-area">
        <div id="loader"></div>
        <iframe id="viewport"></iframe>
    </div>
    <script>
        const vp = document.getElementById('viewport');
        const loader = document.getElementById('loader');

        function launch() {
            let url = document.getElementById('target').value.trim();
            if(!url) return;
            if(!url.startsWith('http')) url = 'https://' + url;
            loader.style.display = 'block';
            const encoded = btoa(url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            vp.src = window.location.origin + '/gate/' + encodeURIComponent(encoded);
        }

        vp.onload = () => { loader.style.display = 'none'; };
        document.getElementById('target').addEventListener('keypress', e => e.key === 'Enter' && launch());
        window.addEventListener('keydown', e => { if(e.key.toLowerCase() === 'p') window.location.href = "https://www.google.fr"; });
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL MAITRE (LOGIQUE DE REWRITING PROFONDE)
fastify.all('/gate/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux invalide");
    
    lastTarget = new URL(target).origin;
    return proxyRequest(target, req, res);
});

// CATCH-ALL (Indispensable pour charger les scripts de login de Discord)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTarget || req.url.includes('favicon')) return res.status(404).send();
    return proxyRequest(lastTarget + req.url, req, res);
});

async function proxyRequest(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                ...req.headers,
                'host': new URL(url).host,
                'referer': lastTarget,
                'origin': lastTarget,
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

        // INJECTION DU SCRIPT "GHOST" (Le cerveau du proxy)
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            const pt = new PassThrough();
            let html = '';
            response.data.on('data', chunk => html += chunk.toString());
            response.data.on('end', () => {
                const hook = `
                <base href="${lastTarget}/">
                <script>
                (function() {
                    const KEY = 42;
                    const PROXY = (u) => {
                        if(!u || u.startsWith('data:') || u.startsWith('blob:') || u.includes(window.location.host)) return u;
                        try {
                            const full = new URL(u, "${lastTarget}").href;
                            return window.location.origin + '/gate/' + btoa(full.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                        } catch(e) { return u; }
                    };

                    // Détournement des fonctions de navigation pour le login
                    const _f = window.fetch; window.fetch = (...a) => { a[0] = PROXY(a[0]); return _f(...a); };
                    const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function() { arguments[1] = PROXY(arguments[1]); return _o.apply(this, arguments); };
                    
                    // Empêcher Discord de détecter l'iframe
                    Object.defineProperty(window, 'parent', { get: () => window });
                    Object.defineProperty(window, 'top', { get: () => window });
                })();
                </script>`;
                res.send(html.replace('<head>', '<head>' + hook));
            });
        } else {
            return res.send(response.data);
        }
    } catch (e) {
        return res.status(500).send("Erreur de Tunnel PHANTOM");
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
