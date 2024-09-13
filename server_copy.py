


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


    player_id = request.sid
    player_latencies[player_id] = data['latency']
    emit('update_latencies', player_latencies, broadcast=True)

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
    if not is_game_running:
        check_game_state()

    global bullets, crystals, last_crystal_spawn_time, lasers
    current_time = time.time()
    
    # 更新水晶
    if is_game_running and not crystals and current_time - last_crystal_spawn_time >= CRYSTAL_SPAWN_INTERVAL:
        spawn_crystal()
    
    crystals_to_remove = []
    for crystal in crystals:
        if current_time - crystal['spawn_time'] >= CRYSTAL_LIFETIME:
            # print(f"Crystal at ({crystal['x']}, {crystal['y']}) removed after {current_time - crystal['spawn_time']} seconds")
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
                print('laser hit, winner checked')
                if game_over:
                    socketio.emit('game_over', {'winner': winner['name'], 'wins': wins}, namespace='/')
                    break

    # 移除过期的激光
    for laser in lasers_to_remove:
        lasers.remove(laser)

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
        'lasers': [{'x': l['x'], 'y': l['y'], 'endX': l['endX'], 'endY': l['endY'], 'angle': l['angle']} for l in lasers]
    }
    socketio.emit('game_state', packb(game_state), namespace='/')

def run_game_loop():
    try:
        Thread(target=start_game_loop).start()
    except Exception as e:
        logger.error(f"Error starting game loop: {e}")
        logger.exception("Exception details:")

# 添加生成水晶的函数
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
            'spawn_time': time.time()
        }
        crystals.append(crystal)
        last_crystal_spawn_time = time.time()
        # print(f"Crystal spawned at ({x}, {y})")  # 添加日志
        socketio.emit('crystal_spawned', {'x': x, 'y': y}, namespace='/')
        break

# 添加处理激光的函数
def process_laser(laser):
    hit_players = []
    current_x, current_y = laser['x'], laser['y']
    dx = math.cos(laser['angle'])
    dy = math.sin(laser['angle'])
    
    end_x, end_y = current_x, current_y
    
    while laser['bounces'] < 3:
        # 检查激光是否击中玩家
        for player_id, player in players.items():
            if player['alive'] and player_id != laser['owner']:
                if circle_rectangle_collision(current_x, current_y, 1, {
                    'x': player['x'] - TANK_WIDTH/2,
                    'y': player['y'] - TANK_HEIGHT/2,
                    'width': TANK_WIDTH,
                    'height': TANK_HEIGHT
                }):
                    # player['alive'] = False
                    hit_players.append(player_id)
        
        # 检查激光是否击中墙壁
        wall_hit = False
        for wall in walls:
            if circle_rectangle_collision(current_x, current_y, 1, wall):
                reflect_laser(laser, wall)
                laser['bounces'] += 1
                wall_hit = True
                break
        
        if not wall_hit:
            current_x += dx * 10  # 增加步长以提高性能
            current_y += dy * 10
        
        end_x, end_y = current_x, current_y
        
        # 检查是否超出游戏区域
        if not (0 <= current_x <= GAME_WIDTH and 0 <= current_y <= GAME_HEIGHT):
            break
    
    laser['endX'] = end_x
    laser['endY'] = end_y
    
    return hit_players

def reflect_laser(laser, wall):
    # 计算墙壁的法线向量
    if wall['width'] > wall['height']:  # 水平墙
        normal = (0, 1)
    else:  # 垂直墙
        normal = (1, 0)
    
    # 计算入射向量
    incident = (math.cos(laser['angle']), math.sin(laser['angle']))
    
    # 计算反射向量
    dot_product = incident[0]*normal[0] + incident[1]*normal[1]
    reflected = (
        incident[0] - 2 * dot_product * normal[0],
        incident[1] - 2 * dot_product * normal[1]
    )
    
    # 更新激光角度
    laser['angle'] = math.atan2(reflected[1], reflected[0])
    
    # 增加反弹次数
    laser['bounces'] += 1

if __name__ == '__main__':
    try:
        generate_walls()
        run_game_loop()
        socketio.run(app, host='0.0.0.0', port=25000, debug=False)
    except KeyboardInterrupt:
        print("Shutting down server...")
    finally:
        socketio.stop()