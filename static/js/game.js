// 设置WebSocket协议
const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.hostname;
const port = window.location.port || (protocol === "wss:" ? "443" : "80");

// 引入msgpack库
const msgpack = window.msgpack;

// 建立WebSocket连接
const socket = io(`${protocol}//${host}:${port}`, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
});

// 监听连接错误
socket.on("connect_error", (error) => {
  console.error("连接错误:", error);
});

// 定义SVG命名空间
const svgNS = "http://www.w3.org/2000/svg";

// 全局变量定义
let gameArea; // 游戏区域SVG元素
let myId = null; // 当前玩家ID
let players = {}; // 所有玩家信息
let bullets = []; // 子弹信息
let lasers = []; // 激光信息
let walls = []; // 墙壁信息
let maze_info = {}; // 迷宫信息
let wins = {}; // 胜利次数记录
let playerLatencies = {}; // 玩家延迟信息
let isPlayerListVisible = false; // 玩家列表是否可见
let isGameRunning = false; // 游戏是否正在运行
const FPS = 30; // 帧率
let explosions = []; // 爆炸效果数组
let lastTime = performance.now(); // 上一帧时间
const explosionDuration = 500; // 爆炸动画持续时间（毫秒）
let waitingInterval; // 等待间隔
let gameState = "not_joined"; // 游戏状态: 'not_joined', 'waiting', 'playing'
let isMoving = false; // 玩家是否正在移动
let gameOverTimeout = null; // 游戏结束超时
let targetX = 0; // 目标X坐标
let targetY = 0; // 目标Y坐标

// 移动设备相关变量
let touchStartTime = 0;
let touchTimeout = null;
let isTouchMoving = false;

// 游戏状态插值相关变量
let lastGameState = null;
let currentGameState = null;
let interpolationFactor = 0;
const INTERPOLATION_DURATION = 50; // 插值持续时间（毫秒）
let lastUpdateTime = 0;

// 游戏结束相关变量
let gameOverPending = false;
let pendingWinner = null;

// 射击冷却相关变量
let lastFireTime = 0;
const FIRE_COOLDOWN = 300; // 冷却时间，单位为毫秒

// 水晶相关变量
let crystals = [];
const CRYSTAL_RADIUS = 15;
const CRYSTAL_FADE_DURATION = 1000; // 1秒淡出时间

// 测量延迟函数
function measureLatency() {
  const start = performance.now();
  socket.emit("ping", { clientTime: start }, (serverResponse) => {
    if (serverResponse && serverResponse.serverTime) {
      const end = performance.now();
      const latency = Math.round(end - serverResponse.serverTime);
      socket.emit("latency", { latency: latency });
    }
  });
}

// 处理服务器pong响应
socket.on("pong", (data) => {
  const end = performance.now();
  const latency = Math.round(end - data.clientTime);
  socket.emit("latency", { latency: latency });
});

// 记录元素状态的辅助函数
function logElementState(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    console.log(`Element ${elementId}:`, {
      display: window.getComputedStyle(element).display,
      visibility: window.getComputedStyle(element).visibility,
      zIndex: window.getComputedStyle(element).zIndex,
      position: window.getComputedStyle(element).position,
    });
  } else {
    console.log(`Element ${elementId} not found`);
  }
}

// 创建SVG元素的辅助函数
function createSVGElement(type, attributes) {
  const element = document.createElementNS(svgNS, type);
  for (const key in attributes) {
    element.setAttribute(key, attributes[key]);
  }
  return element;
}

// 绘制墙壁
function drawWall(wall) {
  const wallElement = createSVGElement("rect", {
    x: wall.x - maze_info.offset_x,
    y: wall.y - maze_info.offset_y,
    width: wall.width,
    height: wall.height,
    fill: "black",
  });
  gameArea.appendChild(wallElement);
}

