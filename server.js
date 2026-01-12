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

// INTERFACE NEUTRE (ZÉRO LOGO, ZÉRO RISQUE)
const HTML_UI = `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Maths Revisions - Portail</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; margin: 0; font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; }
        #header { background: #1f2937; color: white; padding: 10px 20px; display: flex; gap: 15px; align-items: center; }
        input { flex: 1; padding: 8px; border-radius: 4px; border: none; color: black; outline: none; }
        button { background: #3b82f6; color: white; padding: 8px 20px; border-radius: 4px; border: none; font-weight: bold; cursor: pointer; }
        iframe { flex: 1; border: none; background: white; }
    </style>
</head>
<body>
    <div id="header">
        <div style="font-weight: bold;">PORTAIL ÉDUCATIF</div>
        <input type="text" id="url" placeholder="Saisir l'adresse de la ressource...">
        <button onclick="go()">ACCÉDER</button>
    </div>
    <iframe id="view"></iframe>
    <script>
        function go() {
            let v = document.getElementById('url').value.trim();
            if(!v) return;
            if(!v.startsWith('http')) v = 'https://' + v;
            // Cryptage furtif
            const enc = btoa(v.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));
            document.getElementById('view').src = '/tunnel/' + encodeURIComponent(enc);
        }
        document.getElementById('url').addEventListener('keypress', e => e.key === 'Enter' && go());
    </script>
</body>
</html>
`;

fastify.get('/', (req, res) => res.type('text/html').send(HTML_UI));

// TUNNEL SÉCURISÉ AVEC FILTRAGE
fastify.all('/tunnel/*', async (req, res) => {
    const target = decode(req.params['*']);
    if (!target) return res.status(400).send("Lien invalide");
    
    // Protection : On refuse les sites PH ou de cul directement dans le décodeur
    if (target.includes('pornhub') || target.includes('sex')) {
        return res.status(403).send("Contenu bloqué par la politique de sécurité.");
    }

    lastTarget = new URL(target).origin;

    try {
        const response = await axios({
            method: req.method,
            url: target,
            data: req.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
                'Referer': lastTarget
            },
            validateStatus: false,
            timeout: 10000
        });

        const headers = { ...response.headers };
        // On détruit les headers qui permettent aux sites de nous forcer des trucs
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['content-encoding'];
        
        res.status(response.status);
        res.headers(headers);

        return res.send(response.data);
    } catch (e) {
        return res.status(500).send("Erreur de connexion à la ressource.");
    }
});

// Réparateur de liens (uniquement si on a un domaine valide)
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
