const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTarget = "https://discord.com";

// Décodeur ultra-robuste
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
    <title>ENT - Révisions</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #09090b; margin: 0; font-family: sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #18181b; padding: 10px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 2px solid #5865f2; }
        input { flex: 1; background: #000; border: 1px solid #27272a; color: #fff; padding: 8px 15px; border-radius: 6px; outline: none; font-size: 13px; }
        button { background: #5865f2; color: white; padding: 8px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; border: none; font-size: 12px; }
        #view-area { flex: 1; background: #313338; position: relative; }
        iframe { width: 100%; height: 100%; border: none; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="color:#5865f2; font-weight:900; font-size:18px;">TITAN_V14</div>
        <input type="text" id="url" placeholder="Entrez l'URL (ex: https://discord.com/login) ..." autocomplete="off">
        <button onclick="go()">OUVRIR LE TUNNEL</button>
    </div>
    <div id="view-area"><iframe id="vp" name="vp"></iframe></div>
    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('vp').src = window.location.origin + '/gate/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
        window.onkeydown = e => { if(e.key === "Escape") window.location.href = "https://www.google.fr"; };
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL (VERSION AXIOS-TITAN)
fastify.all('/gate/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Erreur de décodage");
    
    lastTarget = new URL(target).origin;
    return proxyCore(target, req, res);
});

// CATCH-ALL (Répare tous les liens internes sans casser le JS)
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTarget || req.url.includes('favicon')) return res.status(404).send();
    
    // Détection intelligente du domaine Discord
    let finalUrl = lastTarget + req.url;
    if (req.url.includes('assets') || req.url.includes('.js')) finalUrl = "https://discord.com" + req.url;
    
    return proxyCore(finalUrl, req, res);
});

async function proxyCore(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Referer': lastTarget + '/',
                'Origin': lastTarget
            },
            validateStatus: false,
            timeout: 20000
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];

        res.status(response.status);
        res.headers(headers);

        // Injection HTML minimaliste (on ne touche à rien d'autre pour la stabilité)
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            const chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const injection = `<base href="${lastTarget}/"><script>
                    window.parent = window; window.top = window;
                </script>`;
                res.send(html.replace('<head>', '<head>' + injection));
            });
        } else {
            return res.send(response.data);
        }
    } catch (e) {
        // En cas d'erreur, on tente une redirection directe
        res.status(200).send(`<h1>Relance du tunnel...</h1><script>setTimeout(()=>location.reload(), 1000);</script>`);
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