// 绘制坦克
function drawTank(x, y, angle, color, alive, name, hasLaser) {
  const nameBackgroundColor = alive
    ? "rgba(0, 0, 0, 0.5)"
    : "rgba(128, 128, 128, 0.5)";
  const nameTextColor = alive ? "white" : "darkgray";
  const tankSize = 20; // 坦克尺寸
  const tankGroup = createSVGElement("g", {
    transform: `translate(${x - maze_info.offset_x} ${y - maze_info.offset_y})`,
  });

  // 坦克主体（旋转）
  const tankBody = createSVGElement("g", {
    transform: `rotate(${(angle * 180) / Math.PI})`,
  });

  // 坦克主体
  const body = createSVGElement("rect", {
    x: -tankSize / 2,
    y: -tankSize / 2,
    width: tankSize,
    height: tankSize,
    fill: alive ? color : "gray", // 如果玩家死亡，使用灰色
  });
  tankBody.appendChild(body);

  // 坦克履带
  const trackWidth = tankSize * 1.2;
  const trackHeight = tankSize * 0.2;
  const leftTrack = createSVGElement("rect", {
    x: -trackWidth / 2,
    y: -tankSize / 2 - trackHeight / 2,
    width: trackWidth,
    height: trackHeight,
    fill: "#666",
  });
  tankBody.appendChild(leftTrack);

  const rightTrack = createSVGElement("rect", {
    x: -trackWidth / 2,
    y: tankSize / 2 - trackHeight / 2,
    width: trackWidth,
    height: trackHeight,
    fill: "#666",
  });
  tankBody.appendChild(rightTrack);

  // 坦克炮塔
  const turret = createSVGElement(
    hasLaser ? "polygon" : "circle",
    hasLaser
      ? {
          points: calculateHexagonPoints(0, 0, tankSize / 2.5),
          fill: "purple",
        }
      : {
          cx: 0,
          cy: 0,
          r: tankSize / 3,
          fill: "#333",
        }
  );
  tankBody.appendChild(turret);

  // 坦克炮管
  const barrelLength = tankSize / 1.2; // 与服务器端的 barrel_length 保持一致
  const barrel = createSVGElement("line", {
    x1: 0,
    y1: 0,
    x2: hasLaser ? barrelLength / 1.2 : barrelLength,
    y2: 0,
    stroke: hasLaser ? "purple" : "#333",
    "stroke-width": tankSize / 6,
  });
  tankBody.appendChild(barrel);

  tankGroup.appendChild(tankBody);

  // 玩家名字（不旋转）
  const fontSize = tankSize / 2;
  const nameText = createSVGElement("text", {
    x: 0,
    y: -tankSize - 5,
    "text-anchor": "middle",
    fill: nameTextColor,
    "font-size": fontSize,
    "font-family": "GNU Unifont, sans-serif",
  });
  nameText.textContent = name;

  // 计算文本宽度
  gameArea.appendChild(nameText);
  const textWidth = nameText.getBBox().width;
  gameArea.removeChild(nameText);

  // 创建背景矩形，宽度基于文本宽度
  const padding = 4;
  const nameBackground = createSVGElement("rect", {
    x: -textWidth / 2 - padding,
    y: -tankSize - fontSize - padding - 5,
    width: textWidth + padding * 2,
    height: fontSize + padding * 2,
    fill: nameBackgroundColor,
    rx: 2,
    ry: 2,
  });

  tankGroup.appendChild(nameBackground);
  tankGroup.appendChild(nameText);

  gameArea.appendChild(tankGroup);
}

// 绘制子弹
function drawBullet(x, y) {
  const bullet = createSVGElement("circle", {
    cx: x - maze_info.offset_x,
    cy: y - maze_info.offset_y,
    r: 3,
    fill: "black",
  });
  gameArea.appendChild(bullet);
}

// 绘制爆炸效果
function drawExplosion(x, y, frame) {
  const size = 40;
  const maxFrames = 30;
  const explosion = createSVGElement("circle", {
    cx: x - maze_info.offset_x,
    cy: y - maze_info.offset_y,
    r: size * (frame / maxFrames),
    fill: `rgba(255, 100, 0, ${1 - frame / maxFrames})`,
  });
  gameArea.appendChild(explosion);
}

