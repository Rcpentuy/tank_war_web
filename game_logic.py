from game_state import *
from app import socketio
import math
import random
import time
from utils import circle_rectangle_collision, generate_maze,line_rectangle_intersection,line_rectangle_collision
from msgpack import packb
from threading import Thread

def update_game():
    global is_game_running, bullets, crystals, last_crystal_spawn_time, lasers
    if not is_game_running:
        check_game_state()

    current_time = time.time()
    
    # 更新水晶
    if is_game_running and not crystals and current_time - last_crystal_spawn_time >= CRYSTAL_SPAWN_INTERVAL:
        spawn_crystal()
    
    crystals_to_remove = []
    for crystal in crystals:
        if 'spawn_time' not in crystal:
            crystal['spawn_time'] = current_time  # 如果没有spawn_time，添加一个
        if current_time - crystal['spawn_time'] >= CRYSTAL_LIFETIME:
            crystals_to_remove.append(crystal)
    
    for crystal in crystals_to_remove:
        crystals.remove(crystal)
    
    # 检查玩家是否接触到水晶
    for player_id, player in players.items():
        if player['alive']:
            for crystal in crystals:
                if math.hypot(player['x'] - crystal['x'], player['y'] - crystal['y']) < TANK_WIDTH/2 + CRYSTAL_RADIUS:
                    player['laser_end_time'] = current_time + LASER_DURATION
                    crystals.remove(crystal)
                    socketio.emit('crystal_collected', {'x': crystal['x'], 'y': crystal['y']}, namespace='/')
                    break

    bullets_to_remove = []
    for bullet in bullets:
        speed = 5
        dx = math.cos(bullet['angle']) * speed
        dy = math.sin(bullet['angle']) * speed
        
        # 单点碰撞检测
        new_x = bullet['x'] + dx
        new_y = bullet['y'] + dy
        
        collision = False
        for wall in walls:
            if circle_rectangle_collision(new_x, new_y, 2, wall):
                collision = True
                reflect_bullet(bullet, wall)
                bullet['bounces'] += 1
                break
        
        if not collision:
            bullet['x'] = new_x
            bullet['y'] = new_y
        
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
    
    # 更新激光
    lasers_to_remove = []
    for laser in lasers:
        if current_time - laser['creation_time'] > 0.1:  # 激光持续时间为0.1秒
            lasers_to_remove.append(laser)
        hit_players = process_laser(laser)
        for player_id in hit_players:
            if players[player_id]['alive']:
                players[player_id]['alive'] = False
                socketio.emit('player_killed', {'id': player_id, 'x': players[player_id]['x'], 'y': players[player_id]['y']}, namespace='/')
                game_over, winner = check_winner()
                if game_over:
                    socketio.emit('game_over', {'winner': winner['name'], 'wins': wins}, namespace='/')
                    break

    # 移除过期的激光
    for laser in lasers_to_remove:
        lasers.remove(laser)

def send_game_state():
    game_state = {
        'players': {id: {
            'x': p['x'], 
            'y': p['y'], 
            'angle': p['angle'], 
            'alive': p['alive'],
            'color': p['color'],
            'name': p['name'],
            'has_laser': time.time() <= p.get('laser_end_time', 0)
        } for id, p in players.items()},
        'bullets': [{'x': b['x'], 'y': b['y'], 'angle': b['angle'], 'speed': 5, 'id': id(b)} for b in bullets],
        'crystals': [{'x': c['x'], 'y': c['y'], 'spawn_time': c['spawn_time']} for c in crystals],
        'lasers': [{'x': l['x'], 'y': l['y'], 'angle': l['angle'],'reflected_points':l['reflected_points']} for l in lasers],
    }
    socketio.emit('game_state', packb(game_state), namespace='/')

def start_game_loop():
    update_counter = 0
    while True:
        socketio.sleep(1/60)  # 60 FPS 的游戏逻辑
        update_game()
        update_counter += 1
        if update_counter >= 3:  # 每3帧发送一次更新，相当于20 FPS
            update_counter = 0
            send_game_state()

def run_game_loop():
    try:
        Thread(target=start_game_loop).start()
    except Exception as e:
        logger.error(f"Error starting game loop: {e}")
        logger.exception("Exception details:")

def check_game_state():
    global is_game_running
    if len(players) == 1:
        socketio.emit('waiting_for_players', {'count': len(players)}, namespace='/')
    elif len(players) > 1: 
        socketio.emit('game_start', namespace='/')
        is_game_running = True
    else:
        # 如果没有玩家，重置游戏状态
        is_game_running = False
        reset_game()

def reset_game():
    global players, bullets
    generate_walls()
    bullets.clear()
    crystals.clear()
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

