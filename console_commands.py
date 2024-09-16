from game_state import players, bullets, crystals
import random
import math
from ai_player import AIPlayer
import time

ai_players = {}

def spawn_crystal(x, y):
    crystals.append({
        'x': x,
        'y': y,
        'spawn_time': time.time()
    })
    print(f"水晶已生成在 ({x}, {y})")

def kill_player(player_id):
    if player_id in players:
        players[player_id]['alive'] = False
        print(f"玩家 {player_id} 已被击杀")
    else:
        print(f"找不到玩家 {player_id}")

def spawn_bullet(x, y, angle):
    bullets.append({
        'x': x,
        'y': y,
        'angle': angle,
        'owner': 'console',
        'bounces': 0
    })
    print(f"子弹已生成在 ({x}, {y})，角度为 {angle}")

def spawn_bot(name):
    from game_logic import respawn_player
    bot_id = f"bot_{name}"
    if bot_id not in players:
        players[bot_id] = {
            'x': random.randint(0, 1200),
            'y': random.randint(0, 800),
            'angle': random.uniform(0, 2*math.pi),
            'turret_angle': 0,
            'color': f'#{random.randint(0, 0xFFFFFF):06x}',
            'alive': True,
            'name': name,
            'moving': 0,
            'rotating': 0,
        }
        respawn_player(bot_id)
        ai_players[bot_id] = AIPlayer(bot_id)
        print(f"AI玩家 {name} 已生成")
    else:
        print(f"AI玩家 {name} 已存在")

def process_command(command):
    parts = command.split()
    if not parts:
        return

    if parts[0] == '/spawncrystal' and len(parts) == 3:
        spawn_crystal(float(parts[1]), float(parts[2]))
    elif parts[0] == '/killplayer' and len(parts) == 2:
        kill_player(parts[1])
    elif parts[0] == '/spawnbullet' and len(parts) == 4:
        spawn_bullet(float(parts[1]), float(parts[2]), float(parts[3]))
    elif parts[0] == '/spawnbot' and len(parts) == 2:
        spawn_bot(parts[1])
        print(f"尝试生成 AI 玩家: {parts[1]}")  # 添加这行来确认命令被处理
    else:
        print("无效的命令")