// 绘制所有游戏元素
function drawPlayers() {
  if (!gameArea) {
    console.error("gameArea is not initialized");
    return;
  }
  gameArea.innerHTML = "";

  // 绘制墙壁
  for (let wall of walls) {
    drawWall(wall);
  }

  // 绘制玩家
  for (let id in players) {
    const player = players[id];
    if (player) {
      drawTank(
        player.x,
        player.y,
        player.angle,
        player.color,
        player.alive,
        player.name,
        player.has_laser
      );
    }
  }

  // 绘制子弹
  for (let bullet of bullets) {
    drawBullet(bullet.x, bullet.y);
  }

  // 绘制爆炸
  explosions = explosions.filter((explosion) => {
    const elapsedTime = performance.now() - explosion.startTime;
    if (elapsedTime < explosionDuration) {
      explosion.frame = Math.floor((elapsedTime / explosionDuration) * 30);
      drawExplosion(explosion.x, explosion.y, explosion.frame);
      return true;
    }
    return false;
  });

  // 绘制水晶
  // 绘制并过滤水晶
  crystals = crystals.filter((crystal) => {
    const elapsedTime = performance.now() - crystal.spawnTime;
    if (elapsedTime < 4000) {
      // 如果水晶存在时间少于4秒，正常绘制
      drawCrystal(crystal.x, crystal.y);
      return true;
    } else if (elapsedTime < 5000) {
      // 如果水晶存在时间在4-5秒之间，开始淡出效果
      const fadeProgress = (elapsedTime - 4000) / 1000;
      drawCrystal(crystal.x, crystal.y, 1 - fadeProgress);
      return true;
    }
    // 如果水晶存在时间超过5秒，从数组中移除
    return false;
  });

  drawLaser();
}

// 加入游戏
function joinGame() {
  const nameInput = document.getElementById("playerName");
  if (!nameInput) {
    console.error("Player name input not found");
    return;
  }
  const name = nameInput.value.trim();
  console.log("Attempting to join game with name:", name);
  if (name) {
    console.log("Joining game with name:", name);
    localStorage.setItem("playerName", name);
    socket.emit("player_join", { name: name });
    document.getElementById("joinForm").style.display = "none";
    showPlayerInfo(name);
    document.getElementById("gameInfo").style.display = "flex";
  } else {
    console.log("Name is empty, cannot join game");
    alert("请输入有效的名字");
  }
}

// 调整画布大小
function resizeCanvas() {
  if (maze_info && maze_info.width && maze_info.height) {
    const scale = Math.min(
      window.innerWidth / maze_info.width,
      window.innerHeight / maze_info.height
    );
    gameArea.setAttribute("width", maze_info.width * scale);
    gameArea.setAttribute("height", maze_info.height * scale);
  }
}

// 页面加载完成后的初始化
window.onload = function () {
  setInterval(measureLatency, 5000); // 每5秒测量一次延迟

  console.log("Window loaded");
  gameArea = document.createElementNS(svgNS, "svg");
  gameArea.id = "gameArea";
  document.getElementById("gameContainer").appendChild(gameArea);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Tab") {
      event.preventDefault();
      togglePlayerList();
    }
  });

  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    console.log("Saved name found:", savedName);
    showPlayerInfo(savedName);
    socket.emit("player_join", { name: savedName }); //改为rejoin？
  } else {
    console.log("No saved name, showing join form");
    showJoinForm();
  }

  // 事件监听器添加到 document 而不是 gameArea
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  gameArea.addEventListener("touchstart", handleTouchStart);
  gameArea.addEventListener("touchmove", handleTouchMove);
  gameArea.addEventListener("touchend", handleTouchEnd);

  console.log("Mouse event listeners added to document");

  // 将 resizeCanvas 的调用移到这里
  window.addEventListener("resize", resizeCanvas);

  // 添加屏幕方向变化监听
  window.addEventListener("orientationchange", resizeCanvas);

  // 初始调用 resizeCanvas
  resizeCanvas();

  const joinButton = document.getElementById("joinButton");
  const playerNameInput = document.getElementById("playerName");
  if (playerNameInput) {
    playerNameInput.addEventListener("keypress", handleEnterKey);
    console.log("Player name input event listener added");

    // 添加焦点和点击事件监听器
    playerNameInput.addEventListener("focus", function () {
      console.log("Input field focused");
    });
    playerNameInput.addEventListener("click", function () {
      console.log("Input field clicked");
    });

    // 尝试自动聚焦输入框
    setTimeout(() => {
      playerNameInput.focus();
      console.log("Attempted to focus input field");
    }, 500);
  } else {
    console.error("Player name input not found");
  }

  if (joinButton) {
    joinButton.addEventListener("click", joinGame);
    console.log("Join button event listener added");
  } else {
    console.error("Join button not found");
  }

  if (playerNameInput) {
    playerNameInput.addEventListener("keypress", handleEnterKey);
    console.log("Player name input event listener added");
  } else {
    console.error("Player name input not found");
  }

  // 添加这些调试日志
  logElementState("joinForm");
  logElementState("playerName");
  logElementState("joinButton");

  // 添加更改名字相关的事件监听器
  document
    .getElementById("changeNameButton")
    .addEventListener("click", showChangeNameForm);
  document
    .getElementById("newPlayerName")
    .addEventListener("keypress", function (event) {
      if (event.key === "Enter") {
        submitNewName();
      }
    });

  console.log("Window onload complete");
};