def generate_walls():
    global walls, maze_info
    walls.clear()
    maze = generate_maze(MAZE_WIDTH, MAZE_HEIGHT)
   
    
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
    maze_info.update({
        'width': maze_actual_width,
        'height': maze_actual_height,
        'offset_x': offset_x,
        'offset_y': offset_y
    })
    
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

def spawn_crystal():
    global crystals, last_crystal_spawn_time
    
    while True:
        x = random.randint(maze_info['offset_x'], maze_info['offset_x'] + maze_info['width'] - CRYSTAL_RADIUS)
        y = random.randint(maze_info['offset_y'], maze_info['offset_y'] + maze_info['height'] - CRYSTAL_RADIUS)
        
        # 检查是否与墙壁碰撞
        if any(circle_rectangle_collision(x, y, CRYSTAL_RADIUS, wall) for wall in walls):
            continue
        
        # 检查是否与坦克距离太近
        if any(math.hypot(player['x'] - x, player['y'] - y) < TANK_CRYSTAL_MIN_DISTANCE for player in players.values()):
            continue
        
        crystal = {
            'x': x,
            'y': y,
            'spawn_time': time.time()  # 确保每个水晶都有spawn_time
        }
        crystals.append(crystal)
        last_crystal_spawn_time = time.time()
        socketio.emit('crystal_spawned', {'x': x, 'y': y}, namespace='/')
        break

def process_laser(laser):
    hit_players = []
    start_x, start_y = laser['x'], laser['y']
    for end_x, end_y in laser['reflected_points']:
        # 检查这条线段上是否有玩家被击中
        for player_id, player in players.items():
            if player['alive'] and player_id != laser['owner']:
                if line_rectangle_collision(start_x, start_y, end_x, end_y, {
                    'x': player['x'] - TANK_WIDTH/2,
                    'y': player['y'] - TANK_HEIGHT/2,
                    'width': TANK_WIDTH,
                    'height': TANK_HEIGHT
                }):
                    hit_players.append(player_id)
        
        start_x, start_y = end_x, end_y
    
    return hit_players

def reflect_laser(laser, walls):
    reflected_points = []
    current_x, current_y = laser['x'], laser['y']
    angle = laser['angle']
    
    print(f"Initial laser position: ({current_x}, {current_y}), angle: {angle}")
    
    for i in range(REFLECTION_TIMES):
        dx = math.cos(angle)
        dy = math.sin(angle)
        
        print(f"Reflection {i+1}: direction vector: ({dx}, {dy})")
        
        min_distance = float('inf')
        collision_point = None
        collision_wall = None
        
        # 检查与所有墙壁的交点
        for wall in walls:
            intersection = line_rectangle_intersection(current_x, current_y, dx, dy, wall)
            if intersection:
                distance = math.hypot(intersection[0] - current_x, intersection[1] - current_y)
                if distance < min_distance:
                    min_distance = distance
                    collision_point = intersection
                    collision_wall = wall
                print(f"  Intersection with wall {wall}: {intersection}")
        
        # 如果没有找到交点，检查与游戏边界的交点
        if not collision_point:
            game_bounds = [
                {'x': 0, 'y': 0, 'width': GAME_WIDTH, 'height': WALL_THICKNESS},  # 上边界
                {'x': 0, 'y': GAME_HEIGHT - WALL_THICKNESS, 'width': GAME_WIDTH, 'height': WALL_THICKNESS},  # 下边界
                {'x': 0, 'y': 0, 'width': WALL_THICKNESS, 'height': GAME_HEIGHT},  # 左边界
                {'x': GAME_WIDTH - WALL_THICKNESS, 'y': 0, 'width': WALL_THICKNESS, 'height': GAME_HEIGHT}  # 右边界
            ]
            for bound in game_bounds:
                intersection = line_rectangle_intersection(current_x, current_y, dx, dy, bound)
                if intersection:
                    distance = math.hypot(intersection[0] - current_x, intersection[1] - current_y)
                    if distance < min_distance:
                        min_distance = distance
                        collision_point = intersection
                        collision_wall = bound
                    print(f"  Intersection with game boundary {bound}: {intersection}")
        
        if collision_point:
            reflected_points.append(collision_point)
            current_x, current_y = collision_point
            
            # 计算反射角度
            if collision_wall['width'] > collision_wall['height']:  # 水平墙
                angle = 2 * math.pi - angle
            else:  # 垂直墙
                angle = math.pi - angle
            
            print(f"  Collision at {collision_point}, new angle: {angle}")
        else:
            print("  No collision found, this should not happen!")
            break
    
    laser['reflected_points'] = reflected_points
    return laser

