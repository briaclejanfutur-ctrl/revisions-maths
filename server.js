const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastDomain = "https://discord.com"; // Par défaut sur Discord

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
    <title>ENT - Portail de Communication</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #0b0e14; margin: 0; font-family: 'Segoe UI', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #1a1d23; padding: 12px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #5865f2; box-shadow: 0 4px 15px rgba(0,0,0,0.4); z-index: 9999; }
        input { flex: 1; background: #0b0e14; border: 1px solid #333; color: #5865f2; padding: 10px 15px; border-radius: 6px; outline: none; font-size: 14px; transition: 0.3s; }
        input:focus { border-color: #5865f2; box-shadow: 0 0 10px rgba(88, 101, 242, 0.2); }
        button { background: #5865f2; color: white; padding: 10px 25px; border-radius: 6px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; text-transform: uppercase; font-size: 12px; }
        button:hover { background: #4752c4; transform: scale(1.02); }
        #container { flex: 1; position: relative; background: #36393f; }
        iframe { width: 100%; height: 100%; border: none; }
        #loading { position: absolute; top:0; left:0; width:100%; height:3px; background: #5865f2; display:none; animation: load 2s infinite; }
        @keyframes load { 0% { left:-100%; width:100%; } 100% { left:100%; width:100%; } }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#5865f2; font-weight:900; font-size:20px; letter-spacing:-1px">ELITE_V11</div>
        <input type="text" id="targetUrl" placeholder="Entrez une URL ou 'discord.com'..." autocomplete="off">
        <button onclick="launch()">Exécuter</button>
    </div>
    <div id="container">
        <div id="loading"></div>
        <iframe id="viewport"></iframe>
    </div>

    <script>
        const vp = document.getElementById('viewport');
        const loader = document.getElementById('loading');

        function launch() {
            let url = document.getElementById('targetUrl').value.trim();
            if(!url) return;
            if(!url.startsWith('http')) url = 'https://' + url;
            
            loader.style.display = 'block';
            
            // Cryptage XOR 42
            const encoded = btoa(url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            vp.src = window.location.origin + '/tunnel/' + encodeURIComponent(encoded);
        }

        document.getElementById('targetUrl').addEventListener('keypress', e => { if(e.key === 'Enter') launch(); });
        vp.onload = () => { loader.style.display = 'none'; };

        // Touche Panique (ESC)
        window.onkeydown = (e) => { if(e.key === "Escape") window.location.href = "https://www.google.fr"; };
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// TUNNEL MAITRE (DÉDIÉ DISCORD)
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Flux corrompu");
    
    const urlObj = new URL(target);
    lastDomain = urlObj.origin;

    return proxyRequest(target, req, res);
});

// RÉPARATEUR DE LIENS AUTOMATIQUE (CATCH-ALL)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastDomain || req.url.includes('favicon')) return res.status(404).send();
    
    // Si Discord demande un asset (image/js), on devine le bon domaine
    let target = lastDomain + req.url;
    if (req.url.includes('avatars') || req.url.includes('icons')) {
        target = "https://cdn.discordapp.com" + req.url;
    }

    return proxyRequest(target, req, res);
});

async function proxyRequest(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'arraybuffer',
            headers: {
                ...req.headers,
                'host': new URL(url).host,
                'referer': lastDomain,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            validateStatus: false,
            timeout: 15000
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.status(response.status);
        res.headers(headers);

        // INJECTION DU SCRIPT DE RÉÉCRITURE (POUR QUE LES LIENS RESTENT DANS LE TUNNEL)
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let html = response.data.toString();
            const hook = `
            <base href="${url}/">
            <script>
            (function() {
                const KEY = 42;
                const PROXY = (u) => {
                    if(!u || u.startsWith('data:') || u.startsWith('blob:') || u.includes(window.location.host)) return u;
                    try {
                        const full = new URL(u, window.location.href).href;
                        return window.location.origin + '/tunnel/' + btoa(full.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                    } catch(e) { return u; }
                };
                
                // On détourne FETCH et XMLHttpRequest pour Discord
                const _f = window.fetch; window.fetch = (...a) => { a[0] = PROXY(a[0]); return _f(...a); };
                const _o = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function() { arguments[1] = PROXY(arguments[1]); return _o.apply(this, arguments); };
                
                // On détourne les clics
                document.addEventListener('click', e => {
                    const a = e.target.closest('a');
                    if(a && a.href) { e.preventDefault(); window.location.href = PROXY(a.href); }
                }, true);
            })();
            </script>`;
            return res.send(html.replace('<head>', '<head>' + hook));
        }

        return res.send(response.data);
    } catch (e) {
        return res.status(500).send("Erreur de tunnel Discord : " + e.message);
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
