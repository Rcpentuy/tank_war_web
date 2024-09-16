import random
import math
from game_state import players, bullets, walls, GAME_WIDTH, GAME_HEIGHT, TANK_SPEED, ROTATING_SPEED,TANK_HEIGHT,TANK_WIDTH

def ai_fire(player_id):
    player = players[player_id]
    if player['alive']:
        angle = player['angle']
        bullets.append({
            'x': player['x'] + math.cos(angle) * TANK_WIDTH / 2,
            'y': player['y'] + math.sin(angle) * TANK_HEIGHT / 2,
            'angle': angle,
            'owner': player_id,
            'bounces': 0
        })
        
class AIPlayer:
    def __init__(self, player_id):
        self.player_id = player_id
        self.target = None
        self.state = 'roaming'
        self.state_timer = 0

    def update(self):
        player = players[self.player_id]
        if not player['alive']:
            return

        self.state_timer -= 1
        if self.state_timer <= 0:
            self.choose_new_state()



        if self.state == 'roaming':
            self.roam()
        elif self.state == 'attacking':
            self.attack()
        elif self.state == 'evading':
            self.evade()

        print(f"AI玩家{self.player_id} 状态：{self.state} 位置: ({player['x']}, {player['y']}), 转动: {player['rotating']},移动：{player['moving']}")  # 添加调试信息

    def choose_new_state(self):
        self.state = random.choice(['roaming'])
        self.state_timer = random.randint(50, 150)
        if self.state == 'attacking':
            self.choose_target()

    def choose_target(self):
        alive_players = [p for p in players.values() if p['alive'] and p != players[self.player_id]]
        if alive_players:
            self.target = random.choice(alive_players)
        else:
            self.state = 'roaming'

    def roam(self):
        player = players[self.player_id]
        player['moving'] = random.choice([0, 1])
        player['rotating'] = random.choice([-1, 0, 1])

    def attack(self):
        if not self.target or not self.target['alive']:
            self.choose_new_state()
            return

        player = players[self.player_id]
        dx = self.target['x'] - player['x']
        dy = self.target['y'] - player['y']
        angle_to_target = math.atan2(dy, dx)

        angle_diff = (angle_to_target - player['angle'] + math.pi) % (2 * math.pi) - math.pi
        if abs(angle_diff) > 0.1:
            player['rotating'] = 1 if angle_diff > 0 else -1
        else:
            player['rotating'] = 0

        player['moving'] = 1
        
        # 发射子弹
        if random.random() < 0.1:  # 5% 的概率发射子弹
            ai_fire(self.player_id)  # 使用新的 ai_fire 函数

    def evade(self):
        player = players[self.player_id]
        nearest_bullet = self.find_nearest_bullet()
        if nearest_bullet:
            dx = nearest_bullet['x'] - player['x']
            dy = nearest_bullet['y'] - player['y']
            angle_to_bullet = math.atan2(dy, dx)
            
            # 远离子弹的方向
            evasion_angle = (angle_to_bullet + math.pi) % (2 * math.pi)
            
            angle_diff = (evasion_angle - player['angle'] + math.pi) % (2 * math.pi) - math.pi
            if abs(angle_diff) > 0.1:
                player['rotating'] = 1 if angle_diff > 0 else -1
            else:
                player['rotating'] = 0
            
            player['moving'] = 1
        else:
            self.roam()

    def find_nearest_bullet(self):
        player = players[self.player_id]
        nearest_bullet = None
        min_distance = float('inf')
        for bullet in bullets:
            if bullet['owner'] != self.player_id:
                dx = bullet['x'] - player['x']
                dy = bullet['y'] - player['y']
                distance = math.sqrt(dx*dx + dy*dy)
                if distance < min_distance:
                    min_distance = distance
                    nearest_bullet = bullet
        return nearest_bullet