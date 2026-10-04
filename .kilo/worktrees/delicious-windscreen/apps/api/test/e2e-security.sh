#!/usr/bin/env bash
# End-to-end security + checkout checks against a live API (default :4100).
#   bash apps/api/test/e2e-security.sh [API_URL]
# Needs the seeded accounts (pnpm db:seed). Creates test data: one upload
# (deleted again), one COD order on demo-store, 2FA toggled on then off for
# the platform admin. Takes ~2.5 minutes (it waits out rate-limit windows).
# Exits non-zero if any check fails.
API=${1:-http://localhost:4100}
ADMIN_ORIGIN=http://localhost:3000
T=$(mktemp -d)
PASS=0; FAIL=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1  -- $2"; FAIL=$((FAIL+1)); }
code() { curl -s -o "$T/body" -w "%{http_code}" "$@"; }
body() { cat "$T/body"; }
totp() { node -e "const {authenticator}=require(require('path').resolve(process.cwd(),'apps/api/node_modules/otplib')); console.log(authenticator.generate(process.argv[1]))" "$1"; }

OWNER='{"email":"owner@shopcycle.test","password":"password123"}'
ADMIN='{"email":"admin@shopcycle.platform","password":"superadmin123"}'

echo "== Sessions =="
c=$(code -c $T/owner -X POST $API/api/auth/login -H 'content-type: application/json' -H "origin: $ADMIN_ORIGIN" -d "$OWNER")
[ "$c" = 200 ] && ok "owner login" || bad "owner login" "$c $(body)"
grep -q "SameSite=Lax" $T/owner 2>/dev/null || grep -qi "lax" <(curl -s -D - -o /dev/null -X POST $API/api/auth/login -H 'content-type: application/json' -d "$OWNER") && ok "session cookie is SameSite=Lax" || bad "cookie SameSite" "not Lax"
c=$(code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"OWNER@ShopCycle.Test","password":"password123"}')
[ "$c" = 200 ] && ok "email is case-insensitive" || bad "case-insensitive email" "$c"
c=$(code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"nobody-x@shopcycle.test","password":"password123"}')
[ "$c" = 401 ] && ok "unknown email → same 401 as wrong password" || bad "unknown email" "$c"

echo "== Cross-site request forgery =="
c=$(code -b $T/owner -X POST $API/api/auth/switch-store -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{"storeId":"x"}')
[ "$c" = 403 ] && ok "POST from a foreign Origin is refused" || bad "foreign origin" "$c"
c=$(code -b $T/owner -X POST $API/api/auth/switch-store -H 'content-type: application/json' -H "origin: $ADMIN_ORIGIN" -d '{"storeId":"x"}')
[ "$c" = 404 ] && ok "same POST from the admin Origin gets through (404 = reached handler)" || bad "admin origin" "$c"

echo "== Uploads =="
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > $T/evil.svg
c=$(code -b $T/owner -H "origin: $ADMIN_ORIGIN" -X POST $API/api/files/upload -F "file=@$T/evil.svg;type=image/svg+xml")
[ "$c" = 400 ] && ok "SVG upload rejected" || bad "SVG upload" "$c $(body)"
printf '<html><script>alert(1)</script></html>' > $T/evil.jpg
c=$(code -b $T/owner -H "origin: $ADMIN_ORIGIN" -X POST $API/api/files/upload -F "file=@$T/evil.jpg;type=image/jpeg")
[ "$c" = 400 ] && ok "HTML disguised as image/jpeg rejected (bytes checked, not the label)" || bad "disguised html" "$c"
node -e "require('fs').writeFileSync('$T/real.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64'))"
c=$(code -b $T/owner -H "origin: $ADMIN_ORIGIN" -X POST $API/api/files/upload -F "file=@$T/real.png;filename=evil.html;type=text/html")
url=$(body | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).file.url)}catch{}})")
case "$url" in *.png) ok "real PNG named evil.html is stored as .png ($c)";; *) bad "png extension" "$c $url";; esac
if [ -n "$url" ]; then
  h=$(curl -sI "$url")
  echo "$h" | grep -qi "content-type: image/png" && ok "upload served as image/png" || bad "upload content-type" "$(echo "$h" | grep -i content-type)"
  echo "$h" | grep -qi "sandbox" && ok "upload served with sandboxing CSP" || bad "upload CSP" "missing"
  fid=$(curl -s -b $T/owner "$API/api/files" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const f=JSON.parse(s).files.find(f=>f.url==='$url');console.log(f?f.id:'')})")
  [ -n "$fid" ] && curl -s -o /dev/null -b $T/owner -X DELETE -H "origin: $ADMIN_ORIGIN" "$API/api/files/$fid"
