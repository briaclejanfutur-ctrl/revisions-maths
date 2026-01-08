const fastify = require('fastify')({ logger: false });
const path = require('path');
const axios = require('axios');

// Configuration des fichiers statiques
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/public/', // On change le préfixe pour éviter les conflits
});

// CLÉ XOR (42)
const XOR_KEY = 42;

const decodeUrl = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

// --- ROUTE FIX : FORCE L'AFFICHAGE DE L'INDEX ---
fastify.get('/', (req, reply) => {
    reply.sendFile('index.html');
});

// --- LE TUNNEL ---
fastify.all('/main/*', async (request, reply) => {
    const encodedUrl = request.params['*'];
    const targetUrl = decodeUrl(encodedUrl);

    if (!targetUrl) return reply.status(400).send("Erreur de flux.");

    try {
        const response = await axios({
            method: request.method,
            url: targetUrl,
            data: request.body,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        return reply.status(500).send("Erreur Tunnel: " + err.message);
    }
});

const start = async () => {
    try {
        const port = process.env.PORT || 10000;
        await fastify.listen({ port: port, host: '0.0.0.0' });
    } catch (err) {
        process.exit(1);
    }
};
start();
