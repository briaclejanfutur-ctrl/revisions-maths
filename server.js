const fastify = require('fastify')({ logger: false });
const axios = require('axios');

// CLÉ XOR (42) - DOIT ÊTRE LA MÊME PARTOUT
const XOR_KEY = 42;

// --- LE CODE DE TON INTERFACE (HUD) ---
const HTML_UI = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>APEX // SECURE GATEWAY</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #050505; color: #fff; font-family: sans-serif; overflow: hidden; height: 100vh; margin:0; }
        #bar { height: 60px; background: #000; border-bottom: 1px solid #222; display: flex; align-items: center; padding: 0 20px; gap: 20px; }
        iframe { width: 100vw; height: calc(100vh - 60px); border: none; background: #fff; }
        input { background: #0a0a0a; border: 1px solid #333; color: #00ffcc; flex: 1; border-radius: 5px; padding: 5px 15px; outline: none; }
        button { background: #00ffcc; color: #000; font-weight: bold; padding: 5px 20px; border-radius: 5px; }
        #panic { position: fixed; inset: 0; background: white; z-index: 9999; display: none; }
    </style>
</head>
<body class="flex flex-col">
    <div id="bar">
        <div style="color:#00ffcc; font-weight:900; letter-spacing:-1px">APEX_v5</div>
        <input type="text" id="target" placeholder="ENTREZ URL (ex: google.com)...">
        <button onclick="launch()">CONNECT</button>
    </div>
    <div id="intro" style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#222">
        <div style="font-size:10rem; font-weight:900; font-style:italic">STLTH</div>
        <div style="letter-spacing:1em; font-size:10px">SECURE TUNNEL ACTIVE</div>
    </div>
    <iframe id="screen" style="display:none"></iframe>
    <div id="panic"><iframe src="https://www.wikipedia.org" style="width:100%; height:100%"></iframe></div>

    <script>
        function launch() {
            let url = document.getElementById('target').value;
            if(!url) return;
            if(!url.startsWith('http')) url = 'https://' + url;
            
            // Chiffrement XOR
            const xored = url.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join('');
            const encoded = btoa(xored);

            document.getElementById('intro').style.display = 'none';
            const s = document.getElementById('screen');
            s.style.display = 'block';
            s.src = '/main/' + encodeURIComponent(encoded);
        }
        window.addEventListener('keydown', e => {
            if(e.key.toLowerCase() === 'p') {
                const p = document.getElementById('panic');
                p.style.display = (p.style.display === 'block') ? 'none' : 'block';
            }
        });
        document.getElementById('target').addEventListener('keypress', e => e.key === 'Enter' && launch());
    </script>
</body>
</html>
`;

// --- LOGIQUE DU SERVEUR ---

const decodeUrl = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

// Route d'accueil : on envoie le HTML directement
fastify.get('/', (req, reply) => {
    reply.type('text/html').send(HTML_UI);
});

// Route du tunnel
fastify.all('/main/*', async (request, reply) => {
    const encodedUrl = request.params['*'];
    const targetUrl = decodeUrl(encodedUrl);

    if (!targetUrl) return reply.status(400).send("Flux invalide.");

    try {
        const response = await axios({
            method: request.method,
            url: targetUrl,
            data: request.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
            },
            validateStatus: false
        });

        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];

        reply.headers(headers);
        return reply.send(response.data);

    } catch (err) {
        return reply.status(500).send("Erreur: " + err.message);
    }
});

// Lancement
const start = async () => {
    try {
        const port = process.env.PORT || 10000;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log("APEX IS LIVE ON PORT " + port);
    } catch (err) {
        process.exit(1);
    }
};
start();
