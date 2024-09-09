const socket = io();
const svgNS = "http://www.w3.org/2000/svg";

// 全局变量
let gameArea;
let myId;
let players = {};
let bullets = [];
let walls = [];
let maze_info = {};
let wins = {};
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

function drawBullet(x, y) {
  const bullet = createSVGElement("circle", {
    cx: x - maze_info.offset_x,
    cy: y - maze_info.offset_y,
    r: 3,
    fill: "black",
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
  if (!gameArea) {
    console.error("gameArea is not initialized");
    return;
  }
  gameArea.innerHTML = "";

  // 绘制墙壁
  for (let wall of walls) {
    drawWall(wall);
  }

  // 绘制玩家和子弹
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
  for (let bullet of bullets) {
    drawBullet(bullet.x, bullet.y);
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

function joinGame() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();
  if (name) {
    localStorage.setItem("playerName", name);
    socket.emit("player_join", { name: name });
    document.getElementById("joinForm").style.display = "none";
    showPlayerInfo(name);
    document.getElementById("gameInfo").style.display = "flex";
    isGameRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

function showPlayerInfo(name) {
  //   const playerInfo = document.getElementById("playerInfo");
  //   playerInfo.innerHTML = `<span id="playerNameDisplay">${name}</span>`; 取消了玩家名的显示以避免重叠

  // 确保更改名字按钮存在
  let changeNameButton = document.getElementById("changeNameButton");
  if (!changeNameButton) {
    changeNameButton = document.createElement("button");
    changeNameButton.id = "changeNameButton";
    changeNameButton.textContent = "更改名字";
    changeNameButton.onclick = showChangeNameForm;
    changeNameButton.style.marginLeft = "10px"; // 添加左边距
    playerInfo.appendChild(changeNameButton);
  }
}

function showChangeNameForm() {
  document.getElementById("changeNameForm").style.display = "block";
  document.getElementById("newPlayerName").value = "";
  document.getElementById("newPlayerName").focus();
}

function submitNewName() {
  const newName = document.getElementById("newPlayerName").value.trim();
  if (newName) {
    localStorage.setItem("playerName", newName);
    socket.emit("change_name", { name: newName });
    showPlayerInfo(newName);
    document.getElementById("changeNameForm").style.display = "none";
    document.getElementById("gameInfo").style.display = "flex";
    gameArea.style.display = "block";
    isGameRunning = true;
    requestAnimationFrame(gameLoop);
  }
}

function cancelChangeName() {
  document.getElementById("changeNameForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  gameArea.style.display = "block";
  isGameRunning = true;
  requestAnimationFrame(gameLoop);
}

window.onload = function () {
  const savedName = localStorage.getItem("playerName");
  gameArea = document.createElementNS(svgNS, "svg");
  gameArea.id = "gameArea";
  document.getElementById("gameContainer").appendChild(gameArea);

  if (savedName) {
    showPlayerInfo(savedName);
    socket.emit("player_join", { name: savedName });
  } else {
    showJoinForm();
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  console.log("Window loaded, gameArea created");
};

function showJoinForm() {
  document.getElementById("joinForm").style.display = "block";
  document.getElementById("gameInfo").style.display = "none";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("waitingModal").style.display = "none";
  gameState = "not_joined";
}

function showWaitingScreen() {
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "none";
  document.getElementById("waitingModal").style.display = "block";
  gameState = "waiting";
  startWaitingCheck();
}

function startWaitingCheck() {
  waitingInterval = setInterval(() => {
    socket.emit("check_players");
  }, 2000);
}

function stopWaitingCheck() {
  clearInterval(waitingInterval);
}

function startGame() {
  console.log("Starting game");
  document.getElementById("joinForm").style.display = "none";
  document.getElementById("gameInfo").style.display = "flex";
  document.getElementById("gameArea").style.display = "block";
  document.getElementById("waitingModal").style.display = "none";
  gameState = "playing";
  isGameRunning = true;
  if (gameArea) {
    requestAnimationFrame(gameLoop);
  } else {
    console.error("gameArea is not initialized, cannot start game");
  }
}

socket.on("player_joined", (data) => {
  console.log("Player joined event received", data);
  players = data.players;
  walls = data.walls;
  maze_info = data.maze_info;
  wins = data.wins;
  myId = data.id; // 添加这行来设置 myId
  adjustCanvasSize();
  updateScoreBoard();
  if (Object.keys(players).length > 1) {
    startGame();
  } else {
    showWaitingScreen();
    document.getElementById("currentPlayerCount").textContent =
      Object.keys(players).length;
  }
});

socket.on("update_scores", (data) => {
  wins = data;
  updateScoreBoard();
});

socket.on("update_player_count", (data) => {
  const playerCount = document.getElementById("playerCount");
  playerCount.textContent = `在线玩家: ${data.count}`;
  playerCount.title = `在线玩家:\n${data.players.join("\n")}`;
});

function updateScoreBoard() {
  const scoreBoard = document.getElementById("scoreBoard");
  let scoreHtml = "<h3>胜利榜</h3>";
  let sortedPlayers = Object.entries(wins).sort((a, b) => b[1] - a[1]);
  for (let [id, winCount] of sortedPlayers) {
    if (players[id]) {
      scoreHtml += `<p>${players[id].name}: ${winCount}胜</p>`;
    }
  }
  scoreBoard.innerHTML = scoreHtml;
}

socket.on("name_changed", (data) => {
  if (data.id === myId) {
    showPlayerInfo(data.new_name);
  }
  players[data.id].name = data.new_name;
  players[data.id].color = data.new_color;
  updateScoreBoard();
});

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

socket.on("player_updated", (data) => {
  players[data.id] = data.data;
});

socket.on("player_left", (data) => {
  delete players[data.id];
});

socket.on("update_bullets", (data) => {
  bullets = data;
});

socket.on("player_killed", (data) => {
  players[data.id].alive = false;
  explosions.push({ x: data.x, y: data.y, frame: 0 });
  if (data.id === myId) {
    showNotification("你被击中了！游戏结束。");
  }
});

function handleMouseMove(event) {
  const rect = gameArea.getBoundingClientRect();
  const scaleX = gameArea.width.baseVal.value / rect.width;
  const scaleY = gameArea.height.baseVal.value / rect.height;

  mouseX = (event.clientX - rect.left) * scaleX + maze_info.offset_x;
  mouseY = (event.clientY - rect.top) * scaleY + maze_info.offset_y;
}

function handleMouseDown(event) {
  if (event.button === 0) {
    // 左键
    isMoving = true;
  } else if (event.button === 2) {
    // 右键
    socket.emit("fire");
  }
  event.preventDefault();
}

function handleMouseUp(event) {
  if (event.button === 0) {
    // 左键
    isMoving = false;
  }
  event.preventDefault();
}

// 更新事件监听器
document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("contextmenu", (e) => e.preventDefault()); // 防止右键菜单出现

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

function gameLoop(currentTime) {
  if (!isGameRunning) {
    console.log("Game not running");
    return;
  }

  if (!gameArea) {
    console.error("gameArea is not initialized");
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

      socket.emit("player_move", {
        angle: angle,
        moving: isMoving,
      });
    }
    drawPlayers();
  }
  requestAnimationFrame(gameLoop);
}

socket.on("game_over", (data) => {
  setTimeout(() => {
    document.getElementById("winnerName").textContent = data.winner;
    wins = data.wins;
    updateScoreBoard();
    document.getElementById("gameOverModal").style.display = "block";
    isGameRunning = false;
  }, explosionDuration);
});

socket.on("waiting_for_players", (data) => {
  showWaitingScreen();
  document.getElementById("currentPlayerCount").textContent = data.count;
});

socket.on("game_start", () => {
  stopWaitingCheck();
  startGame();
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

socket.on("reconnect", () => {
  const savedName = localStorage.getItem("playerName");
  if (savedName) {
    socket.emit("player_join", { name: savedName });
  } else {
    showJoinForm();
  }
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

// 确字体加载完成后再开始游戏
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

socket.on("player_joined", (data) => {
  players = data.players;
  wins = data.wins;
  updateScoreBoard();
  if (Object.keys(players).length > 1) {
    startGame();
  } else {
    showWaitingScreen();
    document.getElementById("currentPlayerCount").textContent =
      Object.keys(players).length;
  }
});

function showNotification(message, duration = 3000) {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, duration);
}