// 切换玩家列表显示
function togglePlayerList() {
  isPlayerListVisible = !isPlayerListVisible;
  const playerList = document.getElementById("playerList");
  playerList.style.display = isPlayerListVisible ? "block" : "none";
  if (isPlayerListVisible) {
    updatePlayerList();
  }
}

// 更新玩家列表
function updatePlayerList() {
  const playerList = document.getElementById("playerList");
  let listHtml = "<h3>在线玩家</h3>";
  for (let id in players) {
    const latency =
      playerLatencies[id] !== undefined ? playerLatencies[id] : "未知";
    listHtml += `<p>${players[id].name}: ${latency}ms</p>`;
  }
  playerList.innerHTML = listHtml;
}

// 处理回车键
function handleEnterKey(event) {
  if (event.key === "Enter") {
    joinGame();
  }
}

// 显示加入游戏表单
function showJoinForm() {
  console.log("Showing join form");
  const joinForm = document.getElementById("joinForm");
  const gameInfo = document.getElementById("gameInfo");
  const gameArea = document.getElementById("gameArea");
  const waitingModal = document.getElementById("waitingModal");

  if (joinForm) joinForm.style.display = "block";
  if (gameInfo) gameInfo.style.display = "none";
  if (gameArea) gameArea.style.display = "none";
  if (waitingModal) waitingModal.style.display = "none";

  gameState = "not_joined";

  // 添加这些调试日志
  logElementState("joinForm");
  logElementState("playerName");
  logElementState("joinButton");
}

socket.on("game_start", () => {
  console.log("Game started");
  document.getElementById("waitingModal").style.display = "none";
  document.getElementById("gameInfo").style.display = "block";
  updatePlayerList(); // 添加这行
});

socket.on("waiting_for_players", () => {
  showWaitingScreen();
});

// 添加这个事件监听器
socket.on("rejoin_game", () => {
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  } else {
    showJoinForm();
  }
});

// // 确认字体加载完成后再开始游戏
// document.fonts.load('12px "GNU Unifont"').then(() => {
//   if (localStorage.getItem("playerName") && gameArea) {
//     isGameRunning = true;
//     requestAnimationFrame(gameLoop);
//   }
// });

function restartGame() {
  console.log("Restarting game...");
  socket.emit("restart_game");
  document.getElementById("gameOverModal").style.display = "none";
}

// 在文件末尾添加这个事件监听器
document.addEventListener("DOMContentLoaded", () => {
  const restartButton = document
    .getElementById("gameOverModal")
    .querySelector("button");
  if (restartButton) {
    restartButton.addEventListener("click", restartGame);
  }
});

socket.on("game_reset", (data) => {
  walls = data.walls;
  maze_info = data.maze_info;
  players = {};
  bullets = [];
  crystals = [];
  wins = data.wins;
  adjustCanvasSize();
  updateScoreBoard();
  document.getElementById("gameOverModal").style.display = "none";
  document.getElementById("waitingModal").style.display = "none";

  // 重新加入游戏
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  }
});

