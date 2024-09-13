import random
import math

def circle_rectangle_collision(circle_x, circle_y, circle_radius, rect):
    # 找到矩形上离圆心最近的点
    # 这段代码用于找到矩形上离圆心最近的点
    # 对于 x 坐标：
    #   1. 如果圆心的 x 坐标小于矩形的左边界，最近点在左边界上
    #   2. 如果圆心的 x 坐标大于矩形的右边界，最近点在右边界上
    #   3. 否则，最近点的 x 坐标就是圆心的 x 坐标
    # 对于 y 坐标，原理相同
    closest_x = max(rect['x'], min(circle_x, rect['x'] + rect['width']))
    closest_y = max(rect['y'], min(circle_y, rect['y'] + rect['height']))
    
    # 这种方法巧妙地处理了所有可能的情况，包括：
    # - 圆心在矩形内部
    # - 圆心在矩形外部，但最近点在矩形的边上
    # - 圆心在矩形外部，最近点是矩形的某个角点
    
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
    return maze

def point_in_rectangle(px, py, rx, ry, rw, rh):
    return rx <= px <= rx + rw and ry <= py <= ry + rh

# 辅助函数：检查线段与矩形的碰撞
def line_rectangle_collision(x1, y1, x2, y2, rect):
    left = rect['x']
    right = rect['x'] + rect['width']
    top = rect['y']
    bottom = rect['y'] + rect['height']
    
    # 检查线段的两个端点是否在矩形内
    if (left <= x1 <= right and top <= y1 <= bottom) or (left <= x2 <= right and top <= y2 <= bottom):
        return True
    
    # 检查线段是否与矩形的四条边相交
    if line_segment_intersection(x1, y1, x2, y2, left, top, right, top) or \
       line_segment_intersection(x1, y1, x2, y2, right, top, right, bottom) or \
       line_segment_intersection(x1, y1, x2, y2, right, bottom, left, bottom) or \
       line_segment_intersection(x1, y1, x2, y2, left, bottom, left, top):
        return True
    
    return False

# 辅助函数：检查两条线段是否相交
def line_segment_intersection(x1, y1, x2, y2, x3, y3, x4, y4):
    # 使用向量叉积方法检查两条线段是否相交
    def ccw(ax, ay, bx, by, cx, cy):
        return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)
    
    return ccw(x1, y1, x3, y3, x4, y4) != ccw(x2, y2, x3, y3, x4, y4) and \
           ccw(x1, y1, x2, y2, x3, y3) != ccw(x1, y1, x2, y2, x4, y4)

# 辅助函数：计算线段与矩形的交点
def line_rectangle_intersection(x, y, dx, dy, rect):
    left = rect['x']
    right = rect['x'] + rect['width']
    top = rect['y']
    bottom = rect['y'] + rect['height']

    t1 = float('-inf')
    t2 = float('inf')

    if dx != 0:
        tx1 = (left - x) / dx
        tx2 = (right - x) / dx
        t1 = max(t1, min(tx1, tx2))
        t2 = min(t2, max(tx1, tx2))

    if dy != 0:
        ty1 = (top - y) / dy
        ty2 = (bottom - y) / dy
        t1 = max(t1, min(ty1, ty2))
        t2 = min(t2, max(ty1, ty2))

    if t1 <= t2 and t1 >= 0:
        return (x + t1 * dx, y + t1 * dy)

    return None


# 辅助函数：计算两条直线的交点
def line_line_intersection(x1, y1, x2, y2, x3, y3, x4, y4):
    denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1)
    if denom == 0:
        return None  # 线段平行
    ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom
    if 0 <= ua <= 1:
        x = x1 + ua * (x2 - x1)
        y = y1 + ua * (y2 - y1)
        return (x, y)
    return None