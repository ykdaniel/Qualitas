
import os

log_path = "backend_error.log"

if os.path.exists(log_path):
    with open(log_path, 'rb') as f:
        # Read last 2000 bytes
        try:
            f.seek(-2000, os.SEEK_END)
        except OSError:
            f.seek(0)
        content = f.read().decode('utf-8', errors='ignore')
        print(content)
else:
    print("Log file not found")
