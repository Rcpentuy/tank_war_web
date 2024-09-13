# 游戏状态变量
players = {}
bullets = []
walls = []
maze_info = {}
wins = {}
player_latencies = {}
is_game_running = False
lasers = []
crystals = []
player_colors = {}

# 游戏常量
GRID_SIZE = 60
WALL_THICKNESS = 4
MAZE_WIDTH = 13
MAZE_HEIGHT = 9
TANK_WIDTH = 20
TANK_HEIGHT = 20
GAME_WIDTH = 1200
GAME_HEIGHT = 800

# 水晶相关常量
CRYSTAL_SPAWN_INTERVAL = 10  # 10秒
CRYSTAL_LIFETIME = 5  # 5秒
LASER_DURATION = 10  # 10秒
CRYSTAL_RADIUS = 15  # 水晶半径
TANK_CRYSTAL_MIN_DISTANCE = 100  # 坦克和水晶之间的最小距离

# 初始化最后一次水晶生成时间
import time
last_crystal_spawn_time = time.time()


# 游戏设置
BULLET_SPEED = 5
TANK_SPEED = 1.5
MAX_BULLET_BOUNCES = 10
LASER_DURATION = 10  # 激光武器持续时间为10秒
MAX_LASER_BOUNCES = 3

# 游戏更新频率
GAME_UPDATE_RATE = 60  # 60 FPS
GAME_STATE_SEND_RATE = 20  # 20 FPS

# 初始化日志
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)