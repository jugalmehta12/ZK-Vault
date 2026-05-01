import olefile
import re

files = [
    '1_CoverPage.doc',
    '2_Certi_CSE.doc',
    '3_Candidate declaration (1).doc',
    '4_Project Report Guidlines.doc',
]

for f in files:
    print(f"\n{'='*60}")
    print(f"FILE: {f}")
    print(f"{'='*60}")
    try:
        ole = olefile.OleFileIO(f)
        stream = ole.openstream('WordDocument')
        data = stream.read()
        text = data.decode('utf-8', errors='ignore')
        clean = re.sub(r'[^\x20-\x7E\n\r]', ' ', text)
        # Remove excessive whitespace
        clean = re.sub(r' {3,}', '  ', clean)
        clean = re.sub(r'\n{3,}', '\n\n', clean)
        print(clean[:3000])
        ole.close()
    except Exception as e:
        print(f"Error: {e}")
