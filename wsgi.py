from app import app, socketio, start_console_thread
from game_logic import generate_walls, run_game_loop
import threading


# #这个似乎是必须的，并且不能移到if里面
# generate_walls()
run_game_loop()

# 使用守护线程启动控制台输入
console_thread = threading.Thread(target=start_console_thread, daemon=True)
console_thread.start()

if __name__ == "__main__":
    socketio.run(app)