const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.hostname;
const port = window.location.port || (protocol === "wss:" ? "443" : "80");

const msgpack = window.msgpack;

const socket = io(`${protocol}//${host}:${port}`, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 5,
});

socket.on("connect_error", (error) => {
  console.error("连接错误:", error);
});
const svgNS = "http://www.w3.org/2000/svg";

// 全局变量
let gameArea;
let myId = null;
let players = {};
let bullets = [];
let walls = [];
let maze_info = {};
let wins = {};
let playerLatencies = {};
let isPlayerListVisible = false;
let isGameRunning = false;
const FPS = 30;
let explosions = [];
let lastTime = performance.now();
const explosionDuration = 500; // 爆炸动画持续时间（毫秒）
let waitingInterval;
let gameState = "not_joined"; // 可能的状态: 'not_joined', 'waiting', 'playing'
let isMoving = false;
let gameOverTimeout = null;
let mouseX = 0;
let mouseY = 0;
//为移动端设备
let touchStartTime = 0;
let touchTimeout = null;
let isTouchMoving = false;

let lastGameState = null;
let currentGameState = null;
let interpolationFactor = 0;
const INTERPOLATION_DURATION = 50; // 插值持续时间（毫秒）
let lastUpdateTime = 0;

let gameOverPending = false;
let pendingWinner = null;

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

socket.on("pong", (data) => {
  const end = performance.now();
  const latency = Math.round(end - data.clientTime);
  socket.emit("latency", { latency: latency });
});

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

function createSVGElement(type, attributes) {
  const element = document.createElementNS(svgNS, type);
  for (const key in attributes) {
    element.setAttribute(key, attributes[key]);
  }
  return element;
}

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

function drawTank(x, y, angle, color, alive, name) {
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
  const turret = createSVGElement("circle", {
    cx: 0,
    cy: 0,
    r: tankSize / 3,
    fill: "#333",
  });
  tankBody.appendChild(turret);

  // 坦克炮管
  const barrelLength = tankSize / 1.2; // 与服务器端的 barrel_length 保持一致
  const barrel = createSVGElement("line", {
    x1: 0,
    y1: 0,
    x2: barrelLength,
    y2: 0,
    stroke: "#333",
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

// 修改 drawBullet 函数
function drawBullet(x, y) {
  const bullet = createSVGElement("circle", {
    cx: x - maze_info.offset_x,
    cy: y - maze_info.offset_y,
    r: 3,
    fill: "black", // 黑色
  });
  gameArea.appendChild(bullet);
}

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
    drawTank(
      player.x,
      player.y,
      player.angle,
      player.color,
      player.alive, // 确保这里传递了 alive 状态
      player.name
    );
  }

  // 绘制子弹
  for (let bullet of bullets) {
    drawBullet(bullet.x, bullet.y);
    // console.log(`Drawing bullet at (${bullet.x}, ${bullet.y})`);
  }

  // 绘制爆炸效果
  for (let explosion of explosions) {
    drawExplosion(explosion.x, explosion.y, explosion.frame);
    explosion.frame++;
    if (explosion.frame > 30) {
      explosions.splice(explosions.indexOf(explosion), 1);
    }
  }
}

// 修改 joinGame 函数
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

// 添加 resizeCanvas 数
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

// 修改 window.onload 函数
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

// 添加新的函数来切换玩家列表的显示
function togglePlayerList() {
  isPlayerListVisible = !isPlayerListVisible;
  const playerList = document.getElementById("playerList");
  playerList.style.display = isPlayerListVisible ? "block" : "none";
  if (isPlayerListVisible) {
    updatePlayerList();
  }
}

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

// 确保 handleEnterKey 函数被定义
function handleEnterKey(event) {
  if (event.key === "Enter") {
    joinGame();
  }
}

// 修改 showJoinForm 函数
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

// 添加这个事件监听器
socket.on("rejoin_game", () => {
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  } else {
    showJoinForm();
  }
});

