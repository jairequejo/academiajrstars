import os
import re

base_dir = '/home/jair/Workspace/Projects/jr-stars/academiajrstars'

for root, dirs, files in os.walk(base_dir):
    for f in files:
        if f.endswith('.html'):
            path = os.path.join(root, f)
            rel_depth = os.path.relpath(root, base_dir)
            prefix = './' if rel_depth == '.' else '../' * len(rel_depth.split('/'))
            
            with open(path, 'r') as file:
                content = file.read()
            
            # Reemplazar href="/ algo" con href="prefix algo"
            content = re.sub(r'href="/([^/])', r'href="' + prefix + r'\1', content)
            # Reemplazar src="/ algo" con src="prefix algo"
            content = re.sub(r'src="/([^/])', r'src="' + prefix + r'\1', content)
            
            with open(path, 'w') as file:
                file.write(content)
            
            print(f"Fixed paths in {path}")
