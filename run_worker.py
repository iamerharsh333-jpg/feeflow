import sys
import os

# Ensure backend directory is in sys.path so 'app' is resolvable from root
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.worker import main

if __name__ == "__main__":
    main()

