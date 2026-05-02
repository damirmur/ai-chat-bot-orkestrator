#!/usr/bin/env python3
with open('test_file_replacer/data.json', 'rb') as f:
    content = f.read()
new_content = content.lstrip(b'\xef\xbb\xbf')
with open('test_file_replacer/data.json', 'wb') as f:
    f.write(new_content)
print('BOM removed')
