const fastify = require('fastify')({ logger: false });
const axios = require('axios');

const XOR_KEY = 42;
let lastTarget = ""; // On garde en mémoire le site visité pour réparer les liens

const decode = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

const HTML_UI = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>APEX OMEGA</title>
    <style>
        body { background: #000; color: #00ffcc; font-family: 'Courier New', monospace; margin: 0; overflow: hidden; display: flex; flex-direction: column; height: 100vh; }
        #nav { background: #050505; padding: 10px; display: flex; gap: 10px; border-bottom: 1px solid #222; align-items: center; }
        input { flex: 1; background: #000; border: 1px solid #00ffcc; color: #00ffcc; padding: 8px; border-radius: 3px; outline: none; }
        button { background: #00ffcc; color: #000; border: none; padding: 8px 20px; font-weight: bold; cursor: pointer; border-radius: 3px; }
        iframe { flex: 1; border: none; background: #fff; }
    </style>
</head>
<body>
    <div id="nav">
        <div style="font-weight:bold; font-size:1.2rem; margin-right:10px">APEX_OMEGA</div>
        <input type="text" id="url" placeholder="DESTINATION URL (ex: wikipedia.org)...">
        <button onclick="go()">TUNNEL_START</button>
    </div>
    <iframe id="view"></iframe>
    <script>
        function go() {
            let v = document.getElementById('url').value;
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            const encoded = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/proxy/' + encodeURIComponent(encoded);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

// 1. Page d'accueil
fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// 2. Route de lancement (On définit le domaine cible)
fastify.all('/proxy/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Bad Stream");
    
    const urlObj = new URL(target);
    lastTarget = urlObj.origin; // On mémorise que tu es sur Google/YouTube/etc.
    
    return doProxy(target, req, res);
});

// 3. ROUTE MAGIQUE (Catch-All) : Récupère tous les liens cassés du site
fastify.setNotFoundHandler(async (req, res) => {
    if (!lastTarget) return res.status(404).send("No context");
    
    // On répare le lien en le renvoyant vers le site d'origine
    const repairUrl = lastTarget + req.url;
    return doProxy(repairUrl, req, res);
});

async function doProxy(url, req, res) {
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
            validateStatus: false
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        res.headers(headers);
        
        // Si c'est du HTML, on injecte une balise <base> pour aider le navigateur
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let html = response.data.toString();
            const injection = `<base href="${lastTarget}/">`;
            html = html.replace('<head>', '<head>' + injection);
            return res.send(html);
        }

        return res.send(response.data);
    } catch (e) {
        return res.status(500).send("Tunnel Error");
    }
}

fastify.listen({ port: process.env.PORT || 10000, host: '0.0.0.0' });
