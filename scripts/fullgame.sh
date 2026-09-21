#!/bin/sh
# Plays a whole Agenda game (10 bills) through the API and prints the game id. Usage: sh scripts/fullgame.sh [base_url]
set -e
B=${1:-http://localhost:5173}
J() { curl -s -H 'content-type: application/json' "$@"; }
ID=$(J -X POST $B/api/games -d '{"code":"J1-D50AELA3-FULL01"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
for T in 0 1 2 3 4 5 6 7 8 9; do
  J -X POST $B/api/games/$ID/bills -d "{\"turn\":$T,\"text\":\"\"}" > /dev/null
  J -X POST $B/api/games/$ID/bills/$T/whip -d "{\"turn\":$T}" > /dev/null
  J -X POST $B/api/games/$ID/bills/$T/vote -d "{\"turn\":$T}" | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][$T];print($T, b['title'], 'PASS' if b['passed'] else 'fail', sum(b['votes'].values()), 'phase', g['phase'])"
done
echo "GAME $ID"
