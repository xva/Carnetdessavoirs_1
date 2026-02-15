import { defineConfig } from 'vite';
import https from 'https';

export default defineConfig({
    plugins: [
        {
            name: 'google-images-proxy',
            configureServer(server) {
                server.middlewares.use('/api/google-images', (req, res) => {
                    const url = new URL(req.url, 'http://localhost');
                    const query = url.searchParams.get('q');

                    if (!query) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing query parameter' }));
                        return;
                    }

                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&hl=fr&num=20`;

                    const options = {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                            'Cookie': 'CONSENT=PENDING+987; SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmZyIAEaBgiAo_CmBg',
                        }
                    };

                    const makeRequest = (requestUrl, redirectCount = 0) => {
                        if (redirectCount > 5) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Too many redirects' }));
                            return;
                        }

                        https.get(requestUrl, options, (proxyRes) => {
                            // Follow redirects
                            if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers.location) {
                                let redirectUrl = proxyRes.headers.location;
                                if (redirectUrl.startsWith('/')) {
                                    const parsedUrl = new URL(requestUrl);
                                    redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
                                }
                                makeRequest(redirectUrl, redirectCount + 1);
                                return;
                            }

                            let body = '';
                            proxyRes.on('data', chunk => body += chunk);
                            proxyRes.on('end', () => {
                                // Extract image URLs from Google's HTML
                                const images = [];
                                const seen = new Set();

                                // Pattern: ["URL",width,height]
                                const imgRegex = /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)(?:\?[^"]*)?)",\s*(\d+),\s*(\d+)\]/gi;
                                let match;
                                while ((match = imgRegex.exec(body)) !== null) {
                                    const imgUrl = match[1];
                                    const w = parseInt(match[2]);
                                    const h = parseInt(match[3]);

                                    if (imgUrl.includes('gstatic.com') || imgUrl.includes('google.com') || imgUrl.includes('googleapis.com')) continue;
                                    if (w < 80 || h < 80) continue;
                                    if (seen.has(imgUrl)) continue;
                                    seen.add(imgUrl);

                                    images.push({ url: imgUrl, width: w, height: h });
                                }

                                // Fallback: extract encrypted thumbnails
                                if (images.length === 0) {
                                    const thumbRegex = /\["(https?:\/\/encrypted-tbn0\.gstatic\.com\/images\?[^"]+)"/g;
                                    while ((match = thumbRegex.exec(body)) !== null) {
                                        const thumbUrl = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
                                        if (!seen.has(thumbUrl)) {
                                            seen.add(thumbUrl);
                                            images.push({ url: thumbUrl, width: 200, height: 200 });
                                        }
                                    }
                                }

                                res.writeHead(200, {
                                    'Content-Type': 'application/json',
                                    'Access-Control-Allow-Origin': '*',
                                });
                                res.end(JSON.stringify({
                                    success: true,
                                    query: query,
                                    count: images.length,
                                    images: images.slice(0, 20)
                                }));
                            });
                        }).on('error', (err) => {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: err.message }));
                        });
                    };

                    makeRequest(searchUrl);
                });
            }
        }
    ]
});
