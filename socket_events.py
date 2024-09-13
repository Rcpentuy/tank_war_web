from app import socketio
from flask import request
from flask_socketio import emit
from game_state import players, bullets, walls, maze_info, wins, player_latencies, player_colors, TANK_WIDTH, TANK_HEIGHT
from game_logic import respawn_player, check_game_state, reset_game, handle_player_move, handle_fire
from utils import circle_rectangle_collision
from game_logic import lasers, generate_walls
import random
import time
import math

@socketio.on('player_join')
def handle_player_join(data):    
    player_id = request.sid
    if player_id in players:
        # 玩家已经存在，可能是重新连接
        players[player_id]['name'] = data['name']
    else:
        # 新玩家加入
        if player_id not in player_colors:
            player_colors[player_id] = f'#{random.randint(0, 0xFFFFFF):06x}'
        players[player_id] = {
            'x': 0,
            'y': 0,
            'angle': 0,
            'turret_angle': 0,
            'color': player_colors[player_id],
            'alive': True,
            'name': data['name']
        }
        if player_id not in wins:
            wins[player_id] = 0  # 初始化玩家胜利次数
    respawn_player(player_id)
    player_latencies[player_id] = 0  # 初始化延迟
    
    # 向新加入的玩家发送他们自己的 ID
    emit('player_joined', {'id': player_id, 'players': players, 'walls': walls, 'maze_info': maze_info, 'wins': wins})
    
    # 向其他玩家广播新玩家加入的消息，但不包括 ID
    emit('player_joined', {'players': players, 'walls': walls, 'maze_info': maze_info, 'wins': wins}, broadcast=True, include_self=False)
    
    emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()]}, broadcast=True)
    check_game_state()  # 检查游戏状态

@socketio.on('disconnect')
def handle_disconnect():
    player_id = request.sid
    if player_id in players:
        del players[player_id]
        print(f'Player {player_id} disconnected, current players: {players}')
        if player_id in wins:
            del wins[player_id]
        if player_id in player_latencies:
            del player_latencies[player_id]
        try:
            socketio.emit('player_left', {'id': player_id}, namespace='/')
            socketio.emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()], 'latencies': player_latencies}, namespace='/')
        except Exception as e:
            print(f"Error during disconnect: {e}")
    check_game_state()

@socketio.on('connect_error')
def handle_connect_error(error):
    print(f"Connection error: {error}")
    handle_disconnect()  # 调用断开连接的处理函数

@socketio.on('change_name')
def handle_change_name(data):
    player_id = request.sid
    if player_id in players:
        old_name = players[player_id]['name']
        players[player_id]['name'] = data['name']
        player_colors[player_id] = f'#{random.randint(0, 0xFFFFFF):06x}'  # 更改颜色
        players[player_id]['color'] = player_colors[player_id]
        socketio.emit('name_changed', {'id': player_id, 'old_name': old_name, 'new_name': data['name'], 'new_color': player_colors[player_id]}, namespace='/')
        socketio.emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()]}, namespace='/')

@socketio.on('player_move')
def handle_player_move(data):
    player_id = request.sid
    player = players[player_id]
    if not player['alive']:
        return

    speed = 1.5
    player['angle'] = data['angle']
    player['moving'] = data['moving']

    if player['moving']:
        dx = math.cos(player['angle']) * speed
        dy = math.sin(player['angle']) * speed
        new_x = player['x'] + dx
        new_y = player['y'] + dy
        
        # 碰撞检测
        tank_radius = max(TANK_WIDTH, TANK_HEIGHT) / 2 + 2
        
        if not any(circle_rectangle_collision(new_x, new_y, tank_radius, wall) for wall in walls):
            player['x'] = new_x
            player['y'] = new_y
            # print(f"Player {player_id} new position: x={new_x}, y={new_y}")
        # else:
            # print(f"Player {player_id} collision detected")
        # 所有数据由send_game_state统一发送，这里不需要打包或者发送数据

@socketio.on('fire')
def handle_fire():
    player_id = request.sid
    if player_id not in players or not players[player_id]['alive']:
        return
    
    player = players[player_id]
    current_time = time.time()
    
    # 坦克中心到炮口的距离
    barrel_length = max(TANK_WIDTH, TANK_HEIGHT) / 2 + 5  # 确保子弹在坦克外部生成
    
    # 计算炮口位置
    fire_start_x = player['x'] + math.cos(player['angle']) * barrel_length
    fire_start_y = player['y'] + math.sin(player['angle']) * barrel_length
    
    if current_time <= player.get('laser_end_time', 0):
        # 发射激光
        laser = {
            'x': fire_start_x,
            'y': fire_start_y,
            'angle': player['angle'],
            'owner': player_id,
            'bounces': 0,
            'creation_time': current_time
        }
        lasers.append(laser)
    else:
        # 发射普通子弹
        print(f"Player {player_id} fired a bullet")
        
        bullet = {
            'x': fire_start_x,
            'y': fire_start_y,
            'angle': player['angle'],
            'owner': player_id,
            'bounces': 0
        }
        bullets.append(bullet)
        print(f"Bullet created: {bullet}")

@socketio.on('ping')
def handle_ping(data):
    try:
        client_time = data['clientTime']
        server_time = int(time.time() * 1000)  # 转换为毫秒
        emit('pong', {'clientTime': client_time, 'serverTime': server_time})
    except Exception as e:
        print(f"Error handling ping: {e}")
        emit('pong', {'error': 'Internal server error'})


@socketio.on('latency')
def handle_latency(data):
    player_id = request.sid
    player_latencies[player_id] = data['latency']
    emit('update_latencies', player_latencies, broadcast=True)

@socketio.on('restart_game')
def handle_restart_game():
    global maze_info
    if not maze_info:
        generate_walls()  # 如果 maze_info 为空，重新生成墙壁
    global players, bullets
    players.clear()
    bullets.clear()
    generate_walls()
    socketio.emit('game_reset', {'walls': walls, 'maze_info': maze_info, 'wins': wins}, namespace='/')
    print("Game restarted")  # 添加这行来帮助调试

    # 让所有连接的客户端重新加入游戏
    socketio.emit('rejoin_game', namespace='/')