const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let globalTargetOrigin = "";

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
    <title>ENT - Espace de Travail Numérique</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; margin: 0; font-family: 'Segoe UI', sans-serif; height: 100vh; display: flex; flex-direction: column; }
        #nav { background: #1e3a8a; padding: 12px 25px; display: flex; gap: 15px; align-items: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; }
        #url { flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; padding: 10px 15px; border-radius: 6px; outline: none; }
        #url::placeholder { color: rgba(255,255,255,0.5); }
        button { background: #3b82f6; color: white; padding: 10px 25px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; }
        button:hover { background: #2563eb; transform: translateY(-1px); }
        iframe { flex: 1; border: none; background: white; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:white; font-weight:900; font-size:20px;">CORE_V8</div>
        <input type="text" id="url" placeholder="Rechercher un cours ou entrer une URL (YouTube, TikTok, CrazyGames)...">
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
        window.addEventListener('keydown', e => {
            if(e.key.toLowerCase() === 'p') window.location.href = "https://www.google.fr/search?q=calcul+integral+exercice";
        });
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// TUNNEL INTELLIGENT
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux Invalide");
    
    const urlObj = new URL(target);
    globalTargetOrigin = urlObj.origin;

    return doProxy(target, req, res);
});

// CATCH-ALL (RÉPARE LES REQUÊTES DYNAMIQUES DES JEUX ET VIDÉOS)
fastify.setNotFoundHandler(async (req, res) => {
    if (!globalTargetOrigin || req.url.includes('favicon')) return res.status(404).send();
    return doProxy(globalTargetOrigin + req.url, req, res);
});

async function doProxy(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                ...req.headers,
                'host': new URL(url).host,
                'referer': globalTargetOrigin,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: false
        });

        // Suppression des verrous de sécurité
        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.status(response.status);
        res.headers(headers);

        // INJECTION DU "CERVEAU ESPION" (Uniquement dans le HTML)
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const hook = `
                <base href="${globalTargetOrigin}/">
                <script>
                (function() {
                    const KEY = 42;
                    const PROXY = (u) => {
                        if(!u || u.startsWith('data:') || u.startsWith('blob:') || u.includes(window.location.hostname)) return u;
                        try {
                            const full = new URL(u, "${globalTargetOrigin}").href;
                            return window.location.origin + '/tunnel/' + btoa(full.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                        } catch(e) { return u; }
                    };

                    // Détournement de FETCH et XHR (Pour TikTok et les Jeux)
                    const _fetch = window.fetch;
                    window.fetch = (...args) => {
                        args[0] = PROXY(args[0]);
                        return _fetch(...args);
                    };

                    const _open = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function() {
                        arguments[1] = PROXY(arguments[1]);
                        return _open.apply(this, arguments);
                    };

                    // Forcer les liens
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
    } catch (e) { return res.status(500).send("Tunnel Blocked"); }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
