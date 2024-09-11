from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
from msgpack import packb, unpackb
from flask_cors import CORS
import random
import math
from threading import Thread
import time

app = Flask(__name__, static_folder='static')
CORS(app)
socketio = SocketIO(app, async_mode='eventlet', websocket=True, ping_timeout=10, ping_interval=5, compression=True,cors_allowed_origins = '*')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

players = {}
bullets = []
walls = []
GRID_SIZE = 60  # 恢复原来的网格大小
WALL_THICKNESS = 4
MAZE_WIDTH = 13  # 恢复原来的迷宫宽度
MAZE_HEIGHT = 9  # 恢复原来的迷宫高度
TANK_WIDTH = 20  # 保持坦克宽度
TANK_HEIGHT = 20  # 保持坦克长度
GAME_WIDTH = 1200  # 恢复原来的游戏宽度
GAME_HEIGHT = 800  # 恢复原来的游戏高度
maze_info = {}
wins = {}  # 用于记录每个玩家的胜利次数
player_colors = {}  # 用于记录每个玩家的颜色
player_latencies = {}

def generate_maze(width, height):
    maze = [[0 for _ in range(width)] for _ in range(height)]
    
    # 生成随机的墙壁
    for y in range(height):
        for x in range(width):
            if random.random() < 0.3:  # 30% 的概率生成墙壁
                maze[y][x] = 1
    
    # 确保没有完全封闭的空间
    for y in range(height):
        for x in range(width):
            if maze[y][x] == 1:
                # 检查周围的空间
                neighbors = [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]
                blocked = sum(1 for nx, ny in neighbors if 0 <= nx < width and 0 <= ny < height and maze[ny][nx] == 1)
                if blocked > 2:  # 如果超过两个方向被阻塞，移除这个墙
                    maze[y][x] = 0
    
    # 确保地图边缘没有墙
    for y in range(height):
        maze[y][0] = maze[y][-1] = 0
    for x in range(width):
        maze[0][x] = maze[-1][x] = 0
    
    return maze

def generate_walls():
    global walls, maze_info
    maze = generate_maze(MAZE_WIDTH, MAZE_HEIGHT)
    walls = []
    
    # 计算迷宫的实际大小
    maze_actual_width = MAZE_WIDTH * GRID_SIZE
    maze_actual_height = MAZE_HEIGHT * GRID_SIZE
    
    # 计算偏移量，使迷宫居中
    offset_x = (GAME_WIDTH - maze_actual_width) // 2
    offset_y = (GAME_HEIGHT - maze_actual_height) // 2
    
    # 生成迷宫墙壁
    for y in range(MAZE_HEIGHT):
        for x in range(MAZE_WIDTH):
            if maze[y][x] == 1:
                walls.append({
                    'x': x * GRID_SIZE + offset_x,
                    'y': y * GRID_SIZE + offset_y,
                    'width': WALL_THICKNESS,
                    'height': GRID_SIZE
                })
                walls.append({
                    'x': x * GRID_SIZE + offset_x,
                    'y': y * GRID_SIZE + offset_y,
                    'width': GRID_SIZE,
                    'height': WALL_THICKNESS
                })
    
    # 添加游戏场地边界
    walls.extend([
        {'x': offset_x, 'y': offset_y, 'width': maze_actual_width, 'height': WALL_THICKNESS},  # 上边界
        {'x': offset_x, 'y': offset_y + maze_actual_height - WALL_THICKNESS, 'width': maze_actual_width, 'height': WALL_THICKNESS},  # 下边界
        {'x': offset_x, 'y': offset_y, 'width': WALL_THICKNESS, 'height': maze_actual_height},  # 左边界
        {'x': offset_x + maze_actual_width - WALL_THICKNESS, 'y': offset_y, 'width': WALL_THICKNESS, 'height': maze_actual_height}  # 右边界
    ])

    # 将迷宫信息添加到全局变量中
    maze_info = {
        'width': maze_actual_width,
        'height': maze_actual_height,
        'offset_x': offset_x,
        'offset_y': offset_y
    }

def reset_game():
    global players, bullets
    generate_walls()
    bullets = []
    for player_id in list(players.keys()):
        respawn_player(player_id)
    socketio.emit('game_reset', {'walls': walls, 'players': players, 'maze_info': maze_info, 'wins': wins}, namespace='/')

