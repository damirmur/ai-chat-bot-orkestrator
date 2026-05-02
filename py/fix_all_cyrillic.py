#!/usr/bin/env python3
import re

with open('tools/file_replacer.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all non-ASCII characters and replace them
def replace_non_ascii(text):
    result = []
    i = 0
    while i < len(text):
        char = text[i]
        if ord(char) > 127:
            # Try to find common emoji patterns
            if '🔍' in text[max(0,i-5):i+5]:
                result.append('[🔍]')
            elif '📁' in text[max(0,i-5):i+5]:
                result.append('[📁]')
            else:
                # Replace with generic placeholder
                result.append('[' + hex(ord(char))[2:].zfill(4) + ']')
        else:
            result.append(char)
        i += 1
    return ''.join(result)

# More targeted replacements for known patterns
replacements = [
    ('рџ"Ќ', '[🔍]'),
    ('рџ"Ѓ', '[📁]'),  
    ('вќЌ', '[OK]'),
    ('вљ пёЏ', '[!] Warning'),
    ('\u043e?" Pattern:', '[🔍] Pattern: '),
    ('\u043e?" Files:', '[📁] Files: '),  
    ('\u043e? Searching for:', '[📁] Searching for: '),
    ('вќЋ', '[OK]'),
    ('вљ пёЏ File', '[!] Warning File'),
]

for old, new in replacements:
    content = content.replace(old, new)

# Replace any remaining non-ASCII with ASCII equivalents
content = re.sub(r'[^\x00-\x7F]+', ' [CHAR]', content)

with open('tools/file_replacer.mjs', 'w', encoding='utf-8') as f:
    f.write(content)

print("Non-ASCII characters replaced")
