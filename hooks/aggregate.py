"""Additionne les tokens des transcripts Claude Code par jour, heure locale et source.

Écrit sur la sortie standard {"days": {"AAAA-MM-JJ": {"desktop": [24], "code": [24]}}}.
Tokens = entrée + écriture de cache + sortie; les lectures de cache ne comptent pas.
"""
import datetime
import json
import os
import sys

DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 8
FIELDS = ('input_tokens', 'cache_creation_input_tokens', 'output_tokens')

config = os.environ.get('CLAUDE_CONFIG_DIR') or os.path.expanduser('~/.claude')
root = os.path.join(config, 'projects')
first_day = datetime.date.today() - datetime.timedelta(days=DAYS - 1)
start = datetime.datetime.combine(first_day, datetime.time()).timestamp()

# Une requête est écrite sur plusieurs lignes (une par bloc de réponse) avec le
# même usage: on garde la plus grande valeur par requête.
requests = {}

for folder, _, names in os.walk(root):
    for name in names:
        if not name.endswith('.jsonl'):
            continue
        path = os.path.join(folder, name)
        try:
            if os.path.getmtime(path) < start:
                continue
            handle = open(path, encoding='utf-8', errors='replace')
        except OSError:
            continue
        with handle:
            for line in handle:
                if '"usage"' not in line or '"assistant"' not in line:
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(row, dict) or row.get('type') != 'assistant':
                    continue
                message = row.get('message') or {}
                usage = message.get('usage')
                if not isinstance(usage, dict):
                    continue
                try:
                    when = datetime.datetime.fromisoformat(
                        row['timestamp'].replace('Z', '+00:00')).astimezone()
                except (KeyError, AttributeError, ValueError):
                    continue
                if when.timestamp() < start:
                    continue
                tokens = sum(int(usage.get(field) or 0) for field in FIELDS)
                source = 'desktop' if row.get('entrypoint') == 'claude-desktop' else 'code'
                key = row.get('requestId') or message.get('id') or row.get('uuid')
                bucket = (when.strftime('%Y-%m-%d'), source, when.hour)
                if key not in requests or requests[key][0] < tokens:
                    requests[key] = (tokens, bucket)

days = {}
for tokens, (day, source, hour) in requests.values():
    entry = days.setdefault(day, {'desktop': [0] * 24, 'code': [0] * 24})
    entry[source][hour] += tokens

json.dump({'days': days}, sys.stdout)
