const FPS = 30; // 帧率
const explosionDuration = 500; // 爆炸动画持续时间（毫秒）
const INTERPOLATION_DURATION = 50; // 插值持续时间（毫秒）
const FIRE_COOLDOWN = 300; // 冷却时间，单位为毫秒
const CRYSTAL_RADIUS = 15;
const CRYSTAL_FADE_DURATION = 1000; // 1秒淡出时间

const gameState = {
  gameArea: null, // 游戏区域SVG元素
  myId: null, // 当前玩家ID
  players: {}, // 所有玩家信息
  bullets: [], // 子弹信息
  lasers: [], // 激光信息
  walls: [], // 墙壁信息
  maze_info: {}, // 迷宫信息
  wins: {}, // 胜利次数记录
  playerLatencies: {}, // 玩家延迟信息
  isPlayerListVisible: false, // 玩家列表是否可见
  isGameRunning: false, // 游戏是否正在运行
  explosions: [], // 爆炸效果数组
  lastTime: performance.now(), // 上一帧时间
  waitingInterval: null, // 等待间隔
  gameState: "not_joined", // 游戏状态: 'not_joined', 'waiting', 'playing'
  isMoving: false, // 玩家是否正在移动
  gameOverTimeout: null, // 游戏结束超时
  targetX: 0, // 目标X坐标
  targetY: 0, // 目标Y坐标
  touchStartTime: 0,
  touchTimeout: null,
  isTouchMoving: false,
  lastGameState: null,
  currentGameState: null,
  interpolationFactor: 0,
  lastUpdateTime: 0,
  gameOverPending: false,
  pendingWinner: null,
  lastFireTime: 0,
  crystals: [],
};

export {
  FPS,
  explosionDuration,
  INTERPOLATION_DURATION,
  FIRE_COOLDOWN,
  CRYSTAL_RADIUS,
  CRYSTAL_FADE_DURATION,
  gameState,
};
