from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import random
import math

app = Flask(__name__, static_folder='static')
socketio = SocketIO(app, async_mode='threading')

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
    global walls
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
    global maze_info
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
    
    return distance_squared < circle_radius**2

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
    socketio.emit('player_joined', {'id': player_id, 'players': players, 'walls': walls, 'maze_info': maze_info, 'wins': wins}, namespace='/')
    socketio.emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()]}, namespace='/')
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
        del wins[player_id]  # 移除玩家的胜利记录
        socketio.emit('player_left', {'id': player_id}, namespace='/')
        socketio.emit('update_player_count', {'count': len(players), 'players': [p['name'] for p in players.values()]}, namespace='/')
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

    speed = 2
    player['angle'] = data['angle']
    player['moving'] = data['moving']

    print(f"Player {player_id} move: angle={data['angle']}, moving={data['moving']}")

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

    emit('player_updated', {'id': player_id, 'data': player}, broadcast=True)
    print(f"Emitted player_updated for {player_id}: {player}")

@socketio.on('fire')
def handle_fire():
    player_id = request.sid
    player = players[player_id]
    if not player['alive']:
        return
    
    print(f"Player {player_id} fired a bullet")
    
    # 坦克中心到炮口的距离
    barrel_length = 20 / 1.2  # 可以根据实际坦克大小调整
    
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

def update_game():
    for bullet in bullets[:]:
        speed = 5
        old_x, old_y = bullet['x'], bullet['y']
        new_x = old_x + math.cos(bullet['angle']) * speed
        new_y = old_y + math.sin(bullet['angle']) * speed
        
        # 检查墙壁碰撞
        collision = False
        for wall in walls:
            if line_rectangle_intersection(old_x, old_y, new_x, new_y, wall):
                collision = True
                collision_point = line_rectangle_intersection_point(old_x, old_y, new_x, new_y, wall)
                if collision_point:
                    new_x, new_y = collision_point
                    # 计算反弹角度
                    if abs(new_x - wall['x']) < 1 or abs(new_x - (wall['x'] + wall['width'])) < 1:
                        bullet['angle'] = math.pi - bullet['angle']
                    else:
                        bullet['angle'] = -bullet['angle']
                bullet['bounces'] += 1
                break
        
        bullet['x'], bullet['y'] = new_x, new_y
        
        # 检查玩家碰撞
        for player_id, player in players.items():
            if player['alive']:
                if point_in_rectangle(bullet['x'], bullet['y'], player['x'] - TANK_WIDTH/2, player['y'] - TANK_HEIGHT/2, TANK_WIDTH, TANK_HEIGHT):
                    player['alive'] = False
                    game_over, winner = check_winner()
                    socketio.emit('player_killed', {
                        'id': player_id, 
                        'x': player['x'], 
                        'y': player['y'],
                        'gameOver': game_over,
                        'winner': winner['name'] if winner else None
                    }, namespace='/')
                    bullets.remove(bullet)
                    if game_over:
                        # 延迟发送游戏结束事件
                        socketio.emit('game_over', {'wins': wins}, namespace='/', callback=lambda: socketio.sleep(1))
                    break
        
        if bullet['bounces'] >= 10 or not (0 <= bullet['x'] <= GAME_WIDTH and 0 <= bullet['y'] <= GAME_HEIGHT):
            bullets.remove(bullet)
    
    socketio.emit('update_bullets', bullets, namespace='/')
    print(f"Emitted update_bullets with {len(bullets)} bullets")

def line_rectangle_intersection(x1, y1, x2, y2, rect):
    left = rect['x']
    right = rect['x'] + rect['width']
    top = rect['y']
    bottom = rect['y'] + rect['height']
    
    if (x1 <= left and x2 <= left) or (x1 >= right and x2 >= right) or (y1 <= top and y2 <= top) or (y1 >= bottom and y2 >= bottom):
        return False
    
    m = (y2 - y1) / (x2 - x1) if x2 != x1 else float('inf')
    b = y1 - m * x1 if x2 != x1 else 0
    
    if x1 != x2:
        t_left = (left - x1) / (x2 - x1)
        t_right = (right - x1) / (x2 - x1)
        y_left = m * left + b
        y_right = m * right + b
        if 0 <= t_left <= 1 and top <= y_left <= bottom:
            return True
        if 0 <= t_right <= 1 and top <= y_right <= bottom:
            return True
    
    if y1 != y2:
        t_top = (top - y1) / (y2 - y1)
        t_bottom = (bottom - y1) / (y2 - y1)
        x_top = (top - b) / m if m != 0 else x1
        x_bottom = (bottom - b) / m if m != 0 else x1
        if 0 <= t_top <= 1 and left <= x_top <= right:
            return True
        if 0 <= t_bottom <= 1 and left <= x_bottom <= right:
            return True
    
    return False

def line_rectangle_intersection_point(x1, y1, x2, y2, rect):
    left = rect['x']
    right = rect['x'] + rect['width']
    top = rect['y']
    bottom = rect['y'] + rect['height']
    
    m = (y2 - y1) / (x2 - x1) if x2 != x1 else float('inf')
    b = y1 - m * x1 if x2 != x1 else 0
    
    intersections = []
    
    if x1 != x2:
        t_left = (left - x1) / (x2 - x1)
        t_right = (right - x1) / (x2 - x1)
        y_left = m * left + b
        y_right = m * right + b
        if 0 <= t_left <= 1 and top <= y_left <= bottom:
            intersections.append((left, y_left))
        if 0 <= t_right <= 1 and top <= y_right <= bottom:
            intersections.append((right, y_right))
    
    if y1 != y2:
        t_top = (top - y1) / (y2 - y1)
        t_bottom = (bottom - y1) / (y2 - y1)
        x_top = (top - b) / m if m != 0 else x1
        x_bottom = (bottom - b) / m if m != 0 else x1
        if 0 <= t_top <= 1 and left <= x_top <= right:
            intersections.append((x_top, top))
        if 0 <= t_bottom <= 1 and left <= x_bottom <= right:
            intersections.append((x_bottom, bottom))
    
    if intersections:
        return min(intersections, key=lambda p: (p[0] - x1)**2 + (p[1] - y1)**2)
    return None

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

def game_loop():
    while True:
        socketio.sleep(1/60)  # 60 FPS
        try:
            update_game()
        except Exception as e:
            print(f"Error in game loop: {e}")

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
    socketio.start_background_task(target=game_loop)
    socketio.run(app, host='0.0.0.0', port=25000, debug=True)