// 修改 "player_joined" 事件处理函数
socket.on("player_joined", (data) => {
  players = data.players;
  walls = data.walls;
  maze_info = data.maze_info;
  wins = data.wins;

  // 只在 myId 为 null 时设置它
  if (myId === null) {
    myId = data.id;
    console.log("myId set to:", myId);
  }

  adjustCanvasSize();
  updateScoreBoard();
  if (Object.keys(players).length > 1) {
    startGame();
  } else {
    showWaitingScreen();
    document.getElementById("currentPlayerCount").textContent =
      Object.keys(players).length;
  }
  playerLatencies = data.latencies || {};
  updatePlayerList();
});

socket.on("update_latencies", (latencies) => {
  playerLatencies = latencies;
  if (isPlayerListVisible) {
    updatePlayerList();
  }
});

socket.on("player_left", (data) => {
  console.log("Player left:", data.id);

  if (playerLatencies[data.id]) {
    delete playerLatencies[data.id];
  }
  if (players[data.id]) {
    delete players[data.id];
    console.log("Player removed from local data");
  } else {
    console.log("Player not found in local data");
  }
  updatePlayerList();
  drawPlayers(); // 重新绘制游戏画面
});

socket.on("update_player_count", (data) => {
  const playerCount = document.getElementById("playerCount");
  playerCount.textContent = `在线玩家: ${data.count}`;
  playerCount.title = `在线玩家:\n${data.players.join("\n")}`;
  playerLatencies = data.latencies || {}; // 更新延迟信息
  if (isPlayerListVisible) {
    updatePlayerList();
  }
});

socket.on("game_over", (data) => {
  console.log("游戏结束:", data);
  wins = data.wins;
  updateScoreBoard();

  // 检查是否有正在进行的爆炸动画
  if (explosions.length > 0) {
    gameOverPending = true;
    pendingWinner = data.winner;
  } else {
    showGameOver(data.winner);
  }
});

// 添加 showPlayerInfo 数
function showPlayerInfo(name) {
  const playerNameDisplay = document.getElementById("playerNameDisplay");
  if (playerNameDisplay) {
    playerNameDisplay.textContent = name;
  } else {
    console.error("Player name display element not found");
  }
}

// 添加 updateScoreBoard 函数
function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) {
    let scoreHtml = "<h3>胜利榜</h3>";
    let sortedPlayers = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    for (let [id, winCount] of sortedPlayers) {
      if (players[id]) {
        scoreHtml += `<p>${players[id].name}: ${winCount}胜</p>`;
      }
    }
    scoreBoard.innerHTML = scoreHtml;
  } else {
    console.error("Score board element not found");
  }
}

// 添加 adjustCanvasSize 函数
function adjustCanvasSize() {
  if (maze_info && maze_info.width && maze_info.height) {
    gameArea.setAttribute("width", maze_info.width);
    gameArea.setAttribute("height", maze_info.height);
    gameArea.style.position = "absolute";
    gameArea.style.left = "50%";
    gameArea.style.top = "50%";
    gameArea.style.transform = "translate(-50%, -50%)";
  }
}

// 添加 startGame 函数
function startGame() {
  console.log("Starting game");
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("waitingModal").style.display = "none";
  gameState = "playing";
  isGameRunning = true;
  lastTime = performance.now(); // 重置 lastTime
  requestAnimationFrame(gameLoop);
}

// 添加 showWaitingScreen 函
function showWaitingScreen() {
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("waitingModal").style.display = "block";
  gameState = "waiting";
}

// 修改 game_state 事件处理
socket.on("game_state", (binaryData) => {
  try {
    const decodedData = msgpack.decode(new Uint8Array(binaryData));
    lastGameState = currentGameState;
    currentGameState = decodedData;
    lastUpdateTime = performance.now();
    interpolationFactor = 0;

    lasers = currentGameState.lasers;
    // 移除不再存在的水晶
    crystals = crystals.filter((crystal) =>
      currentGameState.crystals.some(
        (serverCrystal) =>
          serverCrystal.x === crystal.x && serverCrystal.y === crystal.y
      )
    );
  } catch (error) {
    console.error("Error decoding game state:", error);
  }
});

// 修改 gameLoop 函数
function gameLoop(currentTime) {
  if (!isGameRunning || !gameArea) {
    console.log("Game not running or gameArea not initialized");
    return;
  }

  requestAnimationFrame(gameLoop);

  if (lastGameState && currentGameState) {
    interpolationFactor = Math.min(
      1,
      (currentTime - lastUpdateTime) / INTERPOLATION_DURATION
    );
    updateGameState();
  }

  // 检查玩家是否正在移动（通过鼠标或触摸）且玩家存在
  if ((isMoving || isTouchMoving) && players[myId]) {
    const player = players[myId];
    // 计算玩家当前位置到目标位置的水平和垂直距离
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    // 计算玩家到目标位置的直线距离
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    // 计算玩家到目标位置的角度
    const angle = Math.atan2(dy, dx);

    if (distanceToTarget > 5) {
      // 如果距离目标还有一定距离，继续移动
      socket.emit("player_move", { angle: angle, moving: true });
    } else {
      // 如果已经接近目标，停止移动
      isMoving = false;
      isTouchMoving = false;
      socket.emit("player_move", { angle: angle, moving: false });
    }
  }

  drawPlayers();

  // 检查是否所有爆炸动画都已结束，且有待处理的游戏结束事件
  if (gameOverPending && explosions.length === 0) {
    showGameOver(pendingWinner);
    gameOverPending = false;
    pendingWinner = null;
  }
}

function updateGameState() {
  if (!lastGameState) {
    lastGameState = currentGameState;
  }

  try {
    // 遍历当前游戏状态中的所有玩家
    for (let id in currentGameState.players) {
      // 如果本地玩家对象中不存在该玩家，直接添加
      if (!players[id]) {
        players[id] = currentGameState.players[id];
      } else {
        // 获取上一帧的玩家状态，如果不存在则使用当前状态
        const lastPlayer =
          lastGameState.players[id] || currentGameState.players[id];
        // 获取当前帧的玩家状态
        const currentPlayer = currentGameState.players[id];

        // 使用线性插值计算玩家的 X 坐标
        players[id].x = lerp(
          lastPlayer.x,
          currentPlayer.x,
          interpolationFactor
        );

        // 使用线性插值计算玩家的 Y 坐标
        players[id].y = lerp(
          lastPlayer.y,
          currentPlayer.y,
          interpolationFactor
        );

        // 使用角度插值计算玩家的旋转角度
        players[id].angle = lerpAngle(
          lastPlayer.angle,
          currentPlayer.angle,
          interpolationFactor
        );

        // 更新玩家的存活状态
        players[id].alive = currentPlayer.alive;

        // 更新玩家是否拥有激光武器
        players[id].has_laser = currentPlayer.has_laser;
      }
    }

    bullets = currentGameState.bullets.map((currentBullet) => {
      const lastBullet = lastGameState.bullets.find(
        (b) => b.id === currentBullet.id
      );
      if (lastBullet) {
        return {
          x: lerp(lastBullet.x, currentBullet.x, interpolationFactor),
          y: lerp(lastBullet.y, currentBullet.y, interpolationFactor),
          angle: currentBullet.angle,
          speed: currentBullet.speed,
          id: currentBullet.id,
        };
      } else {
        return currentBullet;
      }
    });

    lasers = currentGameState.lasers;

    // 删除不再存在的玩家
    for (let id in players) {
      if (!currentGameState.players[id]) {
        delete players[id];
        console.log(`玩家 ${id} 已从游戏中移除`);
      }
    }
  } catch (error) {
    console.error("Error updating game state:", error);
  }
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(start, end, factor) {
  const diff = end - start;
  const shortestAngle = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return start + shortestAngle * factor;
}

// 添加绘制水晶的函数
function drawCrystal(x, y, opacity = 1) {
  const crystal = createSVGElement("polygon", {
    points: calculateHexagonPoints(
      x - maze_info.offset_x,
      y - maze_info.offset_y,
      CRYSTAL_RADIUS
    ),
    fill: `rgba(128, 0, 128, ${opacity})`,
  });
  gameArea.appendChild(crystal);
}

// 添加计算六边形顶点的函数
function calculateHexagonPoints(centerX, centerY, radius) {
  let points = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function drawLaser() {
  // 首先，移除所有现有的激光元素
  // const existingLasers = gameArea.querySelectorAll(".laser");
  // existingLasers.forEach((laser) => laser.remove());

  lasers.forEach((laser) => {
    const laserGroup = createSVGElement("g", { class: "laser" });

    // 创建激光路径
    const pathData =
      `M${laser.x - maze_info.offset_x},${laser.y - maze_info.offset_y} ` +
      laser.reflected_points
        .map(
          (point) =>
            `L${point[0] - maze_info.offset_x},${point[1] - maze_info.offset_y}`
        )
        .join(" ");

    const laserPath = createSVGElement("path", {
      d: pathData,
      stroke: "mediumblue",
      "stroke-width": "3",
      fill: "none",
    });

    laserGroup.appendChild(laserPath);

    // 在每个反射点绘制一个小圆
    laser.reflected_points.forEach((point) => {
      const reflectionPoint = createSVGElement("circle", {
        cx: point[0] - maze_info.offset_x,
        cy: point[1] - maze_info.offset_y,
        r: "3",
        fill: "white",
      });
      laserGroup.appendChild(reflectionPoint);
    });

    gameArea.appendChild(laserGroup);
  });
}

// 添加新的 socket 事件监听器
socket.on("crystal_spawned", (data) => {
  console.log("Crystal spawned:", data);
  const newCrystal = {
    x: data.x,
    y: data.y,
    spawnTime: performance.now(),
  };
  crystals.push(newCrystal);
  console.log("Crystals after spawn:", crystals);
});

socket.on("crystal_collected", (data) => {
  console.log("Crystal collected:", data);
  crystals = crystals.filter(
    (crystal) => crystal.x !== data.x || crystal.y !== data.y
  );
  console.log("Crystals after collection:", crystals);
});

// 修改 handleMouseMove 函数
function handleMouseMove(event) {
  if (!gameArea || !maze_info) {
    console.error("gameArea or maze_info is not initialized");
    return;
  }

  // 这段代码用于获取游戏区域的位置和缩放比例
  // 获取游戏区域元素的边界矩形
  const rect = gameArea.getBoundingClientRect();
  // 计算游戏区域在水平方向的缩放比例
  const scaleX = gameArea.width.baseVal.value / rect.width;
  // 计算游戏区域在垂直方向的缩放比例
  const scaleY = gameArea.height.baseVal.value / rect.height;

  // 计算鼠标在游戏区域内的位置
  const gameMouseX = (event.clientX - rect.left) * scaleX;
  const gameMouseY = (event.clientY - rect.top) * scaleY;

  targetX = Math.max(
    maze_info.offset_x,
    Math.min(
      gameMouseX + maze_info.offset_x,
      maze_info.offset_x + maze_info.width
    )
  );
  targetY = Math.max(
    maze_info.offset_y,
    Math.min(
      gameMouseY + maze_info.offset_y,
      maze_info.offset_y + maze_info.height
    )
  );
}

// 处理鼠标按下事件
function handleMouseDown(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键按下
    isMoving = true;
    handleMouseMove(event); // 立即更新目标位置
  } else if (event.button === 2) {
    // 右键按下
    const currentTime = performance.now();
    if (currentTime - lastFireTime >= FIRE_COOLDOWN) {
      console.log("Attempting to fire");
      socket.emit("fire");
      lastFireTime = currentTime;
    } else {
      console.log("Fire on cooldown");
    }
  }
}

// 处理鼠标松开事件
function handleMouseUp(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键松开
    isMoving = false;
    socket.emit("player_move", { moving: 0 });
    console.log("鼠标已松开");
  }
}

// 处理触摸开始事件
function handleTouchStart(event) {
  event.preventDefault();
  const touch = event.touches[0];
  touchStartTime = performance.now();

  // 设置一个定时器，如果超过 300ms 没有触发 touchend，就认为是长按
  touchTimeout = setTimeout(() => {
    isTouchMoving = true;
    updateTouchPosition(touch);
  }, 300);
}

// 处理触摸移动事件
function handleTouchMove(event) {
  event.preventDefault();
  if (isTouchMoving) {
    const touch = event.touches[0];
    updateTouchPosition(touch);
  }
}

