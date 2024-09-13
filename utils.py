import random

def circle_rectangle_collision(circle_x, circle_y, circle_radius, rect):
    # 找到矩形上离圆心最近的点
    closest_x = max(rect['x'], min(circle_x, rect['x'] + rect['width']))
    closest_y = max(rect['y'], min(circle_y, rect['y'] + rect['height']))
    
    # 计算最近点到圆心的距离
    distance_x = circle_x - closest_x
    distance_y = circle_y - closest_y
    distance_squared = distance_x**2 + distance_y**2
    
    return distance_squared <= circle_radius**2

def generate_maze(width, height):
    # 这行代码创建了一个二维列表（矩阵）来表示迷宫
    # width 和 height 分别代表迷宫的宽度和高度
    # 初始化时，所有元素都设置为0，表示没有墙壁
    # 外层列表包含 height 个子列表，每个子列表包含 width 个元素
    # 使用列表推导式可以简洁地创建这个结构
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
    print(maze)
    return maze

def point_in_rectangle(px, py, rx, ry, rw, rh):
    return rx <= px <= rx + rw and ry <= py <= ry + rh