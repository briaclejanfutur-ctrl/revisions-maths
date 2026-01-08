const fastify = require('fastify')({ logger: false });
const path = require('path');
const axios = require('axios');

// 1. Gestion des fichiers statiques (ton interface HTML)
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/', 
});

// 2. Clé de cryptage XOR (doit être la même que dans ton index.html)
const XOR_KEY = 42;

const decodeUrl = (str) => {
    try {
        let b64 = Buffer.from(decodeURIComponent(str), 'base64').toString();
        return b64.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ XOR_KEY)).join('');
    } catch (e) { return null; }
};

// 3. Le Tunnel Ultra-Rapide (Catch-all pour éviter les 404)
fastify.all('/main/*', async (request, reply) => {
    const encodedUrl = request.params['*'];
    const targetUrl = decodeUrl(encodedUrl);

    if (!targetUrl) {
        return reply.status(400).send("Erreur de décodage du flux.");
    }

    try {
        const response = await axios({
            method: request.method,
            url: targetUrl,
            data: request.body,
            responseType: 'stream', // Vitesse maximale : on ne télécharge pas, on fait passer.
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': new URL(targetUrl).origin
            },
            validateStatus: false, // Ne pas crash si le site renvoie une erreur 404 ou 500
            maxRedirects: 5
        });

        // 4. Nettoyage des headers (Bypass des protections du lycée)
        const headers = { ...response.headers };
        delete headers['content-security-policy'];
        delete headers['x-frame-options'];
        delete headers['cross-origin-resource-policy'];
        delete headers['content-encoding']; // On laisse le navigateur gérer la compression

        reply.headers(headers);

        // 5. Injection de la balise <base> si c'est du HTML 
        // (Pour que les images et le CSS du site cible s'affichent correctement)
        if (headers['content-type'] && headers['content-type'].includes('text/html')) {
            let chunks = [];
            response.data.on('data', (chunk) => chunks.push(chunk));
            response.data.on('end', () => {
                let html = Buffer.concat(chunks).toString();
                const baseUrl = new URL(targetUrl).origin;
                const injection = `<base href="${baseUrl}/">`;
                html = html.replace('<head>', '<head>' + injection);
                reply.send(html);
            });
        } else {
            // Pour tout le reste (images, JS, vidéos), on pipe en direct
            return reply.send(response.data);
        }

    } catch (err) {
        console.error("Erreur Tunnel:", err.message);
        return reply.status(500).send("Le site cible refuse la connexion ou est inaccessible via le tunnel.");
    }
});

// 6. Démarrage du serveur (Adapté pour Render.com)
const start = async () => {
    try {
        const port = process.env.PORT || 8080;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`
        █▀▀█ █▀▀█ █▀▀ ▀▄▒▄▀
        █▄▄█ █▄▄█ █▀▀  ▒█▒ 
        ▀  ▀ █    ▀▀▀ ▄▀▒▀▄
        
        >>> APEX ENGINE V5 ONLINE
        >>> PORT: ${port}
        >>> STEALTH XOR KEY: ${XOR_KEY}
        `);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();