def respawn_player(player_id):
    global maze_info
    if not maze_info:
        generate_walls()  # 如果 maze_info 为空，重新生成墙壁
    
    maze_start_x = maze_info['offset_x']
    maze_start_y = maze_info['offset_y']
    maze_end_x = maze_start_x + maze_info['width']
    maze_end_y = maze_start_y + maze_info['height']
    
    tank_radius = max(TANK_WIDTH, TANK_HEIGHT) / 2 + 2  # 坦克半径加上2px的安全距离
    
    while True:
        x = random.randint(int(maze_start_x + tank_radius), int(maze_end_x - tank_radius))
        y = random.randint(int(maze_start_y + tank_radius), int(maze_end_y - tank_radius))
        
        # 检查坦克的碰撞圆是否与任何墙壁重合
        if not any(circle_rectangle_collision(x, y, tank_radius, wall) for wall in walls):
            players[player_id].update({
                'x': x,
                'y': y,
                'angle': random.uniform(0, 2*math.pi),  # 随机初始角度
                'turret_angle': 0,
                'alive': True
            })
            break

def circle_rectangle_collision(circle_x, circle_y, circle_radius, rect):
    # 找到矩形上离圆心最近的点
    closest_x = max(rect['x'], min(circle_x, rect['x'] + rect['width']))
    closest_y = max(rect['y'], min(circle_y, rect['y'] + rect['height']))
    
    # 计算最近点到圆心的距离
    distance_x = circle_x - closest_x
    distance_y = circle_y - closest_y
    distance_squared = distance_x**2 + distance_y**2
    
    return distance_squared <= circle_radius**2

@socketio.on('ping')
def handle_ping(data):
    client_time = data['clientTime']
    server_time = int(time.time() * 1000)  # 转换为毫秒
    emit('pong', {'clientTime': client_time, 'serverTime': server_time})

@socketio.on('latency')
def handle_latency(data):
    player_id = request.sid
    player_latencies[player_id] = data['latency']
    emit('update_latencies', player_latencies, broadcast=True)

@socketio.on('player_join')
def handle_player_join(data):
    global maze_info
    if not maze_info:
        generate_walls()  # 如果 maze_info 为空，重新生成墙壁
    
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

def check_game_state():
    if len(players) == 1:
        socketio.emit('waiting_for_players', {'count': len(players)}, namespace='/')
    elif len(players) > 1:
        socketio.emit('game_start', namespace='/')

@socketio.on('disconnect')
def handle_disconnect():
    player_id = request.sid
    if player_id in players:
        del players[player_id]
        del wins[player_id]
        del player_latencies[player_id]  # 移除玩家的延迟记录
        socketio.emit('player_left', {'id': player_id}, namespace='/')
        socketio.emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()], 'latencies': player_latencies}, namespace='/')
    check_game_state()

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
            print(f"Player {player_id} new position: x={new_x}, y={new_y}")
        else:
            print(f"Player {player_id} collision detected")
        # 所有数据由send_game_state统一发送，这里不需要打包或者发送数据

@socketio.on('fire')
def handle_fire():
    player_id = request.sid
    if player_id not in players or not players[player_id]['alive']:
        return
    
    player = players[player_id]
    print(f"Player {player_id} fired a bullet")
    
    # 坦克中心到炮口的距离
    barrel_length = max(TANK_WIDTH, TANK_HEIGHT) / 2 + 5  # 确保子弹在坦克外部生成
    
    # 计算炮口位置
    bullet_start_x = player['x'] + math.cos(player['angle']) * barrel_length
    bullet_start_y = player['y'] + math.sin(player['angle']) * barrel_length
    
    bullet = {
        'x': bullet_start_x,
        'y': bullet_start_y,
        'angle': player['angle'],
        'owner': player_id,
        'bounces': 0
    }
    bullets.append(bullet)
    print(f"Bullet created: {bullet}")
    # socketio.emit('update_bullets', bullets, namespace='/')

