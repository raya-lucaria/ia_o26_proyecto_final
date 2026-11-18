"""Ejemplo: responde en http://localhost:8000. Cámbialo por tu proyecto."""

from http.server import BaseHTTPRequestHandler, HTTPServer


class Hola(BaseHTTPRequestHandler):
    def do_GET(self):
        cuerpo = "Tu proyecto corre aquí. Cambia main.py por el tuyo.\n".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(cuerpo)


if __name__ == "__main__":
    print("Sirviendo en http://localhost:8000", flush=True)
    HTTPServer(("0.0.0.0", 8000), Hola).serve_forever()
