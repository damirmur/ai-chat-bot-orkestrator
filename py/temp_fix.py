#!/usr/bin/env python3
import re

with open('tools/file_replacer.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Cyrillic emoji with ASCII equivalents  
replacements = {
    'СЂСџ"РЊ': '[рџ”§]',
    'РІСњРЊ': '[OK]',
    'РІС™ РїС‘РЏ': '[!] Warning',
    'СЂСџ"Рѓ': '[рџ“Ѓ] Files',
    'СЂСџ"РЊ': '[рџ”Ќ] Pattern',
}

for old, new in replacements.items():
    content = content.replace(old, new)

with open('tools/file_replacer.mjs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Cyrillic replaced successfully")
