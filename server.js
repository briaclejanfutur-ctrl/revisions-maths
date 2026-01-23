const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let currentTarget = "https://discord.com";

// Décodeur furtif
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
    <title>ENT - Révisions 2026</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body style="background:#09090b; margin:0; height:100vh; display:flex; flex-direction:column; overflow:hidden;">
    <div style="background:#18181b; padding:10px 20px; display:flex; gap:15px; align-items:center; border-bottom:2px solid #5865f2;">
        <div style="color:#5865f2; font-weight:900; font-size:18px;">VOID_V15</div>
        <input type="text" id="url" placeholder="Cible (ex: https://discord.com/app)" style="flex:1; background:#000; border:1px solid #27272a; color:#fff; padding:8px 15px; border-radius:6px; outline:none;">
        <button onclick="go()" style="background:#5865f2; color:white; padding:8px 20px; border-radius:6px; font-weight:bold; cursor:pointer; border:none;">TRANSPARENCE</button>
    </div>
    <div style="flex:1; position:relative; background:#313338;">
        <iframe id="vp" style="width:100%; height:100%; border:none;"></iframe>
    </div>
    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('vp').src = window.location.origin + '/v/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL MIROIR
fastify.all('/v/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("ERR_DECODE");
    currentTarget = new URL(target).origin;
    return tunnel(target, req, res);
});

// CATCH-ALL (Indispensable pour Discord)
fastify.setNotFoundHandler(async (req, res) => {
    if (!currentTarget || req.url.includes('favicon')) return res.status(404).send();
    return tunnel(currentTarget + req.url, req, res);
});

async function tunnel(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': currentTarget + '/',
                'Origin': currentTarget,
                'X-Discord-Locale': 'fr',
            },
            validateStatus: false,
            maxRedirects: 20
        });

        const headers = { ...response.headers };
        // Destruction des barrières
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.status(response.status);
        res.headers(headers);

        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const injection = `<base href="${currentTarget}/"><script>
                    window.parent = window; window.top = window;
                    // On empêche Discord de détecter le proxy
                    delete window.navigator.webdriver;
                </script>`;
                res.send(html.replace('<head>', '<head>' + injection));
            });
        } else {
            return res.send(response.data);
        }
    } catch (e) {
        // Fallback ultime : si axios échoue, on renvoie une erreur propre
        res.status(500).send("SERVICE_TEMPORARILY_OFFLINE_BY_TARGET");
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