def reflect_bullet(bullet, wall):
    # 计算墙壁的法线向量
    if wall['width'] > wall['height']:  # 水平墙
        normal = (0, 1)
    else:  # 垂直墙
        normal = (1, 0)
    
    # 计算入射向量
    incident = (math.cos(bullet['angle']), math.sin(bullet['angle']))
    
    # 计算反射向量
    dot_product = incident[0]*normal[0] + incident[1]*normal[1]
    reflected = (
        incident[0] - 2 * dot_product * normal[0],
        incident[1] - 2 * dot_product * normal[1]
    )
    
    # 更新子弹角度
    bullet['angle'] = math.atan2(reflected[1], reflected[0])
    

def update_game():
    global bullets
    bullets_to_remove = []
    for bullet in bullets:
        speed = 5
        dx = math.cos(bullet['angle']) * speed
        dy = math.sin(bullet['angle']) * speed
        
        # 使用多个中间点进行碰撞检测
        steps = 5
        for i in range(1, steps + 1):
            new_x = bullet['x'] + dx * i / steps
            new_y = bullet['y'] + dy * i / steps
            
            collision = False
            for wall in walls:
                if circle_rectangle_collision(new_x, new_y, 2, wall):  # 给子弹一个2像素的半径
                    collision = True
                    reflect_bullet(bullet, wall)
                    bullet['bounces'] += 1
                    break
            
            if collision:
                break
        
        if not collision:
            bullet['x'] += dx
            bullet['y'] += dy
        
        # 检查玩家碰撞
        for player_id, player in players.items():
            if player['alive']:
                if circle_rectangle_collision(bullet['x'], bullet['y'], 3, {
                    'x': player['x'] - TANK_WIDTH/2,
                    'y': player['y'] - TANK_HEIGHT/2,
                    'width': TANK_WIDTH,
                    'height': TANK_HEIGHT
                }):
                    player['alive'] = False
                    bullets_to_remove.append(bullet)
                    socketio.emit('player_killed', {'id': player_id, 'x': player['x'], 'y': player['y']}, namespace='/')
                    game_over, winner = check_winner()
                    if game_over:
                        socketio.emit('game_over', {'winner': winner['name'], 'wins': wins}, namespace='/')
                    break
        
        # 检查子弹是否超出游戏区域或反弹次数过多
        if bullet['bounces'] >= 10 or not (0 <= bullet['x'] <= GAME_WIDTH and 0 <= bullet['y'] <= GAME_HEIGHT):
            bullets_to_remove.append(bullet)
    
    # 移除需要删除的子弹
    for bullet in bullets_to_remove:
        if bullet in bullets:
            bullets.remove(bullet)
    
    # socketio.emit('update_bullets', bullets, namespace='/')

def point_in_rectangle(px, py, rx, ry, rw, rh):
    return rx <= px <= rx + rw and ry <= py <= ry + rh

def check_winner():
    alive_players = [p for p in players.values() if p['alive']]
    if len(players) > 1 and len(alive_players) == 1:
        winner = alive_players[0]
        winner_id = next(id for id, player in players.items() if player == winner)
        wins[winner_id] += 1
        return True, winner
    elif len(players) == 1:
        socketio.emit('waiting_for_players', {'count': len(players)}, namespace='/')
        return False, None
    return False, None

def start_game_loop():
    update_counter = 0
    while True:
        socketio.sleep(1/60)  # 60 FPS 的游戏逻辑
        update_game()
        update_counter += 1
        if update_counter >= 3:  # 每3帧发送一次更新，相当于20 FPS
            update_counter = 0
            send_game_state()

def send_game_state():
    game_state = {
        'players': {id: {'x': p['x'], 'y': p['y'], 'angle': p['angle'], 'alive': p['alive']} for id, p in players.items()},
        'bullets': [{'x': b['x'], 'y': b['y'], 'angle': b['angle'], 'speed': 5, 'id': id(b)} for b in bullets]    }
    socketio.emit('game_state', packb(game_state), namespace='/')

def run_game_loop():
    Thread(target=start_game_loop).start()

@socketio.on('restart_game')
def handle_restart_game():
    global players, bullets
    players = {}
    bullets = []
    generate_walls()
    socketio.emit('game_reset', {'walls': walls, 'maze_info': maze_info, 'wins': wins}, namespace='/')
    print("Game restarted")  # 添加这行来帮助调试

    # 让所有连接的客户端重新加入游戏
    socketio.emit('rejoin_game', namespace='/')

if __name__ == '__main__':
    generate_walls()
    run_game_loop()
    socketio.run(app, host='0.0.0.0', port=25000, debug=False)