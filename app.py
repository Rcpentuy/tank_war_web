from flask import Flask
from flask_socketio import SocketIO
from flask_cors import CORS
from flask import render_template, send_from_directory
import threading
import sys
import select

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
from console_commands import process_command

@app.route('/test')
def test():
    return "服务器正常运行"

def console_input():
    print("控制台输入线程已启动")
    while True:
        # 使用 select 来检查是否有输入，设置超时为 0.1 秒
        ready, _, _ = select.select([sys.stdin], [], [], 0.1)
        if ready:
            command = sys.stdin.readline().strip()
            if command:
                print(f"收到命令: {command}")
                process_command(command)
        else:
            # 如果没有输入，让出 CPU 时间片
            socketio.sleep(0)

console_thread = None

def start_console_thread():
    global console_thread
    if console_thread is None or not console_thread.is_alive():
        console_thread = threading.Thread(target=console_input, daemon=True)
        console_thread.start()
        
if __name__ == '__main__':
    
    try:
        socketio.run(app, host='0.0.0.0', port=25000, debug=False)
    except KeyboardInterrupt:
        print("正在关闭服务器...")
    finally:
        socketio.stop()