import urllib.request, re
res = urllib.request.urlopen('https://iotfan.online/loginpage').read().decode()
chunks = re.findall(r'src="([^"]+\.js)"', res)
for chunk in chunks:
    try:
        url = chunk if chunk.startswith('http') else 'https://iotfan.online' + (chunk if chunk.startswith('/') else '/' + chunk)
        js = urllib.request.urlopen(url).read().decode()
        if 'iotfan.online' in js or '145.79.15.108' in js or '192.168' in js:
            print('Found in', chunk)
            m = re.findall(r'https?://[a-zA-Z0-9\.\:]+(?:/api)?', js)
            if m: print('URLs:', list(set(m)))
    except Exception as e:
        print(f"Error reading {chunk}: {e}")
