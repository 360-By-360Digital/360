#!/bin/bash
# 360 Auto-Patcher — run from repo root
# Fixes: back button + auth-fix.js on all subpages

PAGES=("ai/ai.html" "weather/weather.html" "translator/translator.html" "url-shortener/url-shortener.html" "stocks/stocks.html" "chat/chat.html" "games/games.html")

# If your pages are flat (not in subdirs), use these instead:
FLAT_PAGES=("ai.html" "weather.html" "translator.html" "url-shortener.html" "stocks.html" "chat.html" "games.html")

echo "=== 360 Patch Script ==="
echo ""
echo "Applying back button fix and auth-fix.js injection..."
echo ""

for page in "${FLAT_PAGES[@]}"; do
  if [ -f "$page" ]; then
    # Fix back button
    sed -i "s/onclick=\"window\.location\.href='\.\.\/'\"/onclick=\"history.length > 1 ? history.back() : window.location.href='..\/'\"/g" "$page"
    
    # Inject auth-fix.js after main.js (only if not already present)
    if ! grep -q "auth-fix.js" "$page"; then
      sed -i 's|<script src="\.\./main\.js"></script>|<script src="../main.js"></script>\n  <script src="../auth-fix.js"></script>|g' "$page"
    fi
    
    echo "✓ Patched: $page"
  else
    echo "⚠ Not found: $page (skipping)"
  fi
done

echo ""
echo "Done! Check your pages."
