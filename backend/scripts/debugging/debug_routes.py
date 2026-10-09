
from fastapi.routing import APIRoute

from main import app


def list_routes():
    print("Listing all registered routes:")
    for route in app.routes:
        if isinstance(route, APIRoute):
            print(f"{route.methods} {route.path}")

if __name__ == "__main__":
    list_routes()
