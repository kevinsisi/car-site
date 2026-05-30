import json
import urllib.request
from pathlib import Path

ENV_FILE = Path('/home/kevin/DockerCompose/caddy/.env')
DOMAIN = 'sisihome.org'
HOSTNAME = 'mita.sisihome.org'


def read_token():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith('CF_API_TOKEN='):
            return line.split('=', 1)[1].strip().strip('"').strip("'")
    raise RuntimeError('CF_API_TOKEN not found')


def request_json(url, token, method='GET'):
    req = urllib.request.Request(
        url,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main():
    token = read_token()
    zones = request_json(f'https://api.cloudflare.com/client/v4/zones?name={DOMAIN}', token)
    zone_id = zones['result'][0]['id']
    records = request_json(
        f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?name={HOSTNAME}', token
    )['result']
    deleted = []
    for record in records:
        result = request_json(
            f'https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record["id"]}',
            token,
            method='DELETE',
        )
        deleted.append({'type': record['type'], 'name': record['name'], 'success': result.get('success')})
    print(json.dumps({'hostname': HOSTNAME, 'deleted': deleted}, indent=2))


if __name__ == '__main__':
    main()
