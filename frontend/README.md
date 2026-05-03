# bigdick.fyi frontend

React + TypeScript + Vite single-page app.

## Development

```sh
npm run dev
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

Use `nginx.conf` when serving `dist/` with nginx. The required fallback is:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```
