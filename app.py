from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from flask import render_template, send_from_directory


app = Flask(__name__, static_folder='static')
CORS(app)
socketio = SocketIO(app, async_mode='eventlet', websocket=True, ping_timeout=10, ping_interval=5, compression=True,cors_allowed_origins = '*')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

from socket_events import *

@app.route('/test')
def test():
    return "服务器正常运行"

if __name__ == '__main__':
    try:
        socketio.run(app, host='0.0.0.0', port=25000, debug=False)
    except KeyboardInterrupt:
        print("正在关闭服务器...")
    finally:
        socketio.stop()