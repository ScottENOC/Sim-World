from pathlib import Path
p = Path('js/society/medievalReligiousPolitics.js')
data = p.read_bytes()
count = data.count(b'\x00')
if count != 3:
    raise SystemExit(f'expected 3 NUL delimiters, found {count}')
p.write_bytes(data.replace(b'\x00', b'::'))
