
from main import app
from fastapi.routing import APIRoute

def list_routes():
    print("Listing all registered routes:")
    for route in app.routes:
        if isinstance(route, APIRoute):
            print(f"{route.methods} {route.path}")

if __name__ == "__main__":
    list_routes()
