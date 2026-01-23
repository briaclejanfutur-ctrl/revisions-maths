const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;

// Décodeur ultra-rapide
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
    <title>ENT - Accès Communication</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #36393f; margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        #nav { background: #2f3136; padding: 10px 20px; display: flex; gap: 15px; align-items: center; border-bottom: 1px solid #202225; }
        .status { width: 10px; height: 10px; background: #3ba55c; border-radius: 50%; box-shadow: 0 0 10px #3ba55c; }
        button { background: #5865f2; color: white; padding: 8px 25px; border-radius: 4px; font-weight: bold; border: none; cursor: pointer; transition: 0.2s; }
        button:hover { background: #4752c4; }
        iframe { flex: 1; border: none; background: #36393f; }
    </style>
</head>
<body>
    <div id="nav">
        <div class="status"></div>
        <div style="color:white; font-weight:bold; font-size:14px; letter-spacing:1px">DISCORD_SECURE_TUNNEL</div>
        <div style="flex:1"></div>
        <button onclick="launch()">DÉMARRER DISCORD</button>
    </div>
    <iframe id="view"></iframe>
    <script>
        function launch() {
            const target = "https://discord.com/app";
            const enc = btoa(target.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/discord/' + encodeURIComponent(enc);
        }
        // Panique (Touche P)
        window.addEventListener('keydown', e => { if(e.key.toLowerCase() === 'p') window.location.href = "https://www.google.fr"; });
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// LE TUNNEL SPÉCIAL DISCORD
fastify.all('/discord/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Bad Payload");

    try {
        const response = await axios({
            method: req.method,
            url: target,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://discord.com/',
                'Origin': 'https://discord.com'
            },
            validateStatus: false
        });

        // Suppression des headers de blocage
        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.status(response.status);
        res.headers(headers);

        // Injection du script de "Cimentation" pour Discord
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', chunk => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const hook = `
                <base href="https://discord.com/">
                <script>
                (function() {
                    const KEY = 42;
                    // Force toutes les requêtes internes de Discord vers notre tunnel
                    const _f = window.fetch;
                    window.fetch = (...args) => {
                        if(args[0].includes('discord') && !args[0].includes(window.location.host)) {
                            const url = new URL(args[0], 'https://discord.com').href;
                            args[0] = window.location.origin + '/discord/' + btoa(url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ KEY)).join(''));
                        }
                        return _f(...args);
                    };
                })();
                </script>`;
                res.send(html.replace('<head>', '<head>' + hook));
            });
        } else {
            return res.send(response.data);
        }
    } catch (e) {
        return res.status(500).send("Discord Tunnel Error");
    }
});

// Réparateur de liens (Catch-all pour les images et le JS de Discord)
fastify.setNotFoundHandler(async (req, res) => {
    let domain = "https://discord.com";
    if (req.url.includes('assets') || req.url.includes('.js') || req.url.includes('.css')) {
        domain = "https://discord.com";
    } else if (req.url.includes('avatars') || req.url.includes('icons')) {
        domain = "https://cdn.discordapp.com";
    }

    try {
        const response = await axios({
            method: req.method,
            url: domain + req.url,
            responseType: 'stream',
            validateStatus: false
        });
        res.headers(response.headers);
        return res.send(response.data);
    } catch (e) { res.status(404).send(); }
});

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
