const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const host = window.location.hostname;
const port = window.location.port || (protocol === "wss:" ? "443" : "80");

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
let myId;
let players = {};
let bullets = [];
let walls = [];
let maze_info = {};
let wins = {};
let playerLatencies = {};
let isPlayerListVisible = false;
let isGameRunning = false;
const FPS = 60;
let explosions = [];
let lastTime = 0;
const explosionDuration = 500; // 爆炸动画持续时间（毫秒）
let waitingInterval;
let gameState = "not_joined"; // 可能的状态: 'not_joined', 'waiting', 'playing'

// 添加新的全局变量
let mouseX = 0;
let mouseY = 0;
let isMoving = false;
let gameOverTimeout = null;

function measureLatency() {
  const start = Date.now();
  socket.emit("ping", { clientTime: start }, (serverResponse) => {
    const end = Date.now();
    const latency = end - serverResponse.serverTime;
    socket.emit("latency", { latency: latency });
  });
}

socket.on("pong", (data) => {
  const end = Date.now();
  const latency = end - data.clientTime;
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
    fill: alive ? color : "gray",
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
    fill: "white",
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
    fill: "rgba(0, 0, 0, 0.5)",
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
    r: 3, // 恢复原来的大小
    fill: "black", // 改回黑色
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
  console.log("Drawing players", players);
  console.log("Drawing bullets", bullets);
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
      player.alive,
      player.name
    );
  }

  // 绘制子弹
  for (let bullet of bullets) {
    drawBullet(bullet.x, bullet.y);
    console.log(`Drawing bullet at (${bullet.x}, ${bullet.y})`);
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

  setInterval(measureLatency, 5000); // 每5秒测量一次延迟

  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    console.log("Saved name found:", savedName);
    showPlayerInfo(savedName);
    socket.emit("player_join", { name: savedName });
  } else {
    console.log("No saved name, showing join form");
    showJoinForm();
  }

  // 事件监听器添加到 document 而不是 gameArea
  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("mouseup", handleMouseUp);
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  console.log("Mouse event listeners added to document");

  // 将 resizeCanvas 的调用移到这里
  window.addEventListener("resize", resizeCanvas);

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

// 添加这些事件监听器
socket.on("player_joined", (data) => {
  console.log("Player joined event received", data);
  players = data.players;
  walls = data.walls;
  maze_info = data.maze_info;
  wins = data.wins;
  myId = data.id;
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
  document.getElementById("winnerName").textContent = data.winner;
  wins = data.wins;
  updateScoreBoard();
  document.getElementById("gameOverModal").style.display = "block";
  isGameRunning = false;
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

  const deltaTime = currentTime - lastTime;
  if (deltaTime >= 1000 / FPS) {
    lastTime = currentTime;

    if (myId && players[myId]) {
      const player = players[myId];
      const dx = mouseX - player.x;
      const dy = mouseY - player.y;
      const angle = Math.atan2(dy, dx);

      // 立即更新本地玩家的角度
      player.angle = angle;

      console.log("My ID:", myId);
      console.log("Player position:", player.x, player.y);
      console.log("Mouse position:", mouseX, mouseY);
      console.log("Calculated angle:", angle);
      console.log("Is moving:", isMoving);

      socket.emit("player_move", {
        angle: angle,
        moving: isMoving,
      });
    } else {
      console.log(
        "Player not found or myId not set. myId:",
        myId,
        "players:",
        players
      );
    }

    // 每帧都重新绘制所有游戏元素
    drawPlayers();
  }
  requestAnimationFrame(gameLoop);
}

// 修改 handleMouseMove 函数
function handleMouseMove(event) {
  if (!gameArea || !maze_info) {
    console.error("gameArea or maze_info is not initialized");
    return;
  }

  const rect = gameArea.getBoundingClientRect();
  const scaleX = gameArea.width.baseVal.value / rect.width;
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

  console.log("Mouse moved:", mouseX, mouseY);
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

// 确保这个事件监听器被正确添加
document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("contextmenu", (e) => e.preventDefault());

// 修改 handleMouseUp 函数
function handleMouseUp(event) {
  event.preventDefault();
  if (event.button === 0) {
    // 左键
    isMoving = false;
  }
}

// 修改 socket.on("update_bullets") 事件处理器
socket.on("update_bullets", (updatedBullets) => {
  console.log("Received updated bullets:", updatedBullets);
  bullets = updatedBullets;
  drawPlayers(); // 立即重新绘制
});

// 修改 socket.on("player_killed") 事件处理器
socket.on("player_killed", (data) => {
  console.log("Player killed:", data);
  addExplosion(data.x, data.y);
  if (data.id === myId) {
    console.log("You were killed!");
  }
  drawPlayers(); // 重新绘制以更新玩家状态
});

// 修改 addExplosion 函数
function addExplosion(x, y) {
  explosions.push({ x: x, y: y, frame: 0 });
}

socket.on("player_updated", (data) => {
  console.log("Player updated received:", data);
  if (data.id in players) {
    players[data.id] = data.data;
    console.log(
      `Updated player ${data.id} position:`,
      players[data.id].x,
      players[data.id].y
    );
  } else {
    console.log(`Received update for unknown player ${data.id}`);
  }
});

// 修改 showGameOver 函数
function showGameOver(winner) {
  document.getElementById("winnerName").textContent = winner;
  document.getElementById("gameOverModal").style.display = "block";
  isGameRunning = false;
}

// 修改 socket.on("game_over") 事件处理器
socket.on("game_over", (data) => {
  wins = data.wins;
  updateScoreBoard();
  // 游戏结束的提示将在爆炸特效结束后由 player_killed 事件处理
});

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
