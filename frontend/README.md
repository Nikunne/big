# bigdick.fyi frontend

React + TypeScript + Vite single-page app.

## Development

Start the central user database API from the repo root:

```sh
npm run server
```

Then start the frontend from this directory:

```sh
npm run dev
```

For local development without nginx, point Vite at the API:

```sh
VITE_API_BASE_URL=http://localhost:3001 npm run dev
```

## Production build

```sh
npm run build
```

The generated files are written to `dist/`.

## Nginx deploy

This app uses browser-side routes such as `/users/niklas`. Nginx must serve
`index.html` for those direct URL requests, otherwise reloading or opening a
deep link returns nginx's 404 page.

The app also uses a central SQLite-backed user API. Run the API server with:

```sh
npm run server
```

Use `nginx.conf` when serving `dist/` with nginx. It proxies `/api/` to the
Node server and keeps the single-page app fallback:

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:3001;
}

location / {
  try_files $uri $uri/ /index.html;
}
```
