#!/bin/sh
# Plays one full turn against a dev server. Usage: sh scripts/turn.sh [base_url]
set -e
B=${1:-http://localhost:8787}
J() { curl -s -H 'content-type: application/json' "$@"; }
G=$(J -X POST $B/api/games -d '{"code":"J1-D52TELAX-0000ZZ"}')
ID=$(echo "$G" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "game $ID"
J -X POST $B/api/games/$ID/bills -d '{"turn":0,"text":"Cut the federal gas tax in half for two years and pay for it with a new tax on private jets."}' | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][0];print('bill:',b['title'],b['tags'])"
J -X POST $B/api/games/$ID/bills/0/whip -d '{"turn":0}' | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][0];w=b['whip'];print('whip: expected yes %.1f filibuster %.2f'%(sum(w.values()),b['filibuster']));print('weakest D:',sorted([(w[s['id']],s['id']) for s in g['seated'] if s['party']=='D'])[0])"
SID=$(J $B/api/games/$ID | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][0];w=b['whip'];print(sorted([(w[s['id']],s['id']) for s in g['seated'] if s['party']=='D'])[0][1])")
J -X POST $B/api/games/$ID/bills/0/lobby -d "{\"turn\":0,\"senatorId\":\"$SID\",\"action\":\"pork\"}" | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][0];print('lobbied $SID -> %.2f capital %d'%(b['whip']['$SID'],g['capital']))"
J -X POST $B/api/games/$ID/bills/0/vote -d '{"turn":0}' | python3 -c "import sys,json;g=json.load(sys.stdin);b=g['bills'][0];print('vote:',sum(b['votes'].values()),'yes, passed' if b['passed'] else 'yes, FAILED');print('headline:',b.get('headline'));print('turn',g['turn'],'phase',g['phase'],'capital',g['capital'])"
J -X POST $B/api/games/$ID/bills/0/vote -d '{"turn":0}'; echo
