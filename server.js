const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

const appRedirects = [
  "360Do",
  "360Docs",
  "360Draw",
  "360Music",
  "360Notes",
  "360mail",
  "360vids",
  "360zone",
];

appRedirects.forEach((name) => {
  app.get(`/${name}`, (req, res) => res.redirect(302, `/apps/${name}.html`));
  app.get(`/${name}.html`, (req, res) => res.redirect(302, `/apps/${name}.html`));
});

// Enable CORS
app.use(cors());

// Serve EVERYTHING in the root folder.
// `extensions: ["html"]` makes a request for e.g. /ai or /games/spaceGlider
// resolve to ai.html / games/spaceGlider.html -- without this, every
// extensionless link on the site (sidebar nav, game cards, etc.) silently
// falls through to the SPA fallback below and just loads the homepage.
app.use(express.static(__dirname, { extensions: ["html"] }));

// Serve assets (html, css, js, images, etc.)
app.use("/assets", express.static(path.join(__dirname, "assets"), { extensions: ["html"] }));

// SPA fallback — only for routes with no file extension, so a genuinely
// missing page/asset doesn't get masked as a silent 200 (index.html).
app.get("*", (req, res, next) => {
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`360 Platform running on port ${PORT}`);
});