fi

echo "== Premium gating (demo store has no plan) =="
c=$(code -b $T/owner $API/api/meta-ads/campaigns)
[ "$c" = 403 ] && body | grep -q plan_upgrade_required && ok "Meta Ads API refused on non-Premium store" || bad "meta-ads gate" "$c $(body)"
c=$(code -b $T/owner $API/api/whatsapp/messages)
[ "$c" = 403 ] && ok "WhatsApp API refused on non-Premium store" || bad "whatsapp gate" "$c"
c=$(code -b $T/owner -X POST $API/api/apps/meta-ads/install -H 'content-type: application/json' -H "origin: $ADMIN_ORIGIN" -d '{"settings":{}}')
[ "$c" = 403 ] && ok "installing a Premium app refused" || bad "premium install" "$c $(body)"
curl -s -b $T/owner $API/api/apps | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).apps;const m=a.find(x=>x.key==='meta-ads');const g=a.find(x=>x.key==='google-analytics');process.exit(m.locked&&m.premium&&!g.locked?0:1)})" && ok "catalog marks Premium apps locked, others open" || bad "catalog flags" ""

echo "== Console separation (token audience) =="
code -c $T/admin -X POST $API/api/auth/super-admin-login -H 'content-type: application/json' -d "$ADMIN" >/dev/null
ptok=$(grep shopcycle_superadmin_session $T/admin | awk '{print $7}')
stok=$(grep -w shopcycle_session $T/owner | awk '{print $7}')
c=$(code -H "cookie: shopcycle_session=$ptok" $API/api/auth/me)
[ "$c" = 401 ] && ok "platform token refused by the seller admin" || bad "platform→seller" "$c"
c=$(code -H "cookie: shopcycle_superadmin_session=$stok" $API/api/auth/super-admin-me)
[ "$c" = 401 ] && ok "seller token refused by the platform console" || bad "seller→platform" "$c"

echo "== Platform 2FA =="
setup=$(curl -s -b $T/admin -X POST $API/api/super-admin/security/2fa/setup -H "origin: http://localhost:3003")
key=$(echo "$setup" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.manualKey||'');if(!j.qrDataUrl?.startsWith('data:image/png'))process.exit(1)})") && ok "2FA setup returns a QR code + key" || bad "2FA setup" "$setup"
c=$(code -b $T/admin -X POST $API/api/super-admin/security/2fa/confirm -H 'content-type: application/json' -H "origin: http://localhost:3003" -d "{\"code\":\"$(totp $key)\"}")
[ "$c" = 200 ] && ok "2FA confirmed with a real authenticator code" || bad "2FA confirm" "$c $(body)"
c=$(code -X POST $API/api/auth/super-admin-login -H 'content-type: application/json' -d "$ADMIN")
chal=$(body | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.requiresTwoFactor?j.challengeToken:'')})")
[ -n "$chal" ] && ! body | grep -q '"user"' && ok "password alone no longer signs in — challenge issued, no session" || bad "2FA challenge" "$(body)"
c=$(code -H "cookie: shopcycle_superadmin_session=$chal" $API/api/auth/super-admin-me)
[ "$c" = 401 ] && ok "challenge token can't be used as a session" || bad "challenge as session" "$c"
c=$(code -X POST $API/api/auth/super-admin-login/verify -H 'content-type: application/json' -d "{\"challengeToken\":\"$chal\",\"code\":\"000000\"}")
[ "$c" = 401 ] && ok "wrong 2FA code refused" || bad "wrong code" "$c"
good=$(totp $key)
c=$(code -c $T/admin2 -X POST $API/api/auth/super-admin-login/verify -H 'content-type: application/json' -d "{\"challengeToken\":\"$chal\",\"code\":\"$good\"}")
[ "$c" = 200 ] && ok "correct 2FA code signs in" || bad "correct code" "$c $(body)"
code -X POST $API/api/auth/super-admin-login -H 'content-type: application/json' -d "$ADMIN" >/dev/null
chal2=$(body | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{console.log(JSON.parse(s).challengeToken||'')})")
c=$(code -X POST $API/api/auth/super-admin-login/verify -H 'content-type: application/json' -d "{\"challengeToken\":\"$chal2\",\"code\":\"$good\"}")
[ "$c" = 401 ] && ok "same code can't be replayed" || bad "replay" "$c"
# Turn 2FA back off so the documented dev login in .env keeps working.
sleep 31; c=$(code -b $T/admin2 -X POST $API/api/super-admin/security/2fa/disable -H 'content-type: application/json' -H "origin: http://localhost:3003" -d "{\"code\":\"$(totp $key)\"}")
[ "$c" = 200 ] && ok "2FA disabled again (needs a fresh code)" || bad "2FA disable" "$c $(body)"
c=$(code -b $T/admin2 $API/api/auth/super-admin-me)
[ "$c" = 401 ] && ok "disabling 2FA ended existing platform sessions" || bad "disable revokes" "$c"

