from . import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host=app.config["SETTINGS"].app_host, port=app.config["SETTINGS"].app_port)
