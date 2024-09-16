from app import socketio
from flask import request
from flask_socketio import emit
from game_state import players, bullets,crystals, walls, maze_info, wins, player_latencies, player_colors,is_game_running, TANK_WIDTH, TANK_HEIGHT, TANK_SPEED
from game_logic import respawn_player, check_game_state, reflect_laser
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
        players[player_id]['moving'] = 0
        players[player_id]['laser_end_time'] = 0
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
            'name': data['name'],
            'moving':0,
            'rotating':0,
        }
        if player_id not in wins:
            wins[player_id] = 0  # 初始化玩家胜利次数
        #确保只重生新加入玩家
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
        print(f'玩家{player_id}断开连接')
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
    print(f"发现连接错误: {error}")
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
    if 'angle' in data:
        player['angle'] = data['angle']
    if 'moving' in data:
        player['moving'] = data['moving']
    if 'rotating' in data:
        player['rotating'] = data['rotating']
    
        
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
            'creation_time': current_time
        }
        laser = reflect_laser(laser,walls)
        lasers.append(laser)
    else:
        # 发射普通子弹
        bullet = {
            'x': fire_start_x,
            'y': fire_start_y,
            'angle': player['angle'],
            'owner': player_id,
            'bounces': 0
        }
        bullets.append(bullet)

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
    global players
    alive_players = [player for player in players.values() if player['alive']]
    if len(alive_players) <= 1:
        print('现有玩家：',alive_players)
        global bullets,crystals
        generate_walls()
        bullets.clear()
        crystals.clear()
        for player_id in list(players.keys()):
            respawn_player(player_id)
        socketio.emit('game_reset', {'walls': walls, 'players': players, 'maze_info': maze_info, 'wins': wins}, namespace='/')
        socketio.emit('rejoin_game', namespace='/')
    else:
        emit('rejoin_game', namespace='/')
        print('还有2名以上玩家存活，正在连接会话...')