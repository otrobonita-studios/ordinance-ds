// The headers that a server sends with every Ordinance DS page. scripts/serve.mjs sends them, the browser test runs
// under them, and the page "Secure by default" lists them from here, so the three cannot drift apart.
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const HEADERS = [
  { name: 'Content-Security-Policy', value: CSP, why: 'The browser loads styles, scripts, images and fonts from the site itself only, and runs no code that is written into a page.' },
  { name: 'X-Content-Type-Options', value: 'nosniff', why: 'The browser does not guess the type of a file.' },
  { name: 'Referrer-Policy', value: 'no-referrer', why: 'A link to another site does not tell that site which page the reader came from.' },
  { name: 'Cross-Origin-Opener-Policy', value: 'same-origin', why: 'A page from another site cannot reach into this one.' },
  { name: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(), usb=()', why: 'The pages cannot ask for the camera, the place, the microphone, a payment or a device.' },
  { name: 'Cache-Control', value: 'no-store', why: 'For local work: the browser always shows the newest build.' },
];
