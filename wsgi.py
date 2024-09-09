from server import app, socketio, generate_walls, run_game_loop

generate_walls()
run_game_loop()

if __name__ == "__main__":
    socketio.run(app)