// 确认字体加载完成后再开始游戏
document.fonts.load('12px "GNU Unifont"').then(() => {
  if (localStorage.getItem("playerName") && gameArea) {
    isGameRunning = true;
    requestAnimationFrame(gameLoop);
  }
});

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
  console.log("Player joined event received", data);
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
  if (players[data.id]) {
    delete players[data.id];
  }
  if (playerLatencies[data.id]) {
    delete playerLatencies[data.id];
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

  if ((isMoving || isTouchMoving) && players[myId]) {
    const player = players[myId];
    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    const angle = Math.atan2(dy, dx);
    socket.emit("player_move", { angle: angle, moving: true });
  }

  //   // 非插值法更新子弹位置
  //   bullets.forEach((bullet) => {
  //     bullet.x += Math.cos(bullet.angle) * bullet.speed * (1 / 60); // 假设 60 FPS
  //     bullet.y += Math.sin(bullet.angle) * bullet.speed * (1 / 60);
  //   });
  drawPlayers();

  // 更新和绘制爆炸
  explosions = explosions.filter((explosion) => {
    const elapsedTime = currentTime - explosion.startTime;
    if (elapsedTime < explosionDuration) {
      explosion.frame = Math.floor((elapsedTime / explosionDuration) * 30);
      return true;
    }
    return false;
  });

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
  for (let id in currentGameState.players) {
    if (!players[id]) {
      players[id] = currentGameState.players[id];
    } else {
      const lastPlayer =
        lastGameState.players[id] || currentGameState.players[id];
      const currentPlayer = currentGameState.players[id];
      players[id].x = lerp(lastPlayer.x, currentPlayer.x, interpolationFactor);
      players[id].y = lerp(lastPlayer.y, currentPlayer.y, interpolationFactor);
      players[id].angle = lerpAngle(
        lastPlayer.angle,
        currentPlayer.angle,
        interpolationFactor
      );
      players[id].alive = currentPlayer.alive;
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
}

function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

function lerpAngle(start, end, factor) {
  const diff = end - start;
  const shortestAngle = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return start + shortestAngle * factor;
}

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

  // 限制鼠标置在游戏区域内
  mouseX = Math.max(
    maze_info.offset_x,
    Math.min(
      gameMouseX + maze_info.offset_x,
      maze_info.offset_x + maze_info.width
    )
  );
  mouseY = Math.max(
    maze_info.offset_y,
    Math.min(
      gameMouseY + maze_info.offset_y,
      maze_info.offset_y + maze_info.height
    )
  );
}

// 修改 handleMouseDown 函数
function handleMouseDown(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键
    isMoving = true;
  } else if (event.button === 2) {
    // 右键
    console.log("Attempting to fire");
    socket.emit("fire");
  }
}

// 添加以下函数来处理触摸事件
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

function handleTouchMove(event) {
  event.preventDefault();
  if (isTouchMoving) {
    const touch = event.touches[0];
    updateTouchPosition(touch);
  }
}

function handleTouchEnd(event) {
  event.preventDefault();
  clearTimeout(touchTimeout);

  if (isTouchMoving) {
    isTouchMoving = false;
    isMoving = false;
    const currentAngle = players[myId] ? players[myId].angle : 0;
    socket.emit("player_move", { angle: currentAngle, moving: false });
  } else if (performance.now() - touchStartTime < 300) {
    // 如果触摸时间小于 300ms，视为单击，触发发射
    console.log("Attempting to fire");
    socket.emit("fire");
  }
}

function updateTouchPosition(touch) {
  const rect = gameArea.getBoundingClientRect();
  const scaleX = gameArea.width.baseVal.value / rect.width;
  const scaleY = gameArea.height.baseVal.value / rect.height;

  // 计算触摸点在游戏区域内的位置
  const gameTouchX = (touch.clientX - rect.left) * scaleX;
  const gameTouchY = (touch.clientY - rect.top) * scaleY;

  // 限制触摸点在游戏区域内
  mouseX = Math.max(
    maze_info.offset_x,
    Math.min(
      gameTouchX + maze_info.offset_x,
      maze_info.offset_x + maze_info.width
    )
  );
  mouseY = Math.max(
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
    const dx = mouseX - player.x;
    const dy = mouseY - player.y;
    const angle = Math.atan2(dy, dx);
    socket.emit("player_move", { angle: angle, moving: true });
  }
}

// 确保这个事件监听器被正确添加
document.addEventListener("mousedown", handleMouseDown);
document.addEventListener(
  "contextmenu",
  function (e) {
    e.preventDefault();
  },
  false
);

// 修改 handleMouseUp 函数
function handleMouseUp(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键
    isMoving = false;
  }
}

socket.on("game_state", (binaryData) => {
  lastGameState = currentGameState;
  currentGameState = msgpack.decode(new Uint8Array(binaryData));
  lastUpdateTime = performance.now();
  interpolationFactor = 0;
});

// socket.on("update_bullets", (updatedBullets) => {
//   bullets = updatedBullets;
//   drawPlayers(); // 立即重新绘制
// });

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

// 修改 addExplosion 函数
function addExplosion(x, y) {
  explosions.push({ x: x, y: y, frame: 0, startTime: performance.now() });
}

socket.on("player_updated", (binaryData) => {
  try {
    // 解码二进制数据
    const data = msgpack.decode(new Uint8Array(binaryData));

    if (data.id in players) {
      players[data.id] = data.data;
    } else {
      console.log(`Received update for unknown player ${data.id}`);
    }
  } catch (error) {
    console.error("Error decoding player update data:", error);
  }
});

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

// 添加这个函数
function showChangeNameForm() {
  console.log("Showing change name form");
  document.getElementById("gameInfo").style.display = "none";
  document.getElementById("changeNameForm").style.display = "block";
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerName").focus();
}

// 添加这个函数
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

// 添加这个函数
function cancelChangeName() {
  console.log("Cancelling name change");
  document.getElementById("changeNameForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
}

// 添加这个事件监听器
socket.on("name_changed", (data) => {
  console.log("Name changed:", data);
  if (data.id === myId) {
    showPlayerInfo(data.new_name);
  }
  players[data.id].name = data.new_name;
  players[data.id].color = data.new_color;
  updateScoreBoard();
});

function checkOrientation() {
  if (window.screen.orientation.type.includes("portrait")) {
    // 竖屏
    document.body.classList.add("portrait");
  } else {
    // 横屏
    document.body.classList.remove("portrait");
  }
}

window.addEventListener("load", checkOrientation);
window.screen.orientation.addEventListener("change", checkOrientation);