// 处理触摸结束事件
function handleTouchEnd(event) {
  event.preventDefault();
  clearTimeout(touchTimeout);

  if (isTouchMoving) {
    // 如果是移动状态，停止移动
    isTouchMoving = false;
    isMoving = false;
    const currentAngle = players[myId] ? players[myId].angle : 0;
    socket.emit("player_move", { angle: currentAngle, moving: false });
  } else if (performance.now() - touchStartTime < 300) {
    // 如果触摸时间小于 300ms，视为单击，触发发射
    const currentTime = performance.now();
    if (currentTime - lastFireTime >= FIRE_COOLDOWN) {
      console.log("Attempting to fire");
      socket.emit("fire");
      lastFireTime = currentTime;
    } else {
      console.log("Fire on cooldown");
    }
  }
}

// 更新触摸位置
function updateTouchPosition(touch) {
  const rect = gameArea.getBoundingClientRect();
  const scaleX = gameArea.width.baseVal.value / rect.width;
  const scaleY = gameArea.height.baseVal.value / rect.height;

  // 计算触摸点在游戏区域内的位置
  const gameTouchX = (touch.clientX - rect.left) * scaleX;
  const gameTouchY = (touch.clientY - rect.top) * scaleY;

  // 限制触摸点在游戏区域内
  targetX = Math.max(
    maze_info.offset_x,
    Math.min(
      gameTouchX + maze_info.offset_x,
      maze_info.offset_x + maze_info.width
    )
  );
  targetY = Math.max(
    maze_info.offset_y,
    Math.min(
      gameTouchY + maze_info.offset_y,
      maze_info.offset_y + maze_info.height
    )
  );

  // 触发移动
  isMoving = true;
  if (players[myId]) {
    const player = players[myId];
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const angle = Math.atan2(dy, dx);
    socket.emit("player_move", { angle: angle, moving: true });
  }
}

// 阻止右键菜单弹出
document.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);

// 处理玩家被击杀事件
socket.on("player_killed", (data) => {
  console.log("Player killed:", data);
  if (players[data.id]) {
    players[data.id].alive = false; // 更新玩家状态！！！
  }
  addExplosion(data.x, data.y);
  if (data.id === myId) {
    console.log("You were killed!");
    isMoving = false;
    socket.emit("player_move", { angle: 0, moving: false });
  }
  drawPlayers(); // 重新绘制以更新玩家状态
});

// 添加爆炸效果
function addExplosion(x, y) {
  explosions.push({ x: x, y: y, frame: 0, startTime: performance.now() });
}

// 显示游戏结束界面
function showGameOver(winner) {
  const gameOverModal = document.getElementById("gameOverModal");
  const winnerNameElement = document.getElementById("winnerName");

  if (winnerNameElement) {
    winnerNameElement.textContent = winner;
  }

  if (gameOverModal) {
    gameOverModal.style.display = "block";
  }

  isGameRunning = false;
}

// 显示更改名字表单
function showChangeNameForm() {
  console.log("Showing change name form");
  document.getElementById("gameInfo").style.display = "none";
  document.getElementById("changeNameForm").style.display = "block";
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerName").focus();
}

// 提交新名字
function submitNewName() {
  const newName = document.getElementById("newPlayerName").value.trim();
  if (newName) {
    console.log("Submitting new name:", newName);
    localStorage.setItem("playerName", newName);
    socket.emit("change_name", { name: newName });
    showPlayerInfo(newName);
    document.getElementById("changeNameForm").style.display = "none";
    document.getElementById("gameInfo").style.display = "flex";
  } else {
    alert("请输入有效的名字");
  }
}

// 取消更改名字
function cancelChangeName() {
  console.log("Cancelling name change");
  document.getElementById("changeNameForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
}

// 处理名字更改事件
socket.on("name_changed", (data) => {
  console.log("Name changed:", data);
  if (data.id === myId) {
    showPlayerInfo(data.new_name);
  }
  players[data.id].name = data.new_name;
  players[data.id].color = data.new_color;
  updateScoreBoard();
});

// 检查设备方向
function checkOrientation() {
  if (window.screen.orientation.type.includes("portrait")) {
    // 竖屏
    document.body.classList.add("portrait");
  } else {
    // 横屏
    document.body.classList.remove("portrait");
  }
}

// 添加页面加载和方向变化事件监听器
window.addEventListener("load", checkOrientation);
window.addEventListener("orientationchange", checkOrientation);

// 页面卸载前断开socket连接
window.addEventListener("beforeunload", () => {
  socket.disconnect();
});