echo "== Audit log =="
code -c $T/admin3 -X POST $API/api/auth/super-admin-login -H 'content-type: application/json' -d "$ADMIN" >/dev/null
curl -s -b $T/admin3 "$API/api/super-admin/audit-logs?limit=20" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s).entries.map(e=>e.action);const need=['auth.2fa_enabled','auth.2fa_failed','auth.2fa_disabled','auth.platform_sign_in'];const miss=need.filter(n=>!a.includes(n));console.log('      recorded:',[...new Set(a)].join(', '));process.exit(miss.length?1:0)})" && ok "2FA and sign-in events are in the audit log" || bad "audit log" "missing events"

echo "== Sign out everywhere =="
code -c $T/o1 -X POST $API/api/auth/login -H 'content-type: application/json' -d "$OWNER" >/dev/null
code -c $T/o2 -X POST $API/api/auth/login -H 'content-type: application/json' -d "$OWNER" >/dev/null
c=$(code -b $T/o2 -X POST $API/api/auth/logout-everywhere -H "origin: $ADMIN_ORIGIN")
[ "$c" = 200 ] || bad "logout-everywhere call" "$c"
c=$(code -b $T/o1 $API/api/auth/me)
[ "$c" = 401 ] && ok "another device's session is revoked" || bad "revocation" "$c"

echo "== Cart in Postgres + checkout =="
# "Sign out everywhere" above revoked the earlier owner session — start fresh.
code -c $T/owner -X POST $API/api/auth/login -H 'content-type: application/json' -d "$OWNER" >/dev/null
vid=$(curl -s -b $T/owner "$API/api/products?pageSize=50" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).products.find(p=>p.status==='active'&&p.variants?.length);console.log(p?p.variants[0].id:'')})")
cart=$(curl -s -X POST $API/api/storefront/demo-store/cart/add -H 'content-type: application/json' -d "{\"variantId\":\"$vid\",\"quantity\":2}")
cid=$(echo "$cart" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const c=JSON.parse(s).cart;console.log(c.item_count===2?c.cartId:'')})")
[ -n "$cid" ] && ok "add to cart (2 items) persisted" || bad "add to cart" "$cart"
n=$(curl -s "$API/api/storefront/demo-store/cart?cartId=$cid" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).cart.item_count))")
[ "$n" = 2 ] && ok "cart reads back from Postgres" || bad "cart read" "$n"
order=$(curl -s -X POST $API/api/storefront/demo-store/checkout -H 'content-type: application/json' -d "{\"cartId\":\"$cid\",\"email\":\"e2e-test@shopcycle.test\",\"phone\":\"9999999999\",\"shippingName\":\"E2E Test\",\"shippingAddress1\":\"1 Test St\",\"shippingCity\":\"Pune\",\"shippingProvince\":\"MH\",\"shippingZip\":\"411001\",\"shippingCountry\":\"IN\",\"paymentMethod\":\"cod\"}")
echo "$order" | grep -q '"orderNumber"' && ok "COD checkout places an order ($(echo "$order" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const o=j.order||j;console.log('#'+o.orderNumber)})"))" || bad "checkout" "$order"
n=$(curl -s "$API/api/storefront/demo-store/cart?cartId=$cid" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).cart.item_count))")
[ "$n" = 0 ] && ok "cart cleared after order" || bad "cart clear" "$n"

echo "== Brute force (fresh 1-minute window) =="
sleep 61
for i in $(seq 1 8); do code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"victim@shopcycle.test","password":"wrong'$i'"}' >/dev/null; done
c=$(code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"victim@shopcycle.test","password":"right"}')
[ "$c" = 429 ] && body | grep -q "failed sign-in" && ok "account locked after 8 wrong passwords: $(body | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).error))")" || bad "account lockout" "$c $(body)"
code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"a@b.c","password":"x"}' >/dev/null
c=$(code -X POST $API/api/auth/login -H 'content-type: application/json' -d '{"email":"a@b.c","password":"x"}')
[ "$c" = 429 ] && body | grep -q "Too many requests" && ok "per-IP limit: 11th login in a minute refused" || bad "IP rate limit" "$c $(body)"

echo; echo "RESULT: $PASS passed, $FAIL failed"
rm -rf "$T"
[ "$FAIL" = 0 ]
