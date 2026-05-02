#!/usr/bin/env python3
import re

with open('tools/file_replacer.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Cyrillic characters with ASCII equivalents  
replacements = [
    ('вќЌ', '[OK]'),
    ('вљ пёЏ', '[!] Warning'),
    ('рџ"Ќ Pattern', '[🔍] Pattern'),
    ('рџ"Ѓ Files', '[📁] Files'),  
    ('рџ"Ќ Searching for', '[📁] Searching for'),
]

for old, new in replacements:
    content = content.replace(old, new)

with open('tools/file_replacer.mjs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Cyrillic replaced successfully")
