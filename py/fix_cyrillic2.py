#!/usr/bin/env python3
with open('tools/file_replacer.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all Cyrillic characters with ASCII equivalents
replacements = [
    ('вќЌ', '[OK]'),
    ('вљ пёЏ', '[!] Warning'),
    ('\u0440\u045f\u0432\u041b"Ќ', '[🔍] Pattern'),
    ('\u0440\u045f\u0432\u041b"Ѓ Files', '[📁] Files'),  
    ('\u043e?���?', '[!] Warning'),
    ('\u043e?:', '[OK]'),
    ('\u043e?? Error:', 'Error:'),
    ('\u043e?" Pattern:', '[🔍] Pattern: '),
    ('\u043e?" Files:', '[📁] Files: '),  
    ('\u043e? Searching for:', '[📁] Searching for: '),
]

for old, new in replacements:
    content = content.replace(old, new)

with open('tools/file_replacer.mjs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Cyrillic replaced successfully")
