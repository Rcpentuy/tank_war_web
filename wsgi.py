from server import app, socketio, generate_walls, run_game_loop

#这个似乎是必须的，并且不能移到if里面
generate_walls()
run_game_loop()

if __name__ == "__main__":
    socketio.run(app)