const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTarget = "";

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
    <title>Maths Revisions - Portail</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #111827; margin: 0; font-family: ui-sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        #header { background: #1f2937; color: white; padding: 12px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #3b82f6; z-index: 1000; }
        input { flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #374151; background: #0f172a; color: white; outline: none; font-size: 14px; }
        button { background: #2563eb; color: white; padding: 10px 25px; border-radius: 6px; font-weight: bold; cursor: pointer; transition: 0.2s; }
        button:hover { background: #1d4ed8; transform: scale(1.02); }
        iframe { flex: 1; border: none; background: white; }
    </style>
</head>
<body>
    <div id="header">
        <div style="font-weight: 900; color: #3b82f6; letter-spacing: -1px;">EDU_V10</div>
        <input type="text" id="url" placeholder="Rechercher une ressource (TikTok, YouTube, CrazyGames)..." autocomplete="off">
        <button onclick="go()">DÉVERROUILLER</button>
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
        window.addEventListener('keydown', e => { if(e.key === "Escape") window.location.href = "https://www.google.com"; });
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL (GESTIONNAIRE DE FLUX AVANCÉ)
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux invalide");
    
    lastTarget = new URL(target).origin;

    try {
        const response = await axios({
            method: req.method,
            url: target,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': lastTarget,
                'Range': req.headers.range // CRUCIAL POUR TIKTOK ET YOUTUBE
            },
            validateStatus: false,
            maxRedirects: 10
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        
        res.status(response.status);
        res.headers(headers);

        // --- INJECTION DU SCRIPT "INTERCEPTEUR" ---
        // Ce script détourne le cerveau de TikTok pour le forcer à rester dans le tunnel
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const hook = `
                <base href="${lastTarget}/">
                <script>
                (function() {
                    const KEY = 42;
                    const PROXY = (u) => {
                        if(!u || u.startsWith('data:') || u.startsWith('blob:') || u.includes(window.location.host)) return u;
                        try {
                            const full = new URL(u, "${lastTarget}").href;
                            return window.location.origin + '/tunnel/' + btoa(full.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                        } catch(e) { return u; }
                    };
                    // Détournement FETCH et XHR
                    const _f = window.fetch; window.fetch = (...a) => { a[0] = PROXY(a[0]); return _f(...a); };
                    const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function() { arguments[1] = PROXY(arguments[1]); return _o.apply(this, arguments); };
                    // Détournement des liens
                    document.addEventListener('click', e => {
                        const a = e.target.closest('a');
                        if(a && a.href) { e.preventDefault(); window.location.href = PROXY(a.href); }
                    }, true);
                })();
                </script>`;
                res.send(html.replace('<head>', '<head>' + hook));
            });
        } else {
            return res.send(response.data);
        }
    } catch (e) {
        return res.status(500).send("Erreur de Tunnel : " + e.message);
    }
});

// Réparateur de liens (Catch-all)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTarget || req.url.includes('favicon')) return res.status(404).send();
    try {
        const response = await axios({
            method: req.method,
            url: lastTarget + req.url,
            responseType: 'stream',
            validateStatus: false
        });
        res.headers(response.headers);
        return res.send(response.data);
    } catch (e) { res.status(404).send(); }
});

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
