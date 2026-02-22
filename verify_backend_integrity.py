
import sys
import os

# Add current directory to path so we can import backend modules
# Add backend directory to path so 'database' module can be found
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    print("Attempting to import backend.models...")
    import backend.models
    print("Successfully imported backend.models")
except Exception as e:
    print(f"Failed to import backend.models: {e}")

try:
    print("Attempting to import backend.schemas...")
    import backend.schemas
    print("Successfully imported backend.schemas")
except Exception as e:
    print(f"Failed to import backend.schemas: {e}")
