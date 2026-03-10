// google-oauth-listener.js
// Servidor local para recibir el token OAuth de Google

const http = require('http');
const url = require('url');

const PORT = 3000; // Debe coincidir con el redirect_uri

function startOAuthListener(callbacks = {}) {
    const onTokenReceived = callbacks.onToken || (() => {});
    const onCodeReceived = callbacks.onCode || (() => {});
    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        if (parsedUrl.pathname === '/callback') {
            // Flujo recomendado: Authorization Code con PKCE (code en query)
            const code = parsedUrl.query.code;
            const state = parsedUrl.query.state;
            if (code) {
                onCodeReceived({ code, state });
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                <body style="font-family: sans-serif; text-align: center; padding: 32px;">
                    <h2>Login completado</h2>
                    <p>Ya puedes volver a la aplicación.</p>
                </body>
                </html>
            `);
        } else if (parsedUrl.pathname === '/token') {
            // Compat: flujo implícito (no recomendado). Se mantiene por si acaso.
            const token = parsedUrl.query.access_token;
            if (token) {
                onTokenReceived(token);
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Token recibido');
        } else {
            res.writeHead(404);
            res.end('Not found');
        }
    });
    server.listen(PORT, () => {
        console.log(`Google OAuth listener activo en http://localhost:${PORT}/callback`);
    });
    return server;
}

module.exports = { startOAuthListener };
