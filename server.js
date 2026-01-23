const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTargetOrigin = "https://discord.com";

const encode = (url) => {
    const xored = url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    return Buffer.from(xored).toString('base64');
};

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
    <title>ENT - Portail Communication</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #09090b; margin: 0; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #18181b; padding: 10px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #5865f2; z-index: 1000; }
        input { flex: 1; background: #09090b; border: 1px solid #27272a; color: white; padding: 8px 15px; border-radius: 6px; outline: none; }
        button { background: #5865f2; color: white; padding: 8px 25px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 12px; }
        #view-area { flex: 1; background: #313338; position: relative; }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#5865f2; font-weight:900; font-size:18px;">PHANTOM_V13</div>
        <input type="text" id="url" placeholder="Saisir https://discord.com/login ..." autocomplete="off">
        <button onclick="go()">OUVRIR LE TUNNEL</button>
    </div>
    <div id="view-area"><iframe id="vp"></iframe></div>
    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('vp').src = window.location.origin + '/gate/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

fastify.all('/gate/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Lien corrompu");
    lastTargetOrigin = new URL(target).origin;
    return proxy(target, req, res);
});

fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTargetOrigin || req.url.includes('favicon')) return res.status(404).send();
    return proxy(lastTargetOrigin + req.url, req, res);
});

async function proxy(url, req, res) {
    try {
        const response = await axios({
            method: req.method, url: url, data: req.body, responseType: 'arraybuffer',
            headers: { 
                ...req.headers, 'host': new URL(url).host, 'referer': lastTargetOrigin, 'origin': lastTargetOrigin,
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
            
            // LA MAGIE : On remplace tous les liens du code source par des liens proxifiés
            html = html.replace(/(src|href|action)=["'](\/|https?:\/\/)([^"']+)["']/g, (match, p1, p2, p3) => {
                let absoluteUrl = p2.startsWith('http') ? p2 + p3 : lastTargetOrigin + p2 + p3;
                return `${p1}="${window.location.origin}/gate/${encode(absoluteUrl)}"`;
            });

            const injection = `<base href="${lastTargetOrigin}/"><script>
                // Neutralisation des scripts de détection d'iframe
                Object.defineProperty(window, 'parent', { get: () => window });
                Object.defineProperty(window, 'top', { get: () => window });
            </script>`;
            return res.send(html.replace('<head>', '<head>' + injection));
        }
        return res.send(response.data);
    } catch (e) { return res.status(500).send("Erreur de Tunnel PHANTOM"